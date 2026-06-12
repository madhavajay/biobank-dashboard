-- Composite index so the biobank-scoped EXISTS seeks by (biobank_id, variant_id)
-- instead of scanning every frequency row of a biobank per variant.
DROP INDEX IF EXISTS frequencies_biobank_idx;
CREATE INDEX IF NOT EXISTS frequencies_biobank_variant_idx ON frequencies(biobank_id, variant_id);
