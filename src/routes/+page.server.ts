import { error } from '@sveltejs/kit';
import { exploreFilterOptions, showGenotypeCounts } from '$lib/server/db/queries';
import { loadDashboard } from '$lib/server/dashboard-load';
import { explorerDisplay } from '$lib/explorer';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const db = locals.db;
	if (!db) throw error(500, 'PostgreSQL connection unavailable — check DATABASE_URL or Hyperdrive');

	const scope = locals.tenant.scope;
	const [dashboard, filters] = await Promise.all([
		loadDashboard(db, scope),
		exploreFilterOptions(db, scope)
	]);

	return {
		dashboard,
		options: filters.options,
		populations: filters.populations,
		showGenotypeCounts: await showGenotypeCounts(db, scope),
		display: explorerDisplay(locals.tenant.slug)
	};
};
