import type { LayoutServerLoad } from './$types';
import { themeVars } from '$lib/tenants';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	return {
		tenant: locals.tenant,
		themeStyle: themeVars(locals.tenant),
		forceTenant: url.searchParams.get('tenant') ?? ''
	};
};
