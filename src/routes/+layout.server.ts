import type { LayoutServerLoad } from './$types';
import { themeVars } from '$lib/tenants';

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

	return {
		tenant: locals.tenant,
		themeStyle: themeVars(locals.tenant),
		forceTenant: url.searchParams.get('tenant') ?? '',
		analytics
	};
};
