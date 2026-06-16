import { error } from '@sveltejs/kit';
import { exploreFilterOptions, showGenotypeCounts } from '$lib/server/db/queries';
import { explorerDisplay, hasExplorerConfig } from '$lib/explorer';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, platform, url }) => {
	const db = platform?.env?.DB;
	if (!db) throw error(500, 'D1 binding unavailable');
	const filters = await exploreFilterOptions(db, locals.tenant.scope);
	return {
		options: filters.options,
		populations: filters.populations,
		q: url.searchParams.get('q') ?? '',
		showGenotypeCounts: await showGenotypeCounts(db, locals.tenant.scope),
		display: hasExplorerConfig(locals.tenant.slug) ? explorerDisplay(locals.tenant.slug) : undefined
	};
};
