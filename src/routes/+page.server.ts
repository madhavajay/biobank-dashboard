import { error } from '@sveltejs/kit';
import { biobanksOverview, tenantStats, getDatasets } from '$lib/server/db/queries';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, platform }) => {
	const db = platform?.env?.DB;
	if (!db) throw error(500, 'D1 binding unavailable — run with wrangler/vite dev');

	const scope = locals.tenant.scope;
	const biobanks = await biobanksOverview(db, scope);
	const stats = await tenantStats(db, scope);
	const datasetRows = await getDatasets(db, scope);

	const populations = biobanks.flatMap((b) => b.populations.map((p) => ({ ...p, biobankSlug: b.slug, biobankName: b.name })));
	const participants = populations.reduce((s, p) => s + p.sampleCount, 0);

	// dataset cards = JSON metadata (counts baked in at seed time)
	const datasets = datasetRows.map((d) => ({ id: d.id, slug: d.slug, ...d.metadata }));

	return {
		biobanks,
		populations,
		datasets,
		totals: {
			participants,
			datasetCount: datasets.length,
			variants: stats.variants,
			populations: populations.length
		},
		variantClasses: { common: stats.common, lowFreq: stats.lowFreq, rare: stats.rare }
	};
};
