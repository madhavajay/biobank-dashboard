export interface GnomadSummary {
	ac: number;
	an: number;
	af: number;
	homozygoteCount: number;
	hemizygoteCount: number;
	filters: string[];
}

export interface GnomadPopulation {
	sequencingType: 'exome' | 'genome';
	id: string;
	ac: number;
	an: number;
	af: number;
	homozygoteCount: number;
	hemizygoteCount: number;
}

export interface GnomadRow {
	id: string;
	location: string;
	allele: string;
	chrom: string;
	pos: number;
	ref: string;
	alt: string;
	rsid: string;
	rsids: string[];
	flags: string[];
	colocatedVariants: string[];
	summary: {
		exome: GnomadSummary | null;
		genome: GnomadSummary | null;
	};
	populations: GnomadPopulation[];
	raw: unknown;
}

export class GnomadError extends Error {
	details?: unknown;
}

export class GnomadClient {
	constructor(options?: { endpoint?: string; dataset?: string; fetch?: typeof fetch });
	normalizeVariant(input: string | { chrom: string | number; pos: number; ref: string; alt: string }): {
		variantId: string | null;
		rsid: string | null;
	};
	graphQL(query: string, variables?: Record<string, unknown>): Promise<unknown>;
	queryVariant(
		input: string | { chrom: string | number; pos: number; ref: string; alt: string },
		options?: { dataset?: string }
	): Promise<GnomadRow | null>;
	queryVariants(
		inputs: Iterable<string | { chrom: string | number; pos: number; ref: string; alt: string }>,
		options?: { dataset?: string; includeMissing?: boolean }
	): AsyncIterable<GnomadRow | null>;
}

export function normalizeVariantRow(raw: unknown): GnomadRow;
