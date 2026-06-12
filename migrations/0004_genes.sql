CREATE TABLE IF NOT EXISTS genes (
	id INTEGER PRIMARY KEY,
	ensembl_id TEXT NOT NULL,
	symbol TEXT NOT NULL,
	symbol_norm TEXT NOT NULL,
	chrom INTEGER NOT NULL,
	start INTEGER NOT NULL,
	end INTEGER NOT NULL,
	strand TEXT NOT NULL,
	gene_type TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS genes_symbol_norm_idx ON genes(symbol_norm);
CREATE INDEX IF NOT EXISTS genes_region_idx ON genes(chrom, start, end);
