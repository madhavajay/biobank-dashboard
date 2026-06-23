export function mapHref(params: Record<string, string | number | null | undefined>) {
	const sp = new URLSearchParams();
	for (const [key, value] of Object.entries(params)) {
		if (value === null || value === undefined || value === '') continue;
		sp.set(key, String(value));
	}
	const query = sp.toString();
	return `/${query ? `?${query}` : ''}`;
}

export function sourceMapHref(sourceSlug: string) {
	return mapHref({ source: sourceSlug });
}

export function datasetMapHref(datasetSlug: string) {
	return mapHref({ dataset: datasetSlug });
}

export function populationMapHref(countryCode: string, cohortId?: number) {
	return mapHref({ country: countryCode, cohorts: cohortId });
}
