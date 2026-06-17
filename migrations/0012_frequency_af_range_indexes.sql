-- Max-AF sorting by variant.

CREATE INDEX IF NOT EXISTS frequencies_variant_public_af_idx
	ON frequencies(variant_id, public_af);
