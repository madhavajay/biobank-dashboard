/**
 * Shared variant search token parsing, classification, and row matching.
 * Used by the map search bar (client) and PostgreSQL query layer (server).
 */

export const LOCUS_EXACT_POS_MIN_LEN = 8;
export const RSID_EXACT_MIN_LEN = 8;
export const GENE_SEARCH_MIN_LEN = 1;

export function chromToCode(raw: string): number | null {
	let c = raw.trim().toUpperCase();
	if (c === 'M') c = 'MT';
	const entry = Object.entries({
		1: '1', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9',
		10: '10', 11: '11', 12: '12', 13: '13', 14: '14', 15: '15', 16: '16', 17: '17',
		18: '18', 19: '19', 20: '20', 21: '21', 22: '22', 23: 'X', 24: 'Y', 25: 'MT'
	}).find(([, name]) => name === c);
	return entry ? Number(entry[0]) : null;
}

/** Normalize user input: trim, collapse spaces, unify separators, fold case where safe. */
export function normalizeVariantSearchInput(raw: string): string {
	let s = raw.trim().replace(/\s+/g, ' ');
	if (!s) return s;
	s = s.replace(/,\s*(?=\d)/g, ''); // 44,903,787 -> 44903787
	s = s.replace(/\s*-\s*/g, '-');
	s = s.replace(/:\s+/g, ':');
	// chr1 63000000 / chr1  63000000 -> chr1:63000000
	s = s.replace(/^(chr(?:[0-9]+|[xyXYmtMT]))\s+(\d+)/i, '$1:$2');
	// 1 63000000 -> 1:63000000 (only when second part looks like a position)
	s = s.replace(/^([0-9]{1,2}|x|y|mt|m)\s+(\d{2,})$/i, '$1:$2');
	// r1050828 / R105 -> rs1050828 (rsID shorthand without the "s")
	s = s.replace(/^r(\d+)$/i, 'rs$1');
	return s;
}

export function normalizeHgvsSearch(raw: string): string | null {
	const s = normalizeVariantSearchInput(raw);
	if (!s) return null;
	const suffix = s.includes(':') ? s.slice(s.lastIndexOf(':') + 1) : s;
	return /^(?:p|c|n|m|r)\.[A-Za-z0-9_*?>=<+\-[\]();]+$/i.test(suffix) ? suffix : null;
}

export function looksLikeLocusToken(raw: string): boolean {
	return /^chr(?:[0-9]+|[xyXYmtMT]|[-:]|$)/i.test(normalizeVariantSearchInput(raw));
}

export function looksLikeRsidToken(raw: string): boolean {
	return /^rs(\d*)$/i.test(normalizeVariantSearchInput(raw).replace(/,/g, ''));
}

export function looksLikeGeneSymbol(raw: string): boolean {
	if (looksLikeRsidToken(raw)) return false;
	const s = normalizeVariantSearchInput(raw);
	return /^[A-Za-z][A-Za-z0-9._-]{0,31}$/.test(s);
}

export function looksLikeStructuredSearchToken(raw: string): boolean {
	const s = normalizeVariantSearchInput(raw).replace(/,/g, '');
	if (!s) return true;
	if (looksLikeLocusToken(s)) return true;
	if (looksLikeRsidToken(s)) return true;
	if (/^\d+$/.test(s)) return true;
	if (looksLikeGeneSymbol(s)) return true;
	if (normalizeHgvsSearch(s)) return true;
	if (/^(?:ga4gh:VA\.)?[A-Za-z0-9_-]{32}$/.test(s)) return true;
	return false;
}

/** Defer live search only while the token is too ambiguous to be useful. */
export function isIncompleteVariantSearchQuery(query: string): boolean {
	const s = normalizeVariantSearchInput(query);
	if (!s) return false;
	if (/^chr$/i.test(s)) return true;
	// chr1: / 1: with no position yet
	if (/^(?:chr)?([0-9]+|[xyXYmtMT]|mt|m):$/i.test(s)) return true;
	// partial HGVS / gene:HGVS stubs
	if (/^(?:p|c|n|m|r)\.?$/i.test(s)) return true;
	if (/^[A-Za-z0-9._-]+:(?:p|c|n|m|r)\.?$/i.test(s)) return true;
	// partial VRS digest
	if (/^(?:ga4gh:)?(?:VA\.?)?$/i.test(s)) return true;
	if (/^ga4gh:?$/i.test(s)) return true;
	if (/^VA\.?[A-Za-z0-9_-]{0,31}$/i.test(s) && s.length < 35) return true;
	return false;
}

