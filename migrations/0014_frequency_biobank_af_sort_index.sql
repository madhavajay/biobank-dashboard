-- Max-AF sorting scoped to selected biobanks.

CREATE INDEX IF NOT EXISTS frequencies_biobank_variant_public_af_idx
	ON frequencies(biobank_id, variant_id, public_af);
