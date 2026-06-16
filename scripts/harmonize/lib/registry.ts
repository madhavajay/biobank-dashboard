// Source-of-truth registry for biobanks / populations / cohorts.
// Seeded verbatim into D1; harmonizers map source files onto cohort ids.
import { ONE_KGP_POPULATIONS, type OneKgpSuperPopulation } from './one-thousand-genomes';

export interface Biobank {
	id: number;
	slug: string;
	name: string;
	description: string;
	website: string;
}

export interface Population {
	id: number;
	biobankId: number;
	name: string;
	country: string;
	countryCode: string; // ISO-3166-1 alpha-2
	adminLevel: 'country' | 'state' | 'city' | 'region' | 'superpopulation';
	lat: number;
	lon: number;
}

export interface PopulationCountryMapping {
	id: number;
	populationId: number;
	country: string;
	countryCode: string;
	regionGroup: string;
	subpopulationCode: string;
	subpopulationName: string;
	sampleCount: number;
}

export interface Cohort {
	id: number;
	biobankId: number;
	populationId: number;
	label: string;
	assay: string;
	release: string;
	sampleCount: number; // filled/overridden by harmonizer when derivable
}

export const BIOBANKS: Biobank[] = [
	{
		id: 1,
		slug: 'carigenetics',
		name: 'CariGenetics',
		description: 'Caribbean population allele-frequency reference.',
		website: 'https://carigenetics.com'
	},
	{
		id: 2,
		slug: 'bipmed',
		name: 'BIPMed',
		description: 'Brazilian Initiative on Precision Medicine — Brazil.',
		website: 'https://bipmed.org'
	},
	{
		id: 3,
		slug: 'pgp-harvard',
		name: 'PGP Harvard',
		description: 'Harvard Personal Genome Project — United States.',
		website: 'https://pgp.med.harvard.edu'
	},
	{
		id: 4,
		slug: '1kgp',
		name: '1000 Genomes Project',
		description: '1000 Genomes Project super-population allele frequencies for BioVault tracked loci.',
		website: 'https://www.internationalgenome.org'
	}
];

export const POPULATIONS: Population[] = [
	{ id: 1, biobankId: 1, name: 'Bahamas', country: 'Bahamas', countryCode: 'BS', adminLevel: 'country', lat: 25.034, lon: -77.396 },
	{ id: 2, biobankId: 1, name: 'Barbados', country: 'Barbados', countryCode: 'BB', adminLevel: 'country', lat: 13.194, lon: -59.543 },
	{ id: 3, biobankId: 1, name: 'Bermuda', country: 'Bermuda', countryCode: 'BM', adminLevel: 'country', lat: 32.308, lon: -64.751 },
	{ id: 4, biobankId: 1, name: 'British Virgin Islands', country: 'British Virgin Islands', countryCode: 'VG', adminLevel: 'country', lat: 18.421, lon: -64.640 },
	{ id: 5, biobankId: 1, name: 'Saint Lucia', country: 'Saint Lucia', countryCode: 'LC', adminLevel: 'country', lat: 13.909, lon: -60.979 },
	{ id: 6, biobankId: 1, name: 'Trinidad & Tobago', country: 'Trinidad and Tobago', countryCode: 'TT', adminLevel: 'country', lat: 10.692, lon: -61.222 },
	{ id: 7, biobankId: 2, name: 'Brazil', country: 'Brazil', countryCode: 'BR', adminLevel: 'country', lat: -14.235, lon: -51.925 },
	{ id: 8, biobankId: 3, name: 'USA', country: 'United States', countryCode: 'US', adminLevel: 'country', lat: 39.83, lon: -98.58 },
	{ id: 9, biobankId: 4, name: 'AFR', country: 'Multiple countries', countryCode: 'XK', adminLevel: 'superpopulation', lat: 7, lon: 18 },
	{ id: 10, biobankId: 4, name: 'AMR', country: 'Multiple countries', countryCode: 'XK', adminLevel: 'superpopulation', lat: 2, lon: -74 },
	{ id: 11, biobankId: 4, name: 'EAS', country: 'Multiple countries', countryCode: 'XK', adminLevel: 'superpopulation', lat: 30, lon: 112 },
	{ id: 12, biobankId: 4, name: 'EUR', country: 'Multiple countries', countryCode: 'XK', adminLevel: 'superpopulation', lat: 50, lon: 9 },
	{ id: 13, biobankId: 4, name: 'SAS', country: 'Multiple countries', countryCode: 'XK', adminLevel: 'superpopulation', lat: 22, lon: 76 }
];

