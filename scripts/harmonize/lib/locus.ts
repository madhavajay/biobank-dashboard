// Locus parsing + small genomics helpers shared by harmonizers.

const LOCUS_RE = /^([^-]+)-(\d+)-([ACGTNacgtn]+)-([ACGTNacgtn]+)$/;

export interface Locus {
	chrom: string;
	pos: number;
	ref: string;
	alt: string;
}

export function parseLocusKey(key: string): Locus | null {
	const m = LOCUS_RE.exec(key.trim());
	if (!m) return null;
	return { chrom: m[1], pos: Number(m[2]), ref: m[3].toUpperCase(), alt: m[4].toUpperCase() };
}

const COMP: Record<string, string> = { A: 'T', T: 'A', G: 'C', C: 'G', N: 'N' };
export function revComp(seq: string): string {
	let out = '';
	for (let i = seq.length - 1; i >= 0; i--) out += COMP[seq[i]] ?? 'N';
	return out;
}

export function isSnv(ref: string, alt: string): boolean {
	return ref.length === 1 && alt.length === 1 && ref !== alt && COMP[ref] && COMP[alt] ? true : false;
}

export function alleleFreq(ac: number, an: number): number {
	return an > 0 ? ac / an : 0;
}

// rsid -> numeric (strip "rs"); returns null when absent/blank.
export function rsidNum(raw: string | undefined): number | null {
	if (!raw) return null;
	const s = raw.trim();
	if (!s || s === '.' || s === 'NA') return null;
	const m = /^rs(\d+)$/i.exec(s);
	return m ? Number(m[1]) : null;
}

// Canonical key used to dedupe variants across biobanks (GRCh38 space).
export function variantKey(code: number, pos: number, ref: string, alt: string): string {
	return `${code}:${pos}:${ref}:${alt}`;
}
