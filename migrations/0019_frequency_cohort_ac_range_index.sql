-- Cohort-scoped allele-count range filter.

CREATE INDEX IF NOT EXISTS frequencies_cohort_public_ac_variant_observed_idx
	ON frequencies(cohort_id, public_ac, variant_id)
	WHERE ac > 0 AND public_ac IS NOT NULL;
