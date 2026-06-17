-- Gene symbol lookup and variant-gene interval joins.

CREATE INDEX IF NOT EXISTS genes_symbol_norm_region_idx
	ON genes(symbol_norm, chrom, start, end);

CREATE INDEX IF NOT EXISTS genes_chrom_start_end_symbol_idx
	ON genes(chrom, start, end, symbol_norm);