export function rsidTokenCondition(digits: string): { sql: string; args: unknown[] } | null {
	if (!digits.length) return { sql: 'v.rsid IS NOT NULL', args: [] };
	if (digits.length >= RSID_EXACT_MIN_LEN) return { sql: 'v.rsid=?', args: [Number(digits)] };
	return { sql: 'CAST(v.rsid AS TEXT) LIKE ?', args: [`${digits}%`] };
}

function numericTokenCondition(raw: string): { sql: string; args: unknown[] } | null {
	if (!/^\d+$/.test(raw)) return null;
	if (raw.length >= RSID_EXACT_MIN_LEN) {
		return { sql: '(v.id=? OR v.rsid=?)', args: [Number(raw), Number(raw)] };
	}
	const chrom = chromToCode(raw);
	if (chrom != null && raw.length <= 2) {
		return {
			sql: '(v.chrom=? OR v.id=? OR CAST(v.rsid AS TEXT) LIKE ?)',
			args: [chrom, Number(raw), `${raw}%`],
		};
	}
	return { sql: '(v.id=? OR CAST(v.rsid AS TEXT) LIKE ?)', args: [Number(raw), `${raw}%`] };
}

/** Parse one search term into a SQL WHERE fragment (variant table alias `v`). */
export function parseVariantSearchTerm(raw: string): { sql: string; args: unknown[] } | null {
	const s = normalizeVariantSearchInput(raw).replace(/,/g, '');
	if (!s) return null;

	const hgvs = normalizeHgvsSearch(s);
	if (hgvs) return { sql: 'v.hgvs_consequence=?', args: [hgvs] };

	let m = /^rs(\d*)$/i.exec(s);
	if (m) return rsidTokenCondition(m[1]);

	m = /^(?:ga4gh:VA\.)?([A-Za-z0-9_-]{32})$/i.exec(s);
	if (m) return { sql: 'v.vrs_digest=?', args: [m[1]] };

	m = /^(?:chr)?([0-9]+|x|y|mt|m)[-:](\d+)-([A-Za-z]+)-([A-Za-z]+)$/i.exec(s);
	if (m) {
		const c = chromToCode(m[1]);
		if (c) return { sql: '(v.chrom=? AND v.pos=? AND v.ref=? AND v.alt=?)', args: [c, Number(m[2]), m[3].toUpperCase(), m[4].toUpperCase()] };
	}

	m = /^(?:chr)?([0-9]+|x|y|mt|m)[-:]\s?(\d+)\s*-\s*(\d+)$/i.exec(s);
	if (m) {
		const c = chromToCode(m[1]);
		if (c) return { sql: '(v.chrom=? AND v.pos>=? AND v.pos<=?)', args: [c, Number(m[2]), Number(m[3])] };
	}

	m = /^(?:chr)?([0-9]+|x|y|mt|m)[-:]$/i.exec(s);
	if (m) {
		const c = chromToCode(m[1]);
		if (c) return { sql: 'v.chrom=?', args: [c] };
	}

	m = /^(?:chr)?([0-9]+|x|y|mt|m)[-:]\s?(\d+)$/i.exec(s);
	if (m) {
		const c = chromToCode(m[1]);
		const posStr = m[2];
		if (c) {
			if (posStr.length >= LOCUS_EXACT_POS_MIN_LEN) {
				return { sql: '(v.chrom=? AND v.pos=?)', args: [c, Number(posStr)] };
			}
			return { sql: '(v.chrom=? AND CAST(v.pos AS TEXT) LIKE ?)', args: [c, `${posStr}%`] };
		}
	}

	m = /^(?:chr)?([0-9]+|x|y|mt|m)$/i.exec(s);
	if (m) {
		const c = chromToCode(m[1]);
		if (c) {
			if (/^\d+$/.test(m[1]) && m[1].length <= 2) return numericTokenCondition(m[1]);
			return { sql: 'v.chrom=?', args: [c] };
		}
	}

	return numericTokenCondition(s);
}

