import { error } from '@sveltejs/kit';
import { sourceProfile } from '$lib/server/db/queries';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	const db = locals.db;
	if (!db) throw error(500, 'PostgreSQL connection unavailable');
	const source = await sourceProfile(db, params.slug);
	if (!source) throw error(404, 'Source not found');
	return { source };
};
