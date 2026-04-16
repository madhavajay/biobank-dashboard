import { json } from '@sveltejs/kit';
import { getExplorerPageData } from '$lib/server/db/queries';

const parseExplorerParams = (url: URL) => {
	const q = url.searchParams.get('q') ?? '';
	const page = Number(url.searchParams.get('page') ?? '1');
	const pageSize = Number(url.searchParams.get('pageSize') ?? '20');
	const sortParam = url.searchParams.get('sort');
	const classParam = url.searchParams.get('class');
	const stateParam = url.searchParams.get('state');
	const tagParam = url.searchParams.get('tag');
	const sort =
		sortParam === 'af_desc' ||
		sortParam === 'ac_desc' ||
		sortParam === 'an_desc' ||
		sortParam === 'het_desc' ||
		sortParam === 'hom_alt_desc' ||
		sortParam === 'hom_ref_desc' ||
		sortParam === 'hom_oth_desc' ||
		sortParam === 'subjects_desc' ||
		sortParam === 'genes_desc' ||
		sortParam === 'gene' ||
		sortParam === 'dbsnp'
			? sortParam
			: 'position';
	const variantClassFilter =
		classParam === 'SNV' || classParam === 'INS' || classParam === 'DEL' ? classParam : 'all';
	const stateFilter =
		stateParam === 'SP' || stateParam === 'RJ' || stateParam === 'MG' || stateParam === 'ES'
			? stateParam
			: 'all';
	const tagFilter = tagParam ?? 'all';

	return {
		q,
		page: Number.isFinite(page) ? page : 1,
		pageSize: Number.isFinite(pageSize) && pageSize > 0 ? pageSize : 20,
		sort,
		variantClassFilter,
		stateFilter,
		tagFilter
	} as const;
};

export const GET = async ({ url, platform }) => {
	const params = parseExplorerParams(url);
	const payload = await getExplorerPageData(
		platform,
		params.q,
		params.page,
		params.pageSize,
		params.sort,
		params.variantClassFilter,
		params.stateFilter,
		params.tagFilter
	);

	return json(payload);
};