export function parseVariantQueryCondition(q: string): { sql: string; args: unknown[] } | null {
	const conds = q
		.split('|')
		.map((t) => parseVariantSearchTerm(t.trim()))
		.filter((t): t is { sql: string; args: unknown[] } => t !== null);
	if (!conds.length) return null;
	if (conds.length === 1) return conds[0];
	return { sql: '(' + conds.map((c) => c.sql).join(' OR ') + ')', args: conds.flatMap((c) => c.args) };
}

export interface VariantSearchRow {
	id: number;
	chrom: number;
	chromName: string;
	pos: number;
	ref: string;
	alt: string;
	rsid: number | null;
	vrsDigest: string | null;
	hgvsConsequence?: string | null;
	genes: Array<{ symbol: string; ensemblId: string }>;
}

function normGeneSymbol(raw: string): string {
	return raw.trim().toUpperCase();
}

export function rowMatchesRsidToken(row: Pick<VariantSearchRow, 'id' | 'rsid'>, raw: string): boolean {
	const s = normalizeVariantSearchInput(raw).replace(/,/g, '');
	let m = /^rs(\d*)$/i.exec(s);
	if (m) {
		const digits = m[1];
		if (!digits.length) return row.rsid != null;
		if (row.rsid == null) return false;
		if (digits.length >= RSID_EXACT_MIN_LEN) return row.rsid === Number(digits);
		return String(row.rsid).startsWith(digits);
	}
	if (/^\d+$/.test(s)) {
		if (s.length >= RSID_EXACT_MIN_LEN) return row.id === Number(s) || row.rsid === Number(s);
		if (row.rsid != null && String(row.rsid).startsWith(s)) return true;
		return row.id === Number(s);
	}
	return false;
}

export function rowMatchesGeneToken(row: Pick<VariantSearchRow, 'genes'>, raw: string): boolean {
	if (looksLikeLocusToken(raw)) return false;
	if (looksLikeRsidToken(raw)) return false;
	const norm = normGeneSymbol(raw);
	if (norm.length < GENE_SEARCH_MIN_LEN || !looksLikeGeneSymbol(raw)) return false;
	return row.genes.some((g) => {
		const sym = normGeneSymbol(g.symbol);
		const ens = normGeneSymbol(g.ensemblId.split('.')[0]);
		if (sym === norm || ens === norm) return true;
		if (sym.startsWith(norm) || ens.startsWith(norm)) return true;
		return sym.includes(norm) || g.ensemblId.toUpperCase().includes(norm);
	});
}

export function rowMatchesLocusToken(row: Pick<VariantSearchRow, 'chrom' | 'pos'>, raw: string): boolean {
	const s = normalizeVariantSearchInput(raw).replace(/,/g, '');
	if (!s) return false;
	let m = /^(?:chr)?([0-9]+|x|y|mt|m)[-:]\s?(\d+)\s*-\s*(\d+)$/i.exec(s);
	if (m) {
		const c = chromToCode(m[1]);
		if (c && row.chrom === c && row.pos >= Number(m[2]) && row.pos <= Number(m[3])) return true;
	}
	m = /^(?:chr)?([0-9]+|x|y|mt|m)[-:]$/i.exec(s);
	if (m) {
		const c = chromToCode(m[1]);
		if (c && row.chrom === c) return true;
	}
	m = /^(?:chr)?([0-9]+|x|y|mt|m)[-:]\s?(\d+)$/i.exec(s);
	if (m) {
		const c = chromToCode(m[1]);
		const posStr = m[2];
		if (c && row.chrom === c) {
			if (posStr.length >= LOCUS_EXACT_POS_MIN_LEN) return row.pos === Number(posStr);
			return String(row.pos).startsWith(posStr);
		}
	}
	m = /^(?:chr)?([0-9]+|x|y|mt|m)$/i.exec(s);
	if (m) {
		const c = chromToCode(m[1]);
		if (c && row.chrom === c) return true;
	}
	return false;
}

