CREATE TABLE IF NOT EXISTS population_country_mappings (
	id INTEGER PRIMARY KEY,
	population_id INTEGER NOT NULL,
	country TEXT NOT NULL,
	country_code TEXT NOT NULL,
	region_group TEXT NOT NULL DEFAULT '',
	subpopulation_code TEXT NOT NULL DEFAULT '',
	subpopulation_name TEXT NOT NULL DEFAULT '',
	sample_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS population_country_mappings_population_idx
	ON population_country_mappings(population_id);

CREATE INDEX IF NOT EXISTS population_country_mappings_country_idx
	ON population_country_mappings(country_code);
