import { error } from '@sveltejs/kit';
import { sourceSummaries } from '$lib/server/db/queries';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const db = locals.db;
	if (!db) throw error(500, 'PostgreSQL connection unavailable');
	return {
		sources: await sourceSummaries(db)
	};
};
