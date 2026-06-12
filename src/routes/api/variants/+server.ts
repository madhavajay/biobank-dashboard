import { json, error } from '@sveltejs/kit';
import { searchVariants, getStats } from '$lib/server/db/queries';
import type { RequestHandler } from './$types';

// params that, if present, mean this is NOT the default first page → must hit the DB
const FILTER_KEYS = ['q', 'gene', 'chrom', 'posMin', 'posMax', 'rsid', 'afMin', 'afMax', 'acMin', 'acMax', 'cohorts', 'cohortMatch', 'biobanks', 'sort'];

export const GET: RequestHandler = async ({ url, locals, platform }) => {
	const db = platform?.env?.DB;
	if (!db) throw error(500, 'D1 binding unavailable');
	const num = (k: string) => (url.searchParams.has(k) ? Number(url.searchParams.get(k)) : undefined);
	const biobanksParam = url.searchParams.get('biobanks');
	const biobanks = biobanksParam ? biobanksParam.split(',').filter(Boolean) : undefined;
	const match = url.searchParams.get('match') === 'all' ? 'all' : 'any';
	const cohortMatch = url.searchParams.get('cohortMatch') === 'all' ? 'all' : 'any';

	// fast path: unfiltered first page → serve the precomputed `explore:<scope>` cache
	const sp = url.searchParams;
	const isDefault =
		!FILTER_KEYS.some((k) => sp.get(k)) &&
		(num('offset') ?? 0) === 0 &&
		(num('limit') ?? 50) === 50 &&
		sp.get('format') !== 'csv';
	if (isDefault) {
		const cached = await getStats(db, `explore:${locals.tenant.scope ?? 'global'}`);
		if (cached) {
			// gene annotations are baked into the cached rows by the seeder; serve as-is
			return json({ tenant: locals.tenant.slug, total: cached.total, count: cached.rows.length, rows: cached.rows });
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
		cohorts: url.searchParams.get('cohorts')
			? url.searchParams.get('cohorts')!.split(',').map(Number).filter((n) => !Number.isNaN(n))
			: undefined,
		cohortMatch,
		limit: num('limit'),
		offset: num('offset'),
		biobanks,
		match,
		sort: (url.searchParams.get('sort') as any) ?? undefined,
		dir: url.searchParams.get('dir') === 'desc' ? 'desc' : 'asc'
	});
	const format = url.searchParams.get('format');
	if (format === 'csv') {
		const head = 'variant,rsid,genes,population,af,ac,an\n';
		const body = rows
			.flatMap((v) =>
				v.frequencies.map((f) =>
					`${v.chromName}-${v.pos}-${v.ref}-${v.alt},${v.rsid ? 'rs' + v.rsid : ''},"${v.genes.map((g) => g.symbol).join('|')}",${f.population},${f.af},${f.ac},${f.an}`
				)
			)
			.join('\n');
		return new Response(head + body, {
			headers: { 'content-type': 'text/csv', 'content-disposition': 'attachment; filename="variants.csv"' }
		});
	}
	return json({ tenant: locals.tenant.slug, total, count: rows.length, rows });
};
