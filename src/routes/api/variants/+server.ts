import { json, error } from '@sveltejs/kit';
import { searchVariants, getStats, sanitizeVariantRowsForPublic } from '$lib/server/db/queries';
import { ALLELE_COUNT_REPORTING_THRESHOLD } from '$lib/privacy';
import type { RequestHandler } from './$types';

// params that, if present, mean this is NOT an unfiltered listing → must compute its total live.
const FILTER_KEYS = ['q', 'gene', 'chrom', 'posMin', 'posMax', 'rsid', 'afMin', 'afMax', 'acMin', 'acMax', 'vepImpact', 'vepConsequence', 'cohorts', 'cohortMatch', 'biobanks', 'sort'];
const TOTAL_FILTER_KEYS = FILTER_KEYS.filter((key) => key !== 'sort');

export const GET: RequestHandler = async ({ url, locals, platform }) => {
	const db = platform?.env?.DB;
	if (!db) throw error(500, 'D1 binding unavailable');
	const num = (k: string) => (url.searchParams.has(k) ? Number(url.searchParams.get(k)) : undefined);
	const biobanksParam = url.searchParams.get('biobanks');
	const biobanks = biobanksParam ? biobanksParam.split(',').filter(Boolean) : undefined;
	const splitList = (k: string) => url.searchParams.get(k)?.split(',').map((v) => v.trim()).filter(Boolean);
	const match = url.searchParams.get('match') === 'all' ? 'all' : 'any';
	const cohortMatch = url.searchParams.get('cohortMatch') === 'all' ? 'all' : 'any';

	// fast path: unfiltered pagination can reuse the precomputed `explore:<scope>` total.
	const sp = url.searchParams;
	const isUnfilteredDefaultShape =
		!TOTAL_FILTER_KEYS.some((k) => sp.get(k)) &&
		(num('limit') ?? 50) === 50 &&
		sp.get('format') !== 'csv';
	const cachedExplore = isUnfilteredDefaultShape ? await getStats(db, `explore:${locals.tenant.scope ?? 'global'}`) : null;
	if (isUnfilteredDefaultShape && !sp.get('sort') && (num('offset') ?? 0) === 0) {
		if (cachedExplore) {
			// gene annotations are baked into the cached rows by the seeder.
			const rows = sanitizeVariantRowsForPublic(cachedExplore.rows);
			return json({ tenant: locals.tenant.slug, total: cachedExplore.total, count: rows.length, alleleCountReportingThreshold: ALLELE_COUNT_REPORTING_THRESHOLD, rows });
		}
	}
	const { rows, total } = await searchVariants(db, locals.tenant.scope, {
		q: url.searchParams.get('q') ?? undefined,
		chrom: num('chrom'),
		posMin: num('posMin'),
		posMax: num('posMax'),
		rsid: num('rsid'),
		gene: url.searchParams.get('gene') ?? undefined,
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
		limit: num('limit'),
		offset: num('offset'),
		biobanks,
		match,
		sort: (url.searchParams.get('sort') as any) ?? undefined,
		dir: url.searchParams.get('dir') === 'desc' ? 'desc' : 'asc',
		skipTotal: Boolean(cachedExplore),
		totalOverride: cachedExplore?.total
	});
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
	return json({ tenant: locals.tenant.slug, total, count: rows.length, alleleCountReportingThreshold: ALLELE_COUNT_REPORTING_THRESHOLD, rows });
};
