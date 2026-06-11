import { json, error } from '@sveltejs/kit';
import { getVariant, buildVrsAllele } from '$lib/server/db/queries';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, url, platform }) => {
	const db = platform?.env?.DB;
	if (!db) throw error(500, 'D1 binding unavailable');
	const v = await getVariant(db, Number(params.id));
	if (!v) throw error(404, 'variant not found');
	if (url.searchParams.get('format') === 'vrs') {
		return json(buildVrsAllele(v));
	}
	return json({ ...v, vrs: buildVrsAllele(v) });
};
