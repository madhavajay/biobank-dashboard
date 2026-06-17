import { error } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { themeVars } from '$lib/tenants';
import { biobanksOverview, tenantStats, getDatasets, getStats } from '$lib/server/db/queries';

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
	if (locals.tenant.slug === 'biovault') {
		const db = locals.db;
		if (!db) throw error(500, 'D1 binding unavailable — run with wrangler/vite dev');

		const scope = locals.tenant.scope;
		const datasetRows = await getDatasets(db, scope);
		const datasets = datasetRows.map((d) => ({ id: d.id, slug: d.slug, ...d.metadata }));
		const cached = await getStats(db, `home:${scope ?? 'global'}`);

		if (cached) {
			dashboard = { ...cached, datasets };
		} else {
			const biobanks = await biobanksOverview(db, scope);
			const stats = await tenantStats(db, scope);
			const populations = biobanks.flatMap((b) => b.populations.map((p) => ({ ...p, biobankSlug: b.slug, biobankName: b.name })));
			dashboard = {
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
	}

	return {
		tenant: locals.tenant,
		themeStyle: themeVars(locals.tenant),
		forceTenant: url.searchParams.get('tenant') ?? '',
		analytics,
		dashboard
	};
};
