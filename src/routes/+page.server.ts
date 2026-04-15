import { renderBrazilMapSvg } from '$lib/server/maps';
import { getHomePageData } from '$lib/server/db/queries';

export const load = async ({ platform }) => {
	const home = await getHomePageData(platform);

	return {
		...home,
		brazilMapSvg: renderBrazilMapSvg(home.states)
	};
};
