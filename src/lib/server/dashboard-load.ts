import { biobanksOverview, getDatasets, getStats, tenantStats } from '$lib/server/db/queries';

export async function loadDashboard(db: NonNullable<App.Locals['db']>, scope: string | null) {
	const datasetRows = await getDatasets(db, scope);
	const datasets = datasetRows.map((d) => ({ id: d.id, slug: d.slug, ...d.metadata }));

	const cached = await getStats(db, `home:${scope ?? 'global'}`);
	if (cached) return { ...cached, datasets };

	const biobanks = await biobanksOverview(db, scope);
	const stats = await tenantStats(db, scope);
	const populations = biobanks.flatMap((b) =>
		b.populations.map((p) => ({ ...p, biobankSlug: b.slug, biobankName: b.name }))
	);

	return {
		biobanks,
		populations,
		datasets,
		totals: {
			participants: populations.reduce((s, p) => s + p.sampleCount, 0),
			datasetCount: datasets.length,
			variants: stats.variants,
			populations: populations.length
		},
		variantClasses: { common: stats.common, lowFreq: stats.lowFreq, rare: stats.rare }
	};
}
