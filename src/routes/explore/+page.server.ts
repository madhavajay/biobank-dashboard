import { error, redirect } from '@sveltejs/kit';
import { exploreFilterOptions, showGenotypeCounts } from '$lib/server/db/queries';
import { explorerDisplay } from '$lib/explorer';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (locals.tenant.slug === 'biovault') {
		throw redirect(307, `/${url.search}`);
	}

	const db = locals.db;
	if (!db) throw error(500, 'D1 binding unavailable');

	const filters = await exploreFilterOptions(db, locals.tenant.scope);
	return {
		...filters,
		q: url.searchParams.get('q') ?? '',
		showGenotypeCounts: await showGenotypeCounts(db, locals.tenant.scope),
		display: explorerDisplay(locals.tenant.slug)
	};
};
