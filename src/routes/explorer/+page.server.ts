import { getExplorerPageData } from '$lib/server/db/queries';

export const load = async ({ url, platform }) => {
	const q = url.searchParams.get('q') ?? '';
	const page = Number(url.searchParams.get('page') ?? '1');
	const pageSize = Number(url.searchParams.get('pageSize') ?? '20');
	const sortParam = url.searchParams.get('sort');
	const classParam = url.searchParams.get('class');
	const stateParam = url.searchParams.get('state');
	const tagParam = url.searchParams.get('tag');
	const sort = sortParam === 'af_desc' || sortParam === 'gene' ? sortParam : 'position';
	const variantClassFilter = classParam === 'SNV' || classParam === 'INS' || classParam === 'DEL' ? classParam : 'all';
	const stateFilter = stateParam === 'SP' || stateParam === 'RJ' || stateParam === 'MG' || stateParam === 'ES' ? stateParam : 'all';
	const tagFilter = tagParam ?? 'all';

	return getExplorerPageData(
		platform,
		q,
		Number.isFinite(page) ? page : 1,
		Number.isFinite(pageSize) && pageSize > 0 ? pageSize : 20,
		sort,
		variantClassFilter,
		stateFilter,
		tagFilter
	);
};
