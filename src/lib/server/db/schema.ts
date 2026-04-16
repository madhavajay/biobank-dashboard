import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const states = sqliteTable('states', {
	code: text('code').primaryKey(),
	name: text('name').notNull(),
	region: text('region').notNull(),
	samples: integer('samples').notNull(),
	areaKm2: real('area_km2').notNull(),
	population: integer('population').notNull(),
	populationMale: integer('population_male').notNull(),
	populationFemale: integer('population_female').notNull(),
	individuals: integer('individuals').notNull(),
	individualsMale: integer('individuals_male').notNull(),
	individualsFemale: integer('individuals_female').notNull(),
	wgsSamples: integer('wgs_samples').notNull(),
	snpSamples: integer('snp_samples').notNull(),
	singleCellSamples: integer('single_cell_samples').notNull(),
	volumeGb: integer('volume_gb').notNull(),
	fastqGb: integer('fastq_gb').notNull(),
	bamGb: integer('bam_gb').notNull(),
	vcfGb: integer('vcf_gb').notNull(),
	genes: integer('genes').notNull(),
	proteinCoding: integer('protein_coding').notNull(),
	lncRna: integer('lnc_rna').notNull(),
	processedPseudogene: integer('processed_pseudogene').notNull(),
	unprocessedPseudogene: integer('unprocessed_pseudogene').notNull(),
	otherGenes: integer('other_genes').notNull(),
	variants: integer('variants').notNull(),
	commonVariants: integer('common_variants').notNull(),
	lowFrequencyVariants: integer('low_frequency_variants').notNull(),
	rareVariants: integer('rare_variants').notNull(),
	otherVariants: integer('other_variants').notNull()
});

export const variants = sqliteTable('variants', {
	id: text('id').primaryKey(),
	project: text('project').notNull(),
	stateCode: text('state_code').notNull(),
	chromosome: text('chromosome').notNull(),
	position: integer('position').notNull(),
	ref: text('ref').notNull(),
	alt: text('alt').notNull(),
	dnaChange: text('dna_change').notNull(),
	variantClass: text('variant_class').notNull(),
	consequence: text('consequence').notNull(),
	alleleFrequency: real('allele_frequency').notNull(),
	ac: integer('ac').notNull(),
	an: integer('an').notNull(),
	geneCount: integer('gene_count').notNull(),
	impact: text('impact').notNull(),
	dbSnp: text('dbsnp').notNull(),
	genotypeQuality: integer('genotype_quality').notNull(),
	gene: text('gene').notNull(),
	subjectCount: integer('subject_count').notNull(),
	tag: text('tag').notNull(),
	functionalImpactGene: text('functional_impact_gene').notNull(),
	functionalImpactVep: text('functional_impact_vep').notNull(),
	heterozygote: integer('heterozygote').notNull(),
	homozygoteAlternative: integer('homozygote_alternative').notNull(),
	homozygoteReference: integer('homozygote_reference').notNull(),
	homozygoteOther: integer('homozygote_other').notNull()
});

export const variantConsequences = sqliteTable('variant_consequences', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	variantId: text('variant_id').notNull(),
	gene: text('gene').notNull(),
	ensemblGene: text('ensembl_gene').notNull(),
	consequence: text('consequence').notNull(),
	impact: text('impact').notNull(),
	canonical: text('canonical').notNull(),
	strand: text('strand').notNull(),
	transcript: text('transcript').notNull()
});

export const variantSubjects = sqliteTable('variant_subjects', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	variantId: text('variant_id').notNull(),
	subjectId: text('subject_id').notNull(),
	ethnicity: text('ethnicity').notNull(),
	state: text('state').notNull(),
	center: text('center').notNull(),
	project: text('project').notNull()
});

export const stateAnnotations = sqliteTable('state_annotations', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	stateCode: text('state_code').notNull(),
	rank: integer('rank').notNull(),
	annotation: text('annotation').notNull()
});
