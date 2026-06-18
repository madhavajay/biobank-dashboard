CREATE TABLE IF NOT EXISTS biobanks (
	id INTEGER PRIMARY KEY,
	slug TEXT NOT NULL,
	name TEXT NOT NULL,
	description TEXT NOT NULL DEFAULT '',
	website TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS populations (
	id INTEGER PRIMARY KEY,
	biobank_id INTEGER NOT NULL,
	name TEXT NOT NULL,
	country TEXT NOT NULL,
	country_code TEXT NOT NULL,
	admin_level TEXT NOT NULL DEFAULT 'country',
	lat DOUBLE PRECISION NOT NULL,
	lon DOUBLE PRECISION NOT NULL
);

CREATE TABLE IF NOT EXISTS population_country_mappings (
	id INTEGER PRIMARY KEY,
	population_id INTEGER NOT NULL,
	country TEXT NOT NULL,
	country_code TEXT NOT NULL,
	region_group TEXT NOT NULL DEFAULT '',
	subpopulation_code TEXT NOT NULL DEFAULT '',
	subpopulation_name TEXT NOT NULL DEFAULT '',
	sample_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS datasets (
	id INTEGER PRIMARY KEY,
	biobank_id INTEGER NOT NULL,
	slug TEXT NOT NULL,
	metadata TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS cohorts (
	id INTEGER PRIMARY KEY,
	biobank_id INTEGER NOT NULL,
	population_id INTEGER NOT NULL,
	dataset_id INTEGER,
	label TEXT NOT NULL,
	assay TEXT NOT NULL DEFAULT 'unknown',
	release TEXT NOT NULL DEFAULT '',
	sample_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS variants (
	id INTEGER PRIMARY KEY,
	chrom INTEGER NOT NULL,
	pos INTEGER NOT NULL,
	ref TEXT NOT NULL,
	alt TEXT NOT NULL,
	rsid BIGINT,
	vrs_digest TEXT,
	pos_hg19 INTEGER,
	lifted INTEGER NOT NULL DEFAULT 0,
	vep_label TEXT,
	vep_impact TEXT,
	hgvs_consequence TEXT,
	vep_has_multiple_consequences INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS genes (
	id INTEGER PRIMARY KEY,
	ensembl_id TEXT NOT NULL,
	symbol TEXT NOT NULL,
	symbol_norm TEXT NOT NULL,
	chrom INTEGER NOT NULL,
	start INTEGER NOT NULL,
	"end" INTEGER NOT NULL,
	strand TEXT NOT NULL,
	gene_type TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS frequencies (
	variant_id INTEGER NOT NULL,
	cohort_id INTEGER NOT NULL,
	biobank_id INTEGER NOT NULL,
	ac INTEGER NOT NULL,
	an INTEGER NOT NULL,
	af DOUBLE PRECISION NOT NULL,
	n_homo INTEGER,
	n_hetero INTEGER,
	n_homo_ref INTEGER,
	ac_masked INTEGER NOT NULL DEFAULT 0,
	public_ac INTEGER,
	public_af DOUBLE PRECISION,
	ac_upper_bound INTEGER,
	af_upper_bound DOUBLE PRECISION,
	genotype_masked INTEGER NOT NULL DEFAULT 0,
	public_n_hetero INTEGER,
	public_n_homo INTEGER,
	public_n_homo_ref INTEGER,
	PRIMARY KEY (variant_id, cohort_id)
);

CREATE TABLE IF NOT EXISTS stats (
	key TEXT PRIMARY KEY,
	value TEXT NOT NULL
);
