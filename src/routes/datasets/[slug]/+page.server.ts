import { error } from '@sveltejs/kit';
import { datasetProfile } from '$lib/server/db/queries';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	const db = locals.db;
	if (!db) throw error(500, 'PostgreSQL connection unavailable');
	const dataset = await datasetProfile(db, params.slug);
	if (!dataset) throw error(404, 'Dataset not found');
	return { dataset };
};
