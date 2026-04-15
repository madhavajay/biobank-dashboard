CREATE TABLE IF NOT EXISTS states (
	code TEXT PRIMARY KEY,
	name TEXT NOT NULL,
	region TEXT NOT NULL,
	samples INTEGER NOT NULL,
	area_km2 REAL NOT NULL,
	population INTEGER NOT NULL,
	population_male INTEGER NOT NULL,
	population_female INTEGER NOT NULL,
	individuals INTEGER NOT NULL,
	individuals_male INTEGER NOT NULL,
	individuals_female INTEGER NOT NULL,
	wgs_samples INTEGER NOT NULL,
	snp_samples INTEGER NOT NULL,
	single_cell_samples INTEGER NOT NULL,
	volume_gb INTEGER NOT NULL,
	fastq_gb INTEGER NOT NULL,
	bam_gb INTEGER NOT NULL,
	vcf_gb INTEGER NOT NULL,
	genes INTEGER NOT NULL,
	protein_coding INTEGER NOT NULL,
	lnc_rna INTEGER NOT NULL,
	processed_pseudogene INTEGER NOT NULL,
	unprocessed_pseudogene INTEGER NOT NULL,
	other_genes INTEGER NOT NULL,
	variants INTEGER NOT NULL,
	common_variants INTEGER NOT NULL,
	low_frequency_variants INTEGER NOT NULL,
	rare_variants INTEGER NOT NULL,
	other_variants INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS variants (
	id TEXT PRIMARY KEY,
	project TEXT NOT NULL,
	state_code TEXT NOT NULL,
	chromosome TEXT NOT NULL,
	position INTEGER NOT NULL,
	ref TEXT NOT NULL,
	alt TEXT NOT NULL,
	dna_change TEXT NOT NULL,
	variant_class TEXT NOT NULL,
	consequence TEXT NOT NULL,
	allele_frequency REAL NOT NULL,
	ac INTEGER NOT NULL,
	an INTEGER NOT NULL,
	gene_count INTEGER NOT NULL,
	impact TEXT NOT NULL,
	dbsnp TEXT NOT NULL,
	genotype_quality INTEGER NOT NULL,
	gene TEXT NOT NULL,
	subject_count INTEGER NOT NULL,
	tag TEXT NOT NULL,
	functional_impact_gene TEXT NOT NULL,
	functional_impact_vep TEXT NOT NULL,
	heterozygote INTEGER NOT NULL,
	homozygote_alternative INTEGER NOT NULL,
	homozygote_reference INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS variant_consequences (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	variant_id TEXT NOT NULL,
	gene TEXT NOT NULL,
	ensembl_gene TEXT NOT NULL,
	consequence TEXT NOT NULL,
	impact TEXT NOT NULL,
	canonical TEXT NOT NULL,
	strand TEXT NOT NULL,
	transcript TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS variant_subjects (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	variant_id TEXT NOT NULL,
	subject_id TEXT NOT NULL,
	ethnicity TEXT NOT NULL,
	state TEXT NOT NULL,
	center TEXT NOT NULL,
	project TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS state_annotations (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	state_code TEXT NOT NULL,
	rank INTEGER NOT NULL,
	annotation TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS variants_state_code_idx ON variants(state_code);
CREATE INDEX IF NOT EXISTS variants_gene_idx ON variants(gene);
CREATE INDEX IF NOT EXISTS variants_tag_idx ON variants(tag);
CREATE INDEX IF NOT EXISTS variants_dna_change_idx ON variants(dna_change);
CREATE INDEX IF NOT EXISTS variant_consequences_variant_id_idx ON variant_consequences(variant_id);
CREATE INDEX IF NOT EXISTS variant_subjects_variant_id_idx ON variant_subjects(variant_id);
CREATE INDEX IF NOT EXISTS state_annotations_state_code_idx ON state_annotations(state_code);
