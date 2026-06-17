-- Hot observed-frequency paths: default explore totals, scoped totals, and
-- EXISTS checks that require a real observed alternate allele.

CREATE INDEX IF NOT EXISTS frequencies_variant_observed_idx
	ON frequencies(variant_id)
	WHERE ac > 0;

CREATE INDEX IF NOT EXISTS frequencies_biobank_variant_observed_idx
	ON frequencies(biobank_id, variant_id)
	WHERE ac > 0;

CREATE INDEX IF NOT EXISTS frequencies_cohort_variant_observed_idx
	ON frequencies(cohort_id, variant_id)
	WHERE ac > 0;
