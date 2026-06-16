import { error, redirect } from '@sveltejs/kit';
import { buildVrsAllele, canonicalVariantId, resolveVariantIdentifier } from '$lib/server/db/queries';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params, platform, url }) => {
	const db = platform?.env?.DB;
	if (!db) throw error(500, 'D1 binding unavailable');

	const variant = await resolveVariantIdentifier(db, params.id, locals.tenant.scope);
	if (!variant) throw error(404, 'variant not found');

	const scope = locals.tenant.scope;
	const frequencies = scope ? variant.frequencies.filter((f) => f.biobankSlug === scope) : variant.frequencies;
	if (scope && frequencies.length === 0) throw error(404, 'variant not found');
	const canonical = canonicalVariantId(variant);
	if (/^\d+$/.test(params.id) && params.id !== canonical) {
		const query = url.searchParams.toString();
		throw redirect(308, `/explore/variant/${encodeURIComponent(canonical)}${query ? `?${query}` : ''}`);
	}

	return {
		tenantName: locals.tenant.name,
		forceTenant: url.searchParams.get('tenant') ?? '',
		variant: {
			id: variant.id,
			chrom: variant.chrom,
			chromName: variant.chromName,
			pos: variant.pos,
			ref: variant.ref,
			alt: variant.alt,
			rsid: variant.rsid,
			vrsDigest: variant.vrsDigest,
			posHg19: variant.posHg19,
			lifted: variant.lifted,
			vepLabel: variant.vepLabel,
			vepImpact: variant.vepImpact,
			hgvsConsequence: variant.hgvsConsequence,
			vepHasMultipleConsequences: variant.vepHasMultipleConsequences,
			genes: variant.genes,
			frequencies
		},
		vrs: buildVrsAllele(variant)
	};
};