export const COHORTS: Cohort[] = [
	{ id: 1, biobankId: 1, populationId: 1, label: 'Bahamas', assay: 'array', release: '2025', sampleCount: 0 },
	{ id: 2, biobankId: 1, populationId: 2, label: 'Barbados', assay: 'array', release: '2025', sampleCount: 0 },
	{ id: 3, biobankId: 1, populationId: 3, label: 'Bermuda', assay: 'array', release: '2025', sampleCount: 0 },
	{ id: 4, biobankId: 1, populationId: 4, label: 'British Virgin Islands', assay: 'array', release: '2025', sampleCount: 0 },
	{ id: 5, biobankId: 1, populationId: 5, label: 'Saint Lucia', assay: 'array', release: '2025', sampleCount: 0 },
	{ id: 6, biobankId: 1, populationId: 6, label: 'Trinidad & Tobago', assay: 'array', release: '2025', sampleCount: 0 },
	{ id: 7, biobankId: 2, populationId: 7, label: 'BIPMed SNP-array', assay: 'SNP-array', release: '2021', sampleCount: 203 },
	{ id: 8, biobankId: 3, populationId: 8, label: 'PGP Harvard', assay: 'WGS', release: '2024', sampleCount: 463 },
	{ id: 9, biobankId: 4, populationId: 9, label: '1000 Genomes AFR', assay: 'WGS', release: 'Phase 3', sampleCount: 0 },
	{ id: 10, biobankId: 4, populationId: 10, label: '1000 Genomes AMR', assay: 'WGS', release: 'Phase 3', sampleCount: 0 },
	{ id: 11, biobankId: 4, populationId: 11, label: '1000 Genomes EAS', assay: 'WGS', release: 'Phase 3', sampleCount: 0 },
	{ id: 12, biobankId: 4, populationId: 12, label: '1000 Genomes EUR', assay: 'WGS', release: 'Phase 3', sampleCount: 0 },
	{ id: 13, biobankId: 4, populationId: 13, label: '1000 Genomes SAS', assay: 'WGS', release: 'Phase 3', sampleCount: 0 }
];

export const ONE_KGP_SUPERPOP_POPULATION_ID: Record<OneKgpSuperPopulation, number> = {
	AFR: 9,
	AMR: 10,
	EAS: 11,
	EUR: 12,
	SAS: 13
};

export const ONE_KGP_SUPERPOP_COHORT_ID: Record<OneKgpSuperPopulation, number> = {
	AFR: 9,
	AMR: 10,
	EAS: 11,
	EUR: 12,
	SAS: 13
};

export const ONE_KGP_SUPERPOP_DATASET_ID: Record<OneKgpSuperPopulation, number> = {
	AFR: 4,
	AMR: 5,
	EAS: 6,
	EUR: 7,
	SAS: 8
};

export const POPULATION_COUNTRY_MAPPINGS: PopulationCountryMapping[] = ONE_KGP_POPULATIONS.map((p, i) => ({
	id: i + 1,
	populationId: ONE_KGP_SUPERPOP_POPULATION_ID[p.superPopulation],
	country: p.collectionCountry,
	countryCode: p.collectionCountryCode,
	regionGroup: p.regionGroup,
	subpopulationCode: p.code,
	subpopulationName: p.name,
	sampleCount: p.dnaSamples
}));

// carigenetics source file basename -> cohort id
export const CARI_FILE_COHORT: Record<string, number> = {
	bahamas: 1,
	barbados: 2,
	bermuda: 3,
	bvi: 4,
	saint_lucia: 5,
	trinidad_tobago: 6
};

