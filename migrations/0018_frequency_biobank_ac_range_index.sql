-- Biobank-scoped allele-count range filter.

CREATE INDEX IF NOT EXISTS frequencies_biobank_public_ac_variant_observed_idx
	ON frequencies(biobank_id, public_ac, variant_id)
	WHERE ac > 0 AND public_ac IS NOT NULL;
