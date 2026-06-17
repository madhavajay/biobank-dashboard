import { json, error } from '@sveltejs/kit';
import { searchVariantStats, tenantStats, getStats, type SearchParams } from '$lib/server/db/queries';
import type { RequestHandler } from './$types';

const FILTER_KEYS = ['q', 'gene', 'country', 'chrom', 'posMin', 'posMax', 'rsid', 'afMin', 'afMax', 'acMin', 'acMax', 'vepImpact', 'vepConsequence', 'cohorts', 'cohortMatch', 'biobanks'];

export const GET: RequestHandler = async ({ url, locals }) => {
	const db = locals.db;
	if (!db) throw error(500, 'D1 binding unavailable');

	const num = (k: string) => (url.searchParams.has(k) ? Number(url.searchParams.get(k)) : undefined);
	const biobanksParam = url.searchParams.get('biobanks');
	const biobanks = biobanksParam ? biobanksParam.split(',').filter(Boolean) : undefined;
	const splitList = (k: string) => url.searchParams.get(k)?.split(',').map((v) => v.trim()).filter(Boolean);
	const match = url.searchParams.get('match') === 'all' ? 'all' : 'any';
	const cohortMatch = url.searchParams.get('cohortMatch') === 'all' ? 'all' : 'any';
	const sp = url.searchParams;

	const searchParams: SearchParams = {
		q: sp.get('q') ?? undefined,
		chrom: num('chrom'),
		posMin: num('posMin'),
		posMax: num('posMax'),
		rsid: num('rsid'),
		gene: sp.get('gene') ?? undefined,
		country: sp.get('country') ?? undefined,
		afMin: num('afMin'),
		afMax: num('afMax'),
		acMin: num('acMin'),
		acMax: num('acMax'),
		vepImpacts: splitList('vepImpact'),
		vepConsequences: splitList('vepConsequence'),
		cohorts: sp.get('cohorts')
			? sp.get('cohorts')!.split(',').map(Number).filter((n) => !Number.isNaN(n))
			: undefined,
		cohortMatch,
		biobanks,
		match
	};

	const isUnfiltered =
		!FILTER_KEYS.some((k) => sp.get(k)) && !sp.get('dataset');
	if (isUnfiltered) {
		const scope = locals.tenant.scope;
		const cached = await getStats(db, `home:${scope ?? 'global'}`);
		if (cached?.totals && cached?.variantClasses) {
			return json({
				variants: cached.totals.variants,
				common: cached.variantClasses.common,
				lowFreq: cached.variantClasses.lowFreq,
				rare: cached.variantClasses.rare
			});
		}
		const stats = await tenantStats(db, scope);
		return json(stats);
	}

	const stats = await searchVariantStats(db, locals.tenant.scope, searchParams);
	return json(stats);
};
