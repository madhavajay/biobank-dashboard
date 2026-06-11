DROP TABLE IF EXISTS states;
DROP TABLE IF EXISTS variant_consequences;
DROP TABLE IF EXISTS variant_subjects;
DROP TABLE IF EXISTS state_annotations;

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
	lat REAL NOT NULL,
	lon REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS cohorts (
	id INTEGER PRIMARY KEY,
	biobank_id INTEGER NOT NULL,
	population_id INTEGER NOT NULL,
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
	rsid INTEGER,
	vrs_digest TEXT,
	pos_hg19 INTEGER,
	lifted INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS variants_locus_idx ON variants(chrom, pos, ref, alt);
CREATE INDEX IF NOT EXISTS variants_rsid_idx ON variants(rsid);
CREATE INDEX IF NOT EXISTS variants_chrom_pos_idx ON variants(chrom, pos);

CREATE TABLE IF NOT EXISTS frequencies (
	variant_id INTEGER NOT NULL,
	cohort_id INTEGER NOT NULL,
	biobank_id INTEGER NOT NULL,
	ac INTEGER NOT NULL,
	an INTEGER NOT NULL,
	af REAL NOT NULL,
	n_homo INTEGER,
	n_hetero INTEGER,
	n_homo_ref INTEGER,
	PRIMARY KEY (variant_id, cohort_id)
);
CREATE INDEX IF NOT EXISTS frequencies_cohort_idx ON frequencies(cohort_id);
CREATE INDEX IF NOT EXISTS frequencies_biobank_idx ON frequencies(biobank_id);
