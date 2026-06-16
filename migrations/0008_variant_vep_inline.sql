ALTER TABLE variants ADD COLUMN vep_label TEXT;
ALTER TABLE variants ADD COLUMN vep_impact TEXT;
ALTER TABLE variants ADD COLUMN hgvs_consequence TEXT;
ALTER TABLE variants ADD COLUMN vep_has_multiple_consequences INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS variants_vep_impact_locus_idx
	ON variants(vep_impact, chrom, pos, id);

CREATE INDEX IF NOT EXISTS variants_vep_label_locus_idx
	ON variants(vep_label, chrom, pos, id);

CREATE INDEX IF NOT EXISTS variants_hgvs_consequence_idx
	ON variants(hgvs_consequence);
