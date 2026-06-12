import { json, error } from '@sveltejs/kit';
import { searchVariants, buildVrsAllele } from '$lib/server/db/queries';
import type { RequestHandler } from './$types';

// Map Beacon referenceName (name / chr / RefSeq NC_) -> internal chrom code.
function refNameToCode(name: string): number | null {
	let n = name.trim();
	const nc = /^NC_0*(\d+)\.\d+$/i.exec(n);
	if (nc) {
		const acc = Number(nc[1]);
		if (acc >= 1 && acc <= 22) return acc;
		if (acc === 23) return 23;
		if (acc === 24) return 24;
		if (acc === 12920) return 25;
		return null;
	}
	n = n.replace(/^chr/i, '').toUpperCase();
	if (n === 'M') n = 'MT';
	const map: Record<string, number> = { X: 23, Y: 24, MT: 25 };
	if (map[n]) return map[n];
	const c = Number(n);
	return c >= 1 && c <= 22 ? c : null;
}

export const GET: RequestHandler = async ({ url, locals, platform }) => {
	const db = platform?.env?.DB;
	if (!db) throw error(500, 'D1 binding unavailable');
	const q = url.searchParams;
	const refName = q.get('referenceName');
	const code = refName ? refNameToCode(refName) : null;
	const start = q.has('start') ? Number(q.get('start')) : undefined; // 0-based interbase
	const end = q.has('end') ? Number(q.get('end')) : undefined;
	const referenceBases = q.get('referenceBases')?.toUpperCase();
	const alternateBases = q.get('alternateBases')?.toUpperCase();

	const meta = {
		beaconId: 'net.biovault.beacon',
		apiVersion: 'v2.0.0',
		returnedSchemas: [{ entityType: 'genomicVariant', schema: 'ga4gh-beacon-variant-v2.0.0' }]
	};

	if (!code || start === undefined) {
		return json({ meta, responseSummary: { exists: false }, response: { resultSets: [] } });
	}

	// sequence query: pos = start+1 ; range query: [start+1, end]
	const posMin = start + 1;
	const posMax = end !== undefined ? end : start + 1;
	const { rows } = await searchVariants(db, locals.tenant.scope, { chrom: code, posMin, posMax, limit: 500 });
	const matched = rows.filter((v) => {
		if (referenceBases && v.ref !== referenceBases) return false;
		if (alternateBases && v.alt !== alternateBases) return false;
		return true;
	});

	const results = matched.map((v) => {
		const byBank = new Map<string, { source: string; frequencies: any[] }>();
		for (const f of v.frequencies) {
			const g = byBank.get(f.biobankSlug) ?? { source: f.biobankSlug, frequencies: [] };
			g.frequencies.push({
				population: f.population,
				alleleFrequency: f.af,
				alleleCount: f.ac,
				alleleNumber: f.an
			});
			byBank.set(f.biobankSlug, g);
		}
		return {
			variantInternalId: String(v.id),
			variation: buildVrsAllele(v),
			identifiers: v.rsid ? { genomicHGVSId: `${v.chromName}:${v.pos}${v.ref}>${v.alt}`, clinvarVariantId: null, variantAlternativeIds: [`dbSNP:rs${v.rsid}`] } : {},
			frequencyInPopulations: [...byBank.values()]
		};
	});

	return json({
		meta,
		responseSummary: { exists: matched.length > 0, numTotalResults: matched.length },
		response: {
			resultSets: [
				{
					id: locals.tenant.scope ?? 'biovault-global',
					setType: 'dataset',
					exists: matched.length > 0,
					resultsCount: matched.length,
					results
				}
			]
		}
	});
};
