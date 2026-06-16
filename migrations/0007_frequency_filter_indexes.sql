-- Explore filters often start from selected populations/cohorts and then need
-- the matching variant ids. This composite index supports those candidate scans
-- better than the old single-column cohort index while preserving the primary
-- key (variant_id, cohort_id) used for per-variant row fetches.
CREATE INDEX IF NOT EXISTS frequencies_cohort_variant_idx
	ON frequencies(cohort_id, variant_id);
