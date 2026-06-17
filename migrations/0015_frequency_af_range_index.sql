-- Global allele-frequency range filter.

CREATE INDEX IF NOT EXISTS frequencies_public_af_variant_observed_idx
	ON frequencies(public_af, variant_id)
	WHERE ac > 0 AND public_ac IS NOT NULL;
