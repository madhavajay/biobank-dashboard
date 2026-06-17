import type { Handle } from '@sveltejs/kit';
import { resolveTenant } from '$lib/tenants';

// Public, read-only API → open CORS so the tenant domains (and external sites
// embedding the data) can query data.biovault.net/api cross-origin.
const CORS: Record<string, string> = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type',
	'Access-Control-Max-Age': '86400'
};

export const handle: Handle = async ({ event, resolve }) => {
	const override = event.url.searchParams.get('tenant');
	event.locals.tenant = resolveTenant(event.request.headers.get('host'), override);
	event.locals.db = event.platform?.env?.DB?.withSession('first-unconstrained');

	const isApi = event.url.pathname.startsWith('/api');
	if (isApi && event.request.method === 'OPTIONS') {
		return new Response(null, { status: 204, headers: CORS });
	}

	const response = await resolve(event);
	if (isApi) for (const [k, v] of Object.entries(CORS)) response.headers.set(k, v);
	return response;
};
