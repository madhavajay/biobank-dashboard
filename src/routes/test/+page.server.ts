import { getDatasets, getStats } from '$lib/server/db/queries';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform }) => {
	const db = platform?.env?.DB;
	if (!db) return { dashboard: null };

	const cached = await getStats(db, 'home:global');
	if (!cached) return { dashboard: null };

	const datasetRows = await getDatasets(db, null);
	const datasets = datasetRows.map((d) => ({ id: d.id, slug: d.slug, ...d.metadata }));

	return {
		dashboard: {
			...cached,
			datasets
		}
	};
};
