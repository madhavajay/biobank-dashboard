-- Public frequency fields derived from the exact legacy columns.
-- To change the threshold later, update ALLELE_COUNT_REPORTING_THRESHOLD and rerun
-- scripts/recalculate-frequency-privacy.ts.
ALTER TABLE frequencies ADD COLUMN ac_masked INTEGER NOT NULL DEFAULT 0;
ALTER TABLE frequencies ADD COLUMN public_ac INTEGER;
ALTER TABLE frequencies ADD COLUMN public_af REAL;
ALTER TABLE frequencies ADD COLUMN ac_upper_bound INTEGER;
ALTER TABLE frequencies ADD COLUMN af_upper_bound REAL;
ALTER TABLE frequencies ADD COLUMN genotype_masked INTEGER NOT NULL DEFAULT 0;
ALTER TABLE frequencies ADD COLUMN public_n_hetero INTEGER;
ALTER TABLE frequencies ADD COLUMN public_n_homo INTEGER;
ALTER TABLE frequencies ADD COLUMN public_n_homo_ref INTEGER;

UPDATE frequencies
SET
	ac_masked = CASE WHEN ac < 5 THEN 1 ELSE 0 END,
	public_ac = CASE WHEN ac >= 5 THEN ac ELSE NULL END,
	public_af = CASE WHEN ac >= 5 THEN af ELSE NULL END,
	ac_upper_bound = CASE WHEN ac < 5 THEN 5 ELSE NULL END,
	af_upper_bound = CASE WHEN ac < 5 AND an > 0 THEN MIN(1.0, 5.0 / an) ELSE NULL END,
	genotype_masked = CASE WHEN n_hetero IS NOT NULL AND n_homo IS NOT NULL AND n_homo_ref IS NOT NULL AND (n_hetero < 5 OR n_homo < 5 OR n_homo_ref < 5) THEN 1 ELSE 0 END,
	public_n_hetero = CASE WHEN n_hetero IS NOT NULL AND n_homo IS NOT NULL AND n_homo_ref IS NOT NULL AND (n_hetero < 5 OR n_homo < 5 OR n_homo_ref < 5) THEN NULL ELSE n_hetero END,
	public_n_homo = CASE WHEN n_hetero IS NOT NULL AND n_homo IS NOT NULL AND n_homo_ref IS NOT NULL AND (n_hetero < 5 OR n_homo < 5 OR n_homo_ref < 5) THEN NULL ELSE n_homo END,
	public_n_homo_ref = CASE WHEN n_hetero IS NOT NULL AND n_homo IS NOT NULL AND n_homo_ref IS NOT NULL AND (n_hetero < 5 OR n_homo < 5 OR n_homo_ref < 5) THEN NULL ELSE n_homo_ref END;

CREATE INDEX IF NOT EXISTS frequencies_public_ac_idx ON frequencies(public_ac);
CREATE INDEX IF NOT EXISTS frequencies_public_af_idx ON frequencies(public_af);