// Datasets: tenant-owned collections of cohorts with free-form JSON metadata.
// `showGenotypeCounts:false` tells the variant browser to hide het/hom_alt/hom_ref.
export interface Dataset {
	id: number;
	biobankId: number;
	slug: string;
	cohortIds: number[];
	metadata: Record<string, unknown>;
}

export const DATASETS: Dataset[] = [
	{
		id: 1,
		biobankId: 1,
		slug: 'cari-caribbean',
		cohortIds: [1, 2, 3, 4, 5, 6],
		metadata: {
			title: 'CariGenetics Caribbean Panel',
			description:
				'Allele-frequency reference across six Caribbean nations on a shared SNP panel, harmonized to GRCh38 with GA4GH VRS identifiers.',
			assay: 'SNP genotyping',
			genomeBuild: 'GRCh38',
			release: '2025',
			showGenotypeCounts: true
		}
	},
	{
		id: 2,
		biobankId: 2,
		slug: 'bipmed-wes',
		cohortIds: [7],
		metadata: {
			title: 'BIPMed WES',
			description:
				'Population allele frequencies from a reference cohort of Brazilian participants sequenced with WES in GRCh37 and lifted to GRCh38.',
			assay: 'WES',
			genomeBuild: 'GRCh38 (lifted from GRCh37)',
			release: '2021',
			showGenotypeCounts: false,
			genotypeNote: 'Genotype-level counts (het / hom) are withheld for privacy — only AC/AN are published.'
		}
	},
	{
		id: 3,
		biobankId: 3,
		slug: 'pgp-usa',
		cohortIds: [8],
		metadata: {
			title: 'PGP Harvard',
			description:
				'Allele frequencies from the Harvard Personal Genome Project, an open-consent whole-genome cohort of participants in the United States, on GRCh38.',
			assay: 'WGS',
			genomeBuild: 'GRCh38',
			release: '2024',
			showGenotypeCounts: true
		}
	},
	{
		id: 4,
		biobankId: 4,
		slug: '1kgp-afr',
		cohortIds: [9],
		metadata: {
			title: '1KGP-AFR',
			description: 'African super-population allele frequencies for BioVault tracked loci.',
			assay: 'WGS',
			genomeBuild: 'GRCh38',
			release: 'Phase 3',
			superPopulation: 'AFR',
			showGenotypeCounts: true
		}
	},
	{
		id: 5,
		biobankId: 4,
		slug: '1kgp-amr',
		cohortIds: [10],
		metadata: {
			title: '1KGP-AMR',
			description: 'Admixed American super-population allele frequencies for BioVault tracked loci.',
			assay: 'WGS',
			genomeBuild: 'GRCh38',
			release: 'Phase 3',
			superPopulation: 'AMR',
			showGenotypeCounts: true
		}
	},
	{
		id: 6,
		biobankId: 4,
		slug: '1kgp-eas',
		cohortIds: [11],
		metadata: {
			title: '1KGP-EAS',
			description: 'East Asian super-population allele frequencies for BioVault tracked loci.',
			assay: 'WGS',
			genomeBuild: 'GRCh38',
			release: 'Phase 3',
			superPopulation: 'EAS',
			showGenotypeCounts: true
		}
	},
	{
		id: 7,
		biobankId: 4,
		slug: '1kgp-eur',
		cohortIds: [12],
		metadata: {
			title: '1KGP-EUR',
			description: 'European super-population allele frequencies for BioVault tracked loci.',
			assay: 'WGS',
			genomeBuild: 'GRCh38',
			release: 'Phase 3',
			superPopulation: 'EUR',
			showGenotypeCounts: true
		}
	},
	{
		id: 8,
		biobankId: 4,
		slug: '1kgp-sas',
		cohortIds: [13],
		metadata: {
			title: '1KGP-SAS',
			description: 'South Asian super-population allele frequencies for BioVault tracked loci.',
			assay: 'WGS',
			genomeBuild: 'GRCh38',
			release: 'Phase 3',
			superPopulation: 'SAS',
			showGenotypeCounts: true
		}
	}
];

// cohort id -> dataset id
export const COHORT_DATASET: Record<number, number> = Object.fromEntries(
	DATASETS.flatMap((d) => d.cohortIds.map((c) => [c, d.id]))
);
