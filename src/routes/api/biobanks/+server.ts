import { json, error } from '@sveltejs/kit';
import { biobanksOverview } from '$lib/server/db/queries';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, platform }) => {
	const db = locals.db;
	if (!db) throw error(500, 'PostgreSQL connection unavailable');
	const biobanks = await biobanksOverview(db, locals.tenant.scope);
	return json({ tenant: locals.tenant.slug, biobanks });
};
