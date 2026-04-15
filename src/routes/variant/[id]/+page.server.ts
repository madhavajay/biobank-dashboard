import { error } from '@sveltejs/kit';
import { getVariantPageData } from '$lib/server/db/queries';

export const load = async ({ params, platform }) => {
	const variant = await getVariantPageData(platform, params.id);

	if (!variant) {
		throw error(404, 'Variant not found');
	}

	return variant;
};
