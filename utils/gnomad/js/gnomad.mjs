// @ts-nocheck
const DEFAULT_ENDPOINT = 'https://gnomad.broadinstitute.org/api';
const DEFAULT_DATASET = 'gnomad_r4';

const VARIANT_QUERY = `
query GnomadVariant($variantId: String, $rsid: String, $datasetId: DatasetId!) {
	variant(variantId: $variantId, rsid: $rsid, dataset: $datasetId) {
		variant_id
		variantId
		chrom
		pos
		ref
		alt
		rsid
		rsids
		flags
		colocated_variants
		exome {
			ac
			an
			ac_hom
			ac_hemi
			filters
			populations {
				id
				ac
				an
				ac_hom
				ac_hemi
			}
		}
		genome {
			ac
			an
			ac_hom
			ac_hemi
			filters
			populations {
				id
				ac
				an
				ac_hom
				ac_hemi
			}
		}
	}
}
`;

export class GnomadError extends Error {
	constructor(message, details) {
		super(message);
		this.name = 'GnomadError';
		this.details = details;
	}
}

export class GnomadClient {
	constructor(options = {}) {
		this.endpoint = options.endpoint || DEFAULT_ENDPOINT;
		this.dataset = options.dataset || DEFAULT_DATASET;
		this.fetch = options.fetch || globalThis.fetch?.bind(globalThis);
		if (!this.fetch) throw new GnomadError('No fetch implementation available');
	}

	normalizeVariant(input) {
		if (typeof input === 'object' && input !== null) {
			const { chrom, pos, ref, alt } = input;
			if (!chrom || !pos || !ref || !alt) {
				throw new GnomadError('Variant object must include chrom, pos, ref, and alt');
			}
			return {
				variantId: `${String(chrom).replace(/^chr/i, '')}-${pos}-${ref}-${alt}`,
				rsid: null
			};
		}

		const raw = String(input ?? '').trim();
		if (!raw) throw new GnomadError('Variant query is empty');
		if (/^rs\d+$/i.test(raw)) return { variantId: null, rsid: raw.toLowerCase() };

		const normalized = raw
			.replace(/^chr/i, '')
			.replace(/:/g, '-')
			.replace(/>/g, '-')
			.replace(/\s+/g, '');
		const parts = normalized.split('-');
		if (parts.length !== 4 || !parts[0] || !/^\d+$/.test(parts[1]) || !parts[2] || !parts[3]) {
			throw new GnomadError(`Could not parse gnomAD variant identifier: ${raw}`);
		}
		return { variantId: `${parts[0]}-${Number(parts[1])}-${parts[2]}-${parts[3]}`, rsid: null };
	}

	async graphQL(query, variables = {}) {
		const res = await this.fetch(this.endpoint, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ query, variables })
		});
		const json = await res.json().catch(() => null);
		if (!res.ok) throw new GnomadError(`gnomAD request failed with HTTP ${res.status}`, json);
		if (json?.errors?.length) throw new GnomadError(json.errors.map((e) => e.message).join('; '), json.errors);
		return json?.data;
	}

	async queryVariant(input, options = {}) {
		const parsed = this.normalizeVariant(input);
		const data = await this.graphQL(VARIANT_QUERY, {
			variantId: parsed.variantId,
			rsid: parsed.rsid,
			datasetId: options.dataset || this.dataset
		});
		if (!data?.variant) return null;
		return normalizeVariantRow(data.variant);
	}

	async *queryVariants(inputs, options = {}) {
		for (const input of inputs) {
			const row = await this.queryVariant(input, options);
			if (row || options.includeMissing) yield row;
		}
	}
}

export function normalizeVariantRow(raw) {
	const id = raw.variant_id || raw.variantId;
	const summary = {
		exome: normalizeSequencingSummary(raw.exome),
		genome: normalizeSequencingSummary(raw.genome),
		joint: normalizeSequencingSummary(raw.joint)
	};
	return {
		id,
		location: `${raw.chrom}:${raw.pos}`,
		allele: `${raw.ref}>${raw.alt}`,
		chrom: raw.chrom,
		pos: raw.pos,
		ref: raw.ref,
		alt: raw.alt,
		rsid: raw.rsid || raw.rsids?.[0] || '',
		rsids: raw.rsids || (raw.rsid ? [raw.rsid] : []),
		flags: raw.flags || [],
		colocatedVariants: raw.colocated_variants || [],
		summary,
		populations: [
			...normalizePopulations('exome', raw.exome?.populations),
			...normalizePopulations('genome', raw.genome?.populations)
		],
		raw
	};
}

function normalizeSequencingSummary(value) {
	if (!value) return null;
	return {
		ac: value.ac ?? 0,
		an: value.an ?? 0,
		af: value.af ?? (value.an ? value.ac / value.an : 0),
		homozygoteCount: value.ac_hom ?? 0,
		hemizygoteCount: value.ac_hemi ?? 0,
		filters: value.filters || []
	};
}

function normalizePopulations(sequencingType, populations = []) {
	return populations.map((p) => ({
		sequencingType,
		id: p.id,
		ac: p.ac,
		an: p.an,
		af: p.an ? p.ac / p.an : 0,
		homozygoteCount: p.ac_hom ?? 0,
		hemizygoteCount: p.ac_hemi ?? 0
	}));
}

export default {
	GnomadClient,
	GnomadError,
	normalizeVariantRow
};
