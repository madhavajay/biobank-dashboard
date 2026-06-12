export interface ClinpgxLocation {
	id?: string | number;
	assembly: string;
	begin: number | null;
	end: number | null;
	referenceAllele: string;
	variantAlleles: string[];
	variantHgvs: string[];
	referenceHgvs: string;
	sequenceName: string;
	sequenceResourceId: string;
	source: string;
	type: string;
}

export interface ClinpgxVariant {
	id: string;
	symbol: string;
	rsid: string;
	name: string;
	type: string;
	changeClassification: string;
	clinicalSignificance: string;
	ampTier: string;
	rare: boolean;
	raritySource: string;
	obsolete: boolean;
	lastUpdatedFromDbsnp: string;
	locations: ClinpgxLocation[];
	grch38Location: ClinpgxLocation | null;
	relatedGenes: { id: string; symbol: string; name: string }[];
	crossReferences: { resource: string; resourceId: string; name: string; url: string }[];
	url: string;
	raw: unknown;
}

export interface ClinpgxGene {
	id: string;
	symbol: string;
	name: string;
	alleleType: string;
	buildVersion: string;
	chromosome: string;
	start38: number | null;
	stop38: number | null;
	start37: number | null;
	stop37: number | null;
	strand: string;
	cpicGene: boolean;
	pharmVarGene: boolean;
	vipTier: string;
	url: string;
	raw: unknown;
}

export interface ClinpgxClinicalAnnotation {
	id: string | number;
	accessionId: string;
	name: string;
	level: string;
	types: string[];
	score: number | null;
	pediatric: boolean;
	location: {
		displayName: string;
		rsid: string;
		type: string;
		chromosomeName: string;
		position: number | null;
		genes: { id: string; symbol: string; name: string }[];
	};
	chemicals: { id: string; name: string }[];
	diseases: { id: string; name: string }[];
	guidelines: { id: string; name: string }[];
	labels: { id: string; name: string }[];
	allelePhenotypes: { allele: string; phenotype: string; limitedEvidence: boolean }[];
	url: string;
	raw: unknown;
}

export class ClinpgxError extends Error {
	details?: unknown;
}

export class ClinpgxClient {
	constructor(options?: { endpoint?: string; site?: string; fetch?: typeof fetch });
	normalizeVariant(input: string | number): { id: string | null; rsid: string | null };
	normalizeGene(input: string): string;
	request(path: string, params?: Record<string, unknown>): Promise<unknown>;
	queryVariant(input: string | number, options?: { view?: 'base' | 'max' | string }): Promise<ClinpgxVariant | null>;
	queryGene(input: string, options?: { view?: 'base' | 'max' | string }): Promise<ClinpgxGene | null>;
	queryClinicalAnnotationsByVariant(
		input: string | number,
		options?: { view?: 'base' | 'max' | string; maxRows?: number }
	): Promise<ClinpgxClinicalAnnotation[]>;
	queryClinicalAnnotationsByGene(
		input: string,
		options?: { view?: 'base' | 'max' | string; maxRows?: number }
	): Promise<ClinpgxClinicalAnnotation[]>;
	queryVariantPage(
		input: string | number,
		options?: { variantView?: string; annotationView?: string; maxAnnotations?: number }
	): Promise<{ type: 'variant'; query: string; variant: ClinpgxVariant | null; annotations: ClinpgxClinicalAnnotation[]; url: string | null }>;
	queryGenePage(
		input: string,
		options?: { geneView?: string; annotationView?: string; maxAnnotations?: number }
	): Promise<{ type: 'gene'; query: string; gene: ClinpgxGene | null; annotations: ClinpgxClinicalAnnotation[]; url: string | null }>;
}

export function normalizeVariantRow(raw: unknown, site?: string): ClinpgxVariant;
export function normalizeGeneRow(raw: unknown, site?: string): ClinpgxGene;
export function normalizeClinicalAnnotationRow(raw: unknown, site?: string): ClinpgxClinicalAnnotation;
