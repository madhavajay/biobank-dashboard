import { json, error } from '@sveltejs/kit';
import { searchVariants } from '$lib/server/db/queries';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals, platform }) => {
	const db = platform?.env?.DB;
	if (!db) throw error(500, 'D1 binding unavailable');
	const num = (k: string) => (url.searchParams.has(k) ? Number(url.searchParams.get(k)) : undefined);
	const biobanksParam = url.searchParams.get('biobanks');
	const biobanks = biobanksParam ? biobanksParam.split(',').filter(Boolean) : undefined;
	const match = url.searchParams.get('match') === 'all' ? 'all' : 'any';
	const { rows, total } = await searchVariants(db, locals.tenant.scope, {
		q: url.searchParams.get('q') ?? undefined,
		chrom: num('chrom'),
		posMin: num('posMin'),
		posMax: num('posMax'),
		rsid: num('rsid'),
		afMin: num('afMin'),
		afMax: num('afMax'),
		acMin: num('acMin'),
		acMax: num('acMax'),
		cohorts: url.searchParams.get('cohorts')
			? url.searchParams.get('cohorts')!.split(',').map(Number).filter((n) => !Number.isNaN(n))
			: undefined,
		limit: num('limit'),
		offset: num('offset'),
		biobanks,
		match,
		sort: (url.searchParams.get('sort') as any) ?? undefined,
		dir: url.searchParams.get('dir') === 'desc' ? 'desc' : 'asc'
	});
	const format = url.searchParams.get('format');
	if (format === 'csv') {
		const head = 'variant,rsid,population,af,ac,an\n';
		const body = rows
			.flatMap((v) =>
				v.frequencies.map((f) =>
					`${v.chromName}-${v.pos}-${v.ref}-${v.alt},${v.rsid ? 'rs' + v.rsid : ''},${f.population},${f.af},${f.ac},${f.an}`
				)
			)
			.join('\n');
		return new Response(head + body, {
			headers: { 'content-type': 'text/csv', 'content-disposition': 'attachment; filename="variants.csv"' }
		});
	}
	return json({ tenant: locals.tenant.slug, total, count: rows.length, rows });
};
