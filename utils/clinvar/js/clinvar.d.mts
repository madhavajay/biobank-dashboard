export interface ClinvarRow {
	id: string;
	accession: string;
	accessionVersion: string;
	title: string;
	gene: string;
	location: string;
	allele: string;
	significance: string;
	reviewStatus: string;
	rsid: string;
	url: string;
	matchesQuery: boolean;
	rsidMatches: boolean;
	exactScore: number;
	raw: unknown;
}

export class ClinvarError extends Error {
	details?: unknown;
}

export class ClinvarClient {
	constructor(options?: { endpoint?: string; site?: string; tool?: string; email?: string; fetch?: typeof fetch });
	normalizeVariant(input: string | number | { chrom?: string | number; pos?: number; ref?: string; alt?: string; rsid?: string | number }): {
		chrom: string;
		pos: number | null;
		ref: string;
		alt: string;
		rsid: string;
	};
	request(path: string, params?: Record<string, unknown>): Promise<unknown>;
	search(
		input: string | number | { chrom?: string | number; pos?: number; ref?: string; alt?: string; rsid?: string | number },
		options?: { retmax?: number }
	): Promise<string[]>;
	summary(ids: Iterable<string | number>): Promise<unknown[]>;
	queryVariant(
		input: string | number | { chrom?: string | number; pos?: number; ref?: string; alt?: string; rsid?: string | number },
		options?: { retmax?: number; maxRows?: number }
	): Promise<ClinvarRow[]>;
}

export function normalizeSummaryRows(rows: unknown[], options?: { site?: string; parsed?: unknown; maxRows?: number }): ClinvarRow[];
export function normalizeSummaryRow(raw: unknown, site?: string, parsed?: unknown): ClinvarRow;
