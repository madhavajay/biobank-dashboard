-- Tenant, relationship, and direct identifier lookup indexes.

CREATE INDEX IF NOT EXISTS biobanks_slug_idx
	ON biobanks(slug);

CREATE INDEX IF NOT EXISTS populations_biobank_name_idx
	ON populations(biobank_id, name);

CREATE INDEX IF NOT EXISTS populations_country_code_idx
	ON populations(country_code);

CREATE INDEX IF NOT EXISTS cohorts_biobank_population_idx
	ON cohorts(biobank_id, population_id);

CREATE INDEX IF NOT EXISTS cohorts_population_idx
	ON cohorts(population_id);

CREATE INDEX IF NOT EXISTS cohorts_dataset_idx
	ON cohorts(dataset_id);

CREATE INDEX IF NOT EXISTS datasets_biobank_id_idx
	ON datasets(biobank_id, id);

CREATE INDEX IF NOT EXISTS datasets_slug_idx
	ON datasets(slug);

CREATE INDEX IF NOT EXISTS variants_vrs_digest_idx
	ON variants(vrs_digest);

CREATE INDEX IF NOT EXISTS variants_chrom_pos_id_idx
	ON variants(chrom, pos, id);
