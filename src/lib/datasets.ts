// Dataset card / metadata format. Descriptive fields that don't live in the DB;
// live counts (participants, variants) are merged in by the page loader.

export interface DatasetCard {
	id: string;
	biobankSlug: string;
	title: string;
	cohortIds: number[]; // cohorts this dataset covers (for live counts)
	assay: string;
	platform: string;
	genomeBuild: string;
	region: string;
	release: string;
	access: string;
	contact: string;
	source: string;
	description: string;
	superPopulation?: string;
	// merged in at load time:
	participants?: number;
	variantCount?: number;
}

export const DATASETS: DatasetCard[] = [
	{
		id: 'cari-caribbean',
		biobankSlug: 'carigenetics',
		title: 'CariGenetics Caribbean Panel',
		cohortIds: [1, 2, 3, 4, 5, 6],
		assay: 'SNP genotyping',
		platform: 'Genome-wide SNP panel',
		genomeBuild: 'GRCh38',
		region: 'Caribbean — 6 nations',
		release: '2025',
		access: 'Controlled — written data-use agreement',
		contact: 'info@carigenetics.com',
		source: 'allele_freq_<country>.tsv',
		description:
			'Allele-frequency reference across six Caribbean nations on a shared SNP panel, harmonized to GRCh38 with GA4GH VRS identifiers.'
	},
	{
		id: 'bipmed-wes',
		biobankSlug: 'bipmed',
		title: 'BIPMed WES',
		cohortIds: [7],
		assay: 'WES',
		platform: 'WES',
		genomeBuild: 'GRCh38 (lifted from GRCh37)',
		region: 'Brazil',
		release: '2021',
		access: '',
		contact: 'contact@bipmed.org',
		source: 'bipmed_filter.recode.vcf',
		description:
			'Population allele frequencies from a reference cohort of Brazilian participants sequenced with WES in GRCh37 and lifted to GRCh38.'
	},
	{
		id: 'pgp-usa',
		biobankSlug: 'pgp-harvard',
		title: 'PGP Harvard',
		cohortIds: [8],
		assay: 'WGS',
		platform: 'WGS',
		genomeBuild: 'GRCh38',
		region: 'United States',
		release: '2024',
		access: '',
		contact: '',
		source: '',
		description:
			'Allele frequencies from the Harvard Personal Genome Project, an open-consent whole-genome cohort of participants in the United States, on GRCh38.'
	},
	{
		id: '1kgp-afr',
		biobankSlug: '1kgp',
		title: '1KGP-AFR',
		cohortIds: [9],
		assay: 'WGS',
		platform: 'WGS',
		genomeBuild: 'GRCh38',
		region: 'Africa',
		release: 'Phase 3',
		access: '',
		contact: '',
		source: '',
		description: 'African super-population allele frequencies for BioVault tracked loci.',
		superPopulation: 'AFR'
	},
	{
		id: '1kgp-amr',
		biobankSlug: '1kgp',
		title: '1KGP-AMR',
		cohortIds: [10],
		assay: 'WGS',
		platform: 'WGS',
		genomeBuild: 'GRCh38',
		region: 'Americas',
		release: 'Phase 3',
		access: '',
		contact: '',
		source: '',
		description: 'Admixed American super-population allele frequencies for BioVault tracked loci.',
		superPopulation: 'AMR'
	},
	{
		id: '1kgp-eas',
		biobankSlug: '1kgp',
		title: '1KGP-EAS',
		cohortIds: [11],
		assay: 'WGS',
		platform: 'WGS',
		genomeBuild: 'GRCh38',
		region: 'East Asia',
		release: 'Phase 3',
		access: '',
		contact: '',
		source: '',
		description: 'East Asian super-population allele frequencies for BioVault tracked loci.',
		superPopulation: 'EAS'
	},
	{
		id: '1kgp-eur',
		biobankSlug: '1kgp',
		title: '1KGP-EUR',
		cohortIds: [12],
		assay: 'WGS',
		platform: 'WGS',
		genomeBuild: 'GRCh38',
		region: 'Europe',
		release: 'Phase 3',
		access: '',
		contact: '',
		source: '',
		description: 'European super-population allele frequencies for BioVault tracked loci.',
		superPopulation: 'EUR'
	},
	{
		id: '1kgp-sas',
		biobankSlug: '1kgp',
		title: '1KGP-SAS',
		cohortIds: [13],
		assay: 'WGS',
		platform: 'WGS',
		genomeBuild: 'GRCh38',
		region: 'South Asia',
		release: 'Phase 3',
		access: '',
		contact: '',
		source: '',
		description: 'South Asian super-population allele frequencies for BioVault tracked loci.',
		superPopulation: 'SAS'
	}
];

export function datasetsForBiobank(slug: string): DatasetCard[] {
	return DATASETS.filter((d) => d.biobankSlug === slug);
}

export function biobankSlugForDatasetSlug(slug?: string): string | undefined {
	if (!slug) return undefined;
	const match = DATASETS.find((d) => d.id === slug);
	if (match) return match.biobankSlug;
	if (slug.startsWith('1kgp')) return '1kgp';
	if (slug.startsWith('cari')) return 'carigenetics';
	if (slug.startsWith('bipmed')) return 'bipmed';
	if (slug.startsWith('pgp')) return 'pgp-harvard';
	return undefined;
}
