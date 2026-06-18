import { error } from '@sveltejs/kit';
import { biobanksOverview, tenantStats, getDatasets, getStats } from '$lib/server/db/queries';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, platform }) => {
	if (locals.tenant.slug === 'biovault') return {};

	const db = locals.db;
	if (!db) throw error(500, 'PostgreSQL connection unavailable — check DATABASE_URL or Hyperdrive');

	const scope = locals.tenant.scope;
	const datasetRows = await getDatasets(db, scope);
	const datasets = datasetRows.map((d) => ({ id: d.id, slug: d.slug, ...d.metadata }));

	// fast path: precomputed home payload from the stats cache (no live aggregation)
	const cached = await getStats(db, `home:${scope ?? 'global'}`);
	if (cached) {
		return { ...cached, datasets };
	}

	// fallback: compute live (e.g. stats table not yet seeded)
	const biobanks = await biobanksOverview(db, scope);
	const stats = await tenantStats(db, scope);
	const populations = biobanks.flatMap((b) => b.populations.map((p) => ({ ...p, biobankSlug: b.slug, biobankName: b.name })));
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
};
