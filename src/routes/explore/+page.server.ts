import { error } from '@sveltejs/kit';
import { exploreFilterOptions, showGenotypeCounts } from '$lib/server/db/queries';
import { explorerDisplay } from '$lib/explorer';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.tenant.slug === 'biovault') return {};

	const db = locals.db;
	if (!db) throw error(500, 'D1 binding unavailable');

	const filters = await exploreFilterOptions(db, locals.tenant.scope);
	return {
		...filters,
		showGenotypeCounts: await showGenotypeCounts(db, locals.tenant.scope),
		display: explorerDisplay(locals.tenant.slug)
	};
};
