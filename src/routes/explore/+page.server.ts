import { error } from '@sveltejs/kit';
import { exploreFilterOptions, getDatasets, showGenotypeCounts } from '$lib/server/db/queries';
import { explorerDisplay } from '$lib/explorer';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const db = locals.db;
	if (!db) throw error(500, 'PostgreSQL connection unavailable');

	const filters = await exploreFilterOptions(db, locals.tenant.scope);
	const datasets = await getDatasets(db, locals.tenant.scope);
	return {
		...filters,
		datasets: datasets.map((dataset) => ({ id: dataset.id, slug: dataset.slug, ...dataset.metadata })),
		q: url.searchParams.get('q') ?? '',
		showGenotypeCounts: await showGenotypeCounts(db, locals.tenant.scope),
		display: explorerDisplay(locals.tenant.slug)
	};
};
