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
	// merged in at load time:
	participants?: number;
	variantCount?: number;
}

export const DATASETS: DatasetCard[] = [
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
			'Allele-frequency reference across six Caribbean nations (Bahamas, Barbados, Bermuda, British Virgin Islands, Saint Lucia, Trinidad & Tobago) on a shared SNP panel, harmonized to GRCh38 with GA4GH VRS identifiers.'
	}
];

export function datasetsForBiobank(slug: string): DatasetCard[] {
	return DATASETS.filter((d) => d.biobankSlug === slug);
}
