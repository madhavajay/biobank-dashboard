import { error } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { themeVars } from '$lib/tenants';
import { biobanksOverview, tenantStats, getDatasets, getStats, exploreFilterOptions, showGenotypeCounts } from '$lib/server/db/queries';
import { explorerDisplay } from '$lib/explorer';

const ANALYTICS_SITE_ID = '179bcc95f91b';
const ANALYTICS_SITE_DOMAIN = 'data.biovault.net';
const ANALYTICS_SCRIPT_SRC = 'https://metrics.syftbox.net/api/script.js';
const LIVE_ANALYTICS_HOSTS = new Set([
	'data.biovault.net',
	'bipmed.biovault.net',
	'carigenetics.biovault.net',
	'pgp-harvard.biovault.net'
]);

export const load: LayoutServerLoad = async ({ locals, platform, url }) => {
	const hostname = url.hostname.toLowerCase();
	const analytics =
		url.protocol === 'https:' && LIVE_ANALYTICS_HOSTS.has(hostname)
			? {
					scriptSrc: ANALYTICS_SCRIPT_SRC,
					siteId: ANALYTICS_SITE_ID,
					siteDomain: ANALYTICS_SITE_DOMAIN,
					tag: `tenant:${locals.tenant.slug}`,
					hostname,
					tenantSlug: locals.tenant.slug,
					tenantName: locals.tenant.name,
					tenantScope: locals.tenant.scope
				}
			: null;

	let dashboard = null;
	let options: { slug: string; name: string }[] = [];
	let populations: { cohortId: number; name: string; biobankSlug: string; biobankName: string }[] = [];
	let showGenotypeCountsFlag = true;
	let display = explorerDisplay(locals.tenant.slug);

	if (locals.tenant.slug === 'biovault') {
		const db = locals.db;
		if (!db) throw error(500, 'PostgreSQL connection unavailable — check DATABASE_URL or Hyperdrive');

		const scope = locals.tenant.scope;
		const datasetRows = await getDatasets(db, scope);
		const datasets = datasetRows.map((d) => ({ id: d.id, slug: d.slug, ...d.metadata }));
		const cached = await getStats(db, `home:${scope ?? 'global'}`);
		const filters = await exploreFilterOptions(db, scope);
		options = filters.options;
		populations = filters.populations;
		showGenotypeCountsFlag = await showGenotypeCounts(db, scope);
		display = explorerDisplay(locals.tenant.slug);

		if (cached) {
			dashboard = { ...cached, datasets };
		} else {
			const biobanks = await biobanksOverview(db, scope);
			const stats = await tenantStats(db, scope);
			const dashboardPopulations = biobanks.flatMap((b) => b.populations.map((p) => ({ ...p, biobankSlug: b.slug, biobankName: b.name })));
			dashboard = {
				biobanks,
				populations: dashboardPopulations,
				datasets,
				totals: {
					participants: dashboardPopulations.reduce((s, p) => s + p.sampleCount, 0),
					datasetCount: datasets.length,
					variants: stats.variants,
					populations: dashboardPopulations.length
				},
				variantClasses: { common: stats.common, lowFreq: stats.lowFreq, rare: stats.rare }
			};
		}
	}

	return {
		tenant: locals.tenant,
		themeStyle: themeVars(locals.tenant),
		forceTenant: url.searchParams.get('tenant') ?? '',
		analytics,
		dashboard,
		options,
		populations,
		showGenotypeCounts: showGenotypeCountsFlag,
		display
	};
};