export function variantTokenMatchesRow(
	row: Pick<VariantSearchRow, 'id' | 'chrom' | 'pos' | 'ref' | 'alt' | 'rsid' | 'vrsDigest'>,
	token: string
): boolean {
	const s = normalizeVariantSearchInput(token).replace(/,/g, '');
	if (/^\d+$/.test(s)) {
		if (s.length >= RSID_EXACT_MIN_LEN) return row.id === Number(s) || row.rsid === Number(s);
		if (row.rsid != null && String(row.rsid).startsWith(s)) return true;
		const chrom = chromToCode(s);
		if (chrom != null && row.chrom === chrom) return true;
		return row.id === Number(s);
	}
	if (rowMatchesRsidToken(row, s)) return true;

	const m = /^(?:ga4gh:VA\.)?([A-Za-z0-9_-]{32})$/i.exec(s);
	if (m) return row.vrsDigest === m[1];

	const refAlt = /^(?:chr)?([0-9]+|x|y|mt|m)[-:](\d+)-([A-Za-z]+)-([A-Za-z]+)$/i.exec(s);
	if (refAlt) {
		const chrom = chromToCode(refAlt[1]);
		if (!chrom) return false;
		return row.chrom === chrom && row.pos === Number(refAlt[2]) && row.ref === refAlt[3].toUpperCase() && row.alt === refAlt[4].toUpperCase();
	}
	return false;
}

function rowMatchesFuzzyToken(row: VariantSearchRow, raw: string): boolean {
	const needle = normalizeVariantSearchInput(raw).toLowerCase();
	if (!needle) return false;
	const variantKey = `${row.chromName}-${row.pos}-${row.ref}-${row.alt}`.toLowerCase();
	const rsKey = row.rsid != null ? `rs${row.rsid}` : '';
	const hgvs = (row.hgvsConsequence ?? '').toLowerCase();
	const vrs = row.vrsDigest?.toLowerCase() ?? '';
	if (
		variantKey.includes(needle) ||
		rsKey.includes(needle) ||
		hgvs.includes(needle) ||
		vrs.includes(needle) ||
		String(row.id).includes(needle) ||
		String(row.pos).includes(needle) ||
		row.ref.toLowerCase().includes(needle) ||
		row.alt.toLowerCase().includes(needle)
	) {
		return true;
	}
	return row.genes.some(
		(g) =>
			g.symbol.toLowerCase().includes(needle) ||
			g.ensemblId.toLowerCase().includes(needle)
	);
}

export function rowMatchesSearchToken(row: VariantSearchRow, raw: string): boolean {
	const s = normalizeVariantSearchInput(raw).replace(/,/g, '');
	if (!s) return false;
	if (variantTokenMatchesRow(row, s)) return true;
	if (rowMatchesRsidToken(row, s)) return true;
	const hgvs = normalizeHgvsSearch(s);
	if (hgvs && (row.hgvsConsequence ?? '').toLowerCase().includes(hgvs.toLowerCase())) return true;
	if ((row.hgvsConsequence ?? '').toLowerCase().includes(s.toLowerCase())) return true;
	if (rowMatchesLocusToken(row, s)) return true;
	if (looksLikeLocusToken(s)) return false;
	if (rowMatchesGeneToken(row, s)) return true;
	if (looksLikeGeneSymbol(s)) return false;
	if (/^\d+$/.test(s)) return rowMatchesFuzzyToken(row, s);
	if (looksLikeStructuredSearchToken(s)) return false;
	return rowMatchesFuzzyToken(row, s);
}

/** Multi-token query: whitespace-separated AND groups, pipe OR within each group. */
export function rowMatchesSearchQuery(row: VariantSearchRow, q: string): boolean {
	const groups = normalizeVariantSearchInput(q)
		.split(/\s+/)
		.map((t) => t.trim())
		.filter(Boolean);
	if (!groups.length) return true;
	return groups.every((group) => {
		const terms = group
			.split('|')
			.map((t) => t.trim())
			.filter(Boolean);
		return terms.some((term) => rowMatchesSearchToken(row, term));
	});
}
