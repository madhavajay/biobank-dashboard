-- datasets: tenant-owned collections of cohorts with JSON metadata.
CREATE TABLE IF NOT EXISTS datasets (
	id INTEGER PRIMARY KEY,
	biobank_id INTEGER NOT NULL,
	slug TEXT NOT NULL,
	metadata TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS datasets_biobank_idx ON datasets(biobank_id);

-- link each cohort to a dataset (variants belong to a dataset via its cohorts).
ALTER TABLE cohorts ADD COLUMN dataset_id INTEGER;
