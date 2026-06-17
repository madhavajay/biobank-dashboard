-- Global allele-count range filter.

CREATE INDEX IF NOT EXISTS frequencies_public_ac_variant_observed_idx
	ON frequencies(public_ac, variant_id)
	WHERE ac > 0 AND public_ac IS NOT NULL;
