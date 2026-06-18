import { json, error } from '@sveltejs/kit';
import { searchVariants, getStats, sanitizeVariantRowsForPublic } from '$lib/server/db/queries';
import { ALLELE_COUNT_REPORTING_THRESHOLD } from '$lib/privacy';
import type { RequestHandler } from './$types';

// params that, if present, mean this is NOT an unfiltered listing → must compute its total live.
const FILTER_KEYS = ['q', 'gene', 'country', 'chrom', 'posMin', 'posMax', 'rsid', 'afMin', 'afMax', 'acMin', 'acMax', 'vepImpact', 'vepConsequence', 'cohorts', 'cohortMatch', 'source', 'biobanks', 'dataset', 'sort'];
const TOTAL_FILTER_KEYS = FILTER_KEYS.filter((key) => key !== 'sort');
const MAX_PAGE_BROWSABLE_ROWS = 10_000;

export const GET: RequestHandler = async ({ url, locals, platform }) => {
	const startedAt = performance.now();
	const db = locals.db;
	if (!db) throw error(500, 'PostgreSQL connection unavailable');
	const num = (k: string) => (url.searchParams.has(k) ? Number(url.searchParams.get(k)) : undefined);
	const biobanksParam = url.searchParams.get('source') ?? url.searchParams.get('biobanks');
	const biobanks = biobanksParam ? biobanksParam.split(',').filter(Boolean) : undefined;
	const splitList = (k: string) => url.searchParams.get(k)?.split(',').map((v) => v.trim()).filter(Boolean);
	const match = url.searchParams.get('match') === 'all' ? 'all' : 'any';
	const cohortMatch = url.searchParams.get('cohortMatch') === 'all' ? 'all' : 'any';
	const offset = Math.max(num('offset') ?? 0, 0);
	const limit = Math.min(Math.max(num('limit') ?? 50, 1), 500);
	const maxOffset = Math.max(MAX_PAGE_BROWSABLE_ROWS - limit, 0);

	if (biobanks?.includes('__none__')) {
		return json({
			tenant: locals.tenant.slug,
			total: 0,
			count: 0,
			alleleCountReportingThreshold: ALLELE_COUNT_REPORTING_THRESHOLD,
			rows: []
		});
	}

	if (offset > maxOffset) {
		return json(
			{
				error: `Offset is too deep for page-number pagination. Add filters/search, or use an offset of ${maxOffset} or less for this limit.`,
				maxOffset,
				maxPageBrowsableRows: MAX_PAGE_BROWSABLE_ROWS
			},
			{
				status: 400,
				headers: {
					'Server-Timing': `total;dur=${(performance.now() - startedAt).toFixed(1)}`,
					'X-BioVault-Query-Path': 'rejected-deep-offset'
				}
			}
		);
	}

	// fast path: unfiltered pagination can reuse the precomputed `explore:<scope>` total.
	const sp = url.searchParams;
	const bypassStatsCache = sp.get('__cache') === 'skip';
	const isUnfilteredDefaultShape =
		!bypassStatsCache &&
		!TOTAL_FILTER_KEYS.some((k) => sp.get(k)) &&
		limit === 50 &&
		sp.get('format') !== 'csv';
	const statsStartedAt = performance.now();
	const cachedExplore = isUnfilteredDefaultShape ? await getStats(db, `explore:${locals.tenant.scope ?? 'global'}`) : null;
	const statsMs = performance.now() - statsStartedAt;
	if (isUnfilteredDefaultShape && !sp.get('sort') && offset === 0) {
		if (cachedExplore) {
			// gene annotations are baked into the cached rows by the seeder.
			const rows = sanitizeVariantRowsForPublic(cachedExplore.rows);
			return json(
				{ tenant: locals.tenant.slug, total: cachedExplore.total, count: rows.length, alleleCountReportingThreshold: ALLELE_COUNT_REPORTING_THRESHOLD, rows },
				{
					headers: {
						'Server-Timing': `stats;dur=${statsMs.toFixed(1)}, total;dur=${(performance.now() - startedAt).toFixed(1)}`,
						'X-BioVault-Query-Path': 'stats-cache'
					}
				}
			);
		}
	}
	const searchStartedAt = performance.now();
	const { rows, total } = await searchVariants(db, locals.tenant.scope, {
		q: url.searchParams.get('q') ?? undefined,
		chrom: num('chrom'),
		posMin: num('posMin'),
		posMax: num('posMax'),
		rsid: num('rsid'),
		gene: url.searchParams.get('gene') ?? undefined,
		country: url.searchParams.get('country') ?? undefined,
		dataset: url.searchParams.get('dataset') ?? undefined,
		afMin: num('afMin'),
		afMax: num('afMax'),
		acMin: num('acMin'),
		acMax: num('acMax'),
		vepImpacts: splitList('vepImpact'),
		vepConsequences: splitList('vepConsequence'),
		cohorts: url.searchParams.get('cohorts')
			? url.searchParams.get('cohorts')!.split(',').map(Number).filter((n) => !Number.isNaN(n))
			: undefined,
		cohortMatch,
		limit,
		offset,
		biobanks,
		match,
		sort: (url.searchParams.get('sort') as any) ?? undefined,
		dir: url.searchParams.get('dir') === 'desc' ? 'desc' : 'asc',
		skipTotal: Boolean(cachedExplore),
		totalOverride: cachedExplore?.total
	});
	const searchMs = performance.now() - searchStartedAt;
	const format = url.searchParams.get('format');
	if (format === 'csv') {
		const head = 'variant,rsid,genes,vep_label,vep_impact,hgvs_consequence,population,af,ac,an,masked,af_upper_bound,ac_upper_bound\n';
		const body = rows
			.flatMap((v) =>
				v.frequencies.map((f) =>
					`${v.chromName}-${v.pos}-${v.ref}-${v.alt},${v.rsid ? 'rs' + v.rsid : ''},"${v.genes.map((g) => g.symbol).join('|')}","${v.vepLabel ?? ''}",${v.vepImpact ?? ''},${v.hgvsConsequence ?? ''},${f.population},${f.af ?? ''},${f.ac ?? ''},${f.an},${f.acMasked ? 1 : 0},${f.afUpperBound ?? ''},${f.acUpperBound ?? ''}`
				)
			)
			.join('\n');
		return new Response(head + body, {
			headers: { 'content-type': 'text/csv', 'content-disposition': 'attachment; filename="variants.csv"' }
		});
	}
	return json(
		{ tenant: locals.tenant.slug, total, count: rows.length, alleleCountReportingThreshold: ALLELE_COUNT_REPORTING_THRESHOLD, rows },
		{
			headers: {
				'Server-Timing': `stats;dur=${statsMs.toFixed(1)}, search;dur=${searchMs.toFixed(1)}, total;dur=${(performance.now() - startedAt).toFixed(1)}`,
				'X-BioVault-Query-Path': cachedExplore ? 'live-query-cached-total' : isUnfilteredDefaultShape ? 'live-query-cache-miss' : 'live-query'
			}
		}
	);
};
