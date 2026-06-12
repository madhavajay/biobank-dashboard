// Per-tenant explorer (variant table) display config. Each tenant has slightly
// different data, so columns are shown/hidden per tenant here — fixed and explicit,
// not derived from whatever rows happen to load. A tenant with no entry falls back
// to DEFAULTS (sensible auto behaviour).

export interface ExplorerDisplay {
	gene: boolean; // Gene column
	population: boolean; // per-population label column (multi-population tenants)
	genotypes: boolean; // HET / HOM_ALT / HOM_REF columns
	maxAf: boolean; // Max AF column (redundant for a single population)
	vrs: boolean; // VRS column
	barMax: string; // max width of the allele-frequency bar
	geneColWidth?: string; // optional fixed/responsive width for the gene column
	frequencyColWidth?: string; // optional fixed width for the frequency/AC/AN block
	acAnSplit: boolean; // render AC and AN as two aligned columns instead of "AC/AN"
	vrsExpand: boolean; // let the VRS column absorb spare width and show the full digest
	gnomad: boolean; // far-right globe link to the variant on gnomAD
	variantDetailIcon: boolean; // show the magnifier affordance in the variant column
	variantColWidth?: string; // optional fixed width for the variant column when table-fixed
}

export const DEFAULTS: ExplorerDisplay = {
	gene: true,
	population: true,
	genotypes: true,
	maxAf: true,
	vrs: true,
	barMax: '13rem',
	acAnSplit: false,
	vrsExpand: false,
	gnomad: false,
	variantDetailIcon: false
};

// Locked-in, per-tenant overrides. Start with bipmed; add others as they're dialled in.
const CONFIGS: Record<string, Partial<ExplorerDisplay>> = {
	// BIPMed: single Brazilian cohort, genotype counts withheld for privacy.
	// Short bar; AC/AN split into aligned columns so counts line up row-to-row;
	// VRS expands to use the spare horizontal room.
	bipmed: {
		gene: true,
		population: false,
		genotypes: false,
		maxAf: false,
		vrs: true,
		barMax: '6rem',
		geneColWidth: 'clamp(8rem, calc(8rem + (100vw - 60rem)), 13rem)',
		frequencyColWidth: '19.25rem',
		acAnSplit: true,
		vrsExpand: true,
		gnomad: false,
		variantDetailIcon: true,
		variantColWidth: '11rem'
	}
};

export function explorerDisplay(slug: string | null | undefined): ExplorerDisplay {
	return { ...DEFAULTS, ...(slug && CONFIGS[slug] ? CONFIGS[slug] : {}) };
}

// whether a tenant has an explicit (locked-in) config vs auto defaults
export function hasExplorerConfig(slug: string | null | undefined): boolean {
	return !!(slug && CONFIGS[slug]);
}
