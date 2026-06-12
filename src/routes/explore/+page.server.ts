import { error } from '@sveltejs/kit';
import { biobanksOverview, showGenotypeCounts } from '$lib/server/db/queries';
import { explorerDisplay, hasExplorerConfig } from '$lib/explorer';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, platform, url }) => {
	const db = platform?.env?.DB;
	if (!db) throw error(500, 'D1 binding unavailable');
	const biobanks = await biobanksOverview(db, locals.tenant.scope);
	// population checkboxes — only for a single biobank with multiple populations
	const populations =
		locals.tenant.scope && biobanks.length === 1 && biobanks[0].populations.length > 1
			? biobanks[0].populations.map((p) => ({ cohortId: p.cohortId, name: p.name }))
			: [];
	return {
		options: biobanks.map((b) => ({ slug: b.slug, name: b.name })),
		populations,
		q: url.searchParams.get('q') ?? '',
		showGenotypeCounts: await showGenotypeCounts(db, locals.tenant.scope),
		display: hasExplorerConfig(locals.tenant.slug) ? explorerDisplay(locals.tenant.slug) : undefined
	};
};
