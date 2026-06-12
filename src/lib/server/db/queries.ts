// Engine query layer — runs directly on the D1 binding for predictable analytics.
import { CODE_CHROM, REFGET_SQ } from './chroms';
import { publicVariantId } from '$lib/variant-id';

export interface FreqCell {
	cohortId: number;
	cohortLabel: string;
	population: string;
	countryCode: string;
	biobankId: number;
	biobankSlug: string;
	af: number;
	ac: number;
	an: number;
	nHomo: number | null;
	nHetero: number | null;
	nHomoRef: number | null;
}

export interface VariantRow {
	id: number;
	chrom: number;
	chromName: string;
	pos: number;
	ref: string;
	alt: string;
	rsid: number | null;
	vrsDigest: string | null;
	posHg19: number | null;
	lifted: number;
	genes: GeneHit[];
	frequencies: FreqCell[];
}

export interface GeneHit {
	ensemblId: string;
	symbol: string;
	geneType: string;
	start: number;
	end: number;
	strand: string;
}

async function biobankIdForSlug(db: D1Database, slug: string | null): Promise<number | null> {
	if (!slug) return null;
	const r = await db.prepare('SELECT id FROM biobanks WHERE slug=?').bind(slug).first<{ id: number }>();
	return r?.id ?? null;
}

async function biobankIdsForSlugs(db: D1Database, slugs: string[]): Promise<number[]> {
	if (!slugs.length) return [];
	const ph = slugs.map(() => '?').join(',');
	const r = await db.prepare(`SELECT id FROM biobanks WHERE slug IN (${ph})`).bind(...slugs).all<{ id: number }>();
	return r.results.map((x) => x.id);
}

export interface SearchParams {
	q?: string;
	chrom?: number;
	posMin?: number;
	posMax?: number;
	rsid?: number;
	rsids?: number[];
	gene?: string;
	afMin?: number;
	afMax?: number;
	acMin?: number;
	acMax?: number;
	vrs?: string;
	cohorts?: number[]; // restrict to these cohort/population ids (display + existence)
	cohortMatch?: 'any' | 'all';
	limit?: number;
	offset?: number;
	// biobank filter: which biobanks to require, and whether a variant must appear
	// in ANY ('any') or ALL ('all') of them.
	biobanks?: string[];
	match?: 'any' | 'all';
	sort?: 'variant' | 'rsid' | 'maxaf' | 'vrs';
	dir?: 'asc' | 'desc';
}

// A single search term -> a variant-matching SQL condition. Terms can be an rsID,
// a VRS id, a chromosome, a position, or a range.
function parseTerm(raw: string): { sql: string; args: unknown[] } | null {
	const s = raw.trim().replace(/,/g, ''); // tolerate thousands separators: 44,903,787
	if (!s) return null;
	let m = /^rs(\d+)$/i.exec(s);
	if (m) return { sql: 'v.rsid=?', args: [Number(m[1])] };
	m = /^(?:ga4gh:VA\.)?([A-Za-z0-9_-]{32})$/.exec(s);
	if (m) return { sql: 'v.vrs_digest=?', args: [m[1]] };
	m = /^(?:chr)?([0-9]+|x|y|mt|m)[-:](\d+)-([A-Za-z]+)-([A-Za-z]+)$/i.exec(s);
	if (m) {
		const c = chromToCode(m[1]);
		if (c) return { sql: '(v.chrom=? AND v.pos=? AND v.ref=? AND v.alt=?)', args: [c, Number(m[2]), m[3].toUpperCase(), m[4].toUpperCase()] };
	}
	m = /^(?:chr)?([0-9]+|x|y|mt|m)[-:]\s?(\d+)\s*-\s*(\d+)$/i.exec(s); // range
	if (m) {
		const c = chromToCode(m[1]);
		if (c) return { sql: '(v.chrom=? AND v.pos>=? AND v.pos<=?)', args: [c, Number(m[2]), Number(m[3])] };
	}
	m = /^(?:chr)?([0-9]+|x|y|mt|m)[-:]\s?(\d+)$/i.exec(s); // single position
	if (m) {
		const c = chromToCode(m[1]);
		if (c) return { sql: '(v.chrom=? AND v.pos=?)', args: [c, Number(m[2])] };
	}
	m = /^(?:chr)?([0-9]+|x|y|mt|m)$/i.exec(s); // whole chromosome
	if (m) {
		const c = chromToCode(m[1]);
		if (c) return { sql: 'v.chrom=?', args: [c] };
	}
	return null;
}

// Compound query: term | term | term  -> OR of the terms (any type mix).
function parseQueryCondition(q: string): { sql: string; args: unknown[] } | null {
	const conds = q
		.split('|')
		.map((t) => parseTerm(t))
		.filter((t): t is { sql: string; args: unknown[] } => t !== null);
	if (!conds.length) return null;
	if (conds.length === 1) return conds[0];
	return { sql: '(' + conds.map((c) => c.sql).join(' OR ') + ')', args: conds.flatMap((c) => c.args) };
}

function normGeneSymbol(raw: string): string {
	return raw.trim().toUpperCase();
}

function looksLikeGeneSymbol(raw: string): boolean {
	return /^[A-Za-z][A-Za-z0-9._-]{1,31}$/.test(raw.trim());
}

async function genesForSymbols(db: D1Database, symbols: string[]): Promise<{ chrom: number; start: number; end: number }[]> {
	const norms = [...new Set(symbols.map(normGeneSymbol).filter(Boolean))];
	if (!norms.length) return [];
	const ph = norms.map(() => '?').join(',');
	try {
		const r = await db
			.prepare(`SELECT chrom,start,end FROM genes WHERE symbol_norm IN (${ph})`)
			.bind(...norms)
			.all<{ chrom: number; start: number; end: number }>();
		return r.results;
	} catch {
		return [];
	}
}

export async function attachGenesToRows<T extends { id: number }>(db: D1Database, rows: T[]): Promise<(T & { genes: GeneHit[] })[]> {
	const ids = rows.map((r) => r.id);
	if (!ids.length) return rows.map((r) => ({ ...r, genes: [] }));
	const placeholders = ids.map(() => '?').join(',');
	try {
		const grows = await db
			.prepare(`
			SELECT v.id variant_id, g.ensembl_id, g.symbol, g.gene_type, g.start, g.end, g.strand
			FROM variants v
			JOIN genes g ON g.chrom=v.chrom AND v.pos BETWEEN g.start AND g.end
			WHERE v.id IN (${placeholders})
			ORDER BY g.symbol`)
			.bind(...ids)
			.all<any>();
		const genesByVariant = new Map<number, GeneHit[]>();
		for (const g of grows.results) {
			const arr = genesByVariant.get(g.variant_id) ?? [];
			arr.push({
				ensemblId: g.ensembl_id,
				symbol: g.symbol,
				geneType: g.gene_type,
				start: g.start,
				end: g.end,
				strand: g.strand
			});
			genesByVariant.set(g.variant_id, arr);
		}
		return rows.map((r) => ({ ...r, genes: genesByVariant.get(r.id) ?? [] }));
	} catch {
		return rows.map((r) => ({ ...r, genes: [] }));
	}
}

async function conditionForQueryToken(db: D1Database, raw: string): Promise<{ sql: string; args: unknown[] } | null> {
	const parsed = parseTerm(raw);
	if (parsed) return parsed;
	if (!looksLikeGeneSymbol(raw)) return null;
	const geneIntervals = await genesForSymbols(db, [raw]);
	if (!geneIntervals.length) return { sql: '0', args: [] };
	if (geneIntervals.length === 1) {
		const g = geneIntervals[0];
		return { sql: '(v.chrom=? AND v.pos>=? AND v.pos<=?)', args: [g.chrom, g.start, g.end] };
	}
	return {
		sql: '(' + geneIntervals.map(() => '(v.chrom=? AND v.pos>=? AND v.pos<=?)').join(' OR ') + ')',
		args: geneIntervals.flatMap((g) => [g.chrom, g.start, g.end])
	};
}

async function parseQueryConditionWithGenes(db: D1Database, q: string): Promise<{ sql: string; args: unknown[] } | null> {
	const groups = q
		.trim()
		.replace(/\s*-\s*/g, '-')
		.replace(/:\s+/g, ':')
		.split(/\s+/)
		.map((t) => t.trim())
		.filter(Boolean);
	if (!groups.length) return null;

	const andConds: { sql: string; args: unknown[] }[] = [];
	for (const group of groups) {
		const orConds = (
			await Promise.all(
				group
					.split('|')
					.map((t) => t.trim())
					.filter(Boolean)
					.map((t) => conditionForQueryToken(db, t))
			)
		).filter((t): t is { sql: string; args: unknown[] } => t !== null);
		if (!orConds.length) return { sql: '0', args: [] };
		if (orConds.length === 1) andConds.push(orConds[0]);
		else andConds.push({ sql: '(' + orConds.map((c) => c.sql).join(' OR ') + ')', args: orConds.flatMap((c) => c.args) });
	}

	if (andConds.length === 1) return andConds[0];
	return { sql: '(' + andConds.map((c) => c.sql).join(' AND ') + ')', args: andConds.flatMap((c) => c.args) };
}

function chromToCode(raw: string): number | null {
	let c = raw.toUpperCase();
	if (c === 'M') c = 'MT';
	const entry = Object.entries(CODE_CHROM).find(([, name]) => name === c);
	return entry ? Number(entry[0]) : null;
}

export async function searchVariants(
	db: D1Database,
	scopeSlug: string | null,
	params: SearchParams
): Promise<{ rows: VariantRow[]; total: number }> {
	const limit = Math.min(Math.max(params.limit ?? 50, 1), 500);
	const offset = Math.max(params.offset ?? 0, 0);

	// Effective biobank set: a scoped tenant is a hard override; otherwise use the
	// requested slugs (empty => all biobanks). `match` = ANY vs ALL of the set.
	const requested = scopeSlug ? [scopeSlug] : params.biobanks ?? [];
	const biobankIds = requested.length ? await biobankIdsForSlugs(db, requested) : [];
	const match = params.match === 'all' ? 'all' : 'any';
	const cohortIds = params.cohorts ?? [];
	const cohortMatch = params.cohortMatch === 'all' ? 'all' : 'any';

	const where: string[] = [];
	const args: unknown[] = [];
	// free-text query — supports compound `a|b|c` (OR of rsID / VRS / locus / range)
	if (params.q && params.q.trim()) {
		const cond = await parseQueryConditionWithGenes(db, params.q);
		if (cond) {
			where.push(cond.sql);
			args.push(...cond.args);
		}
	}
	if (params.gene && params.gene.trim()) {
		const geneIntervals = await genesForSymbols(db, [params.gene]);
		if (geneIntervals.length) {
			where.push('(' + geneIntervals.map(() => '(v.chrom=? AND v.pos>=? AND v.pos<=?)').join(' OR ') + ')');
			args.push(...geneIntervals.flatMap((g) => [g.chrom, g.start, g.end]));
		} else {
			where.push('0');
		}
	}
	// structured params (direct API use)
	if (params.chrom) {
		where.push('v.chrom=?');
		args.push(params.chrom);
	}
	if (params.posMin != null) {
		where.push('v.pos>=?');
		args.push(params.posMin);
	}
	if (params.posMax != null) {
		where.push('v.pos<=?');
		args.push(params.posMax);
	}
	if (params.rsid != null) {
		where.push('v.rsid=?');
		args.push(params.rsid);
	}

	// af/count-range fragment reused inside each frequency EXISTS clause.
	// Always require the alt allele to be actually OBSERVED (ac>0): never surface
	// phantom monomorphic rows the harmonizer emitted for unobserved alt alleles
	// (those carry only hom_ref counts and aren't real variants).
	const baseRange: string[] = ['f.ac > 0'];
	const baseRangeArgs: unknown[] = [];
	const range: string[] = [...baseRange];
	const rangeArgs: unknown[] = [...baseRangeArgs];
	if (cohortIds.length && cohortMatch !== 'all') {
		range.push(`f.cohort_id IN (${cohortIds.map(() => '?').join(',')})`);
		rangeArgs.push(...cohortIds);
	}
	if (params.afMin != null) {
		baseRange.push('f.af>=?');
		baseRangeArgs.push(params.afMin);
		range.push('f.af>=?');
		rangeArgs.push(params.afMin);
	}
	if (params.afMax != null) {
		baseRange.push('f.af<=?');
		baseRangeArgs.push(params.afMax);
		range.push('f.af<=?');
		rangeArgs.push(params.afMax);
	}
	if (params.acMin != null) {
		baseRange.push('f.ac>=?');
		baseRangeArgs.push(params.acMin);
		range.push('f.ac>=?');
		rangeArgs.push(params.acMin);
	}
	if (params.acMax != null) {
		baseRange.push('f.ac<=?');
		baseRangeArgs.push(params.acMax);
		range.push('f.ac<=?');
		rangeArgs.push(params.acMax);
	}
	const rangeSql = range.length ? ' AND ' + range.join(' AND ') : '';
	const baseRangeSql = baseRange.length ? ' AND ' + baseRange.join(' AND ') : '';

	if (biobankIds.length === 0) {
		if (range.length) {
			where.push(`EXISTS (SELECT 1 FROM frequencies f WHERE f.variant_id=v.id${rangeSql})`);
			args.push(...rangeArgs);
		}
	} else if (match === 'all') {
		// variant must have a qualifying frequency in EVERY selected biobank
		for (const bid of biobankIds) {
			where.push(`EXISTS (SELECT 1 FROM frequencies f WHERE f.variant_id=v.id AND f.biobank_id=?${rangeSql})`);
			args.push(bid, ...rangeArgs);
		}
	} else {
		// ANY: qualifying frequency in at least one selected biobank
		const ph = biobankIds.map(() => '?').join(',');
		where.push(`EXISTS (SELECT 1 FROM frequencies f WHERE f.variant_id=v.id AND f.biobank_id IN (${ph})${rangeSql})`);
		args.push(...biobankIds, ...rangeArgs);
	}
	if (cohortIds.length && cohortMatch === 'all') {
		for (const cid of cohortIds) {
			where.push(`EXISTS (SELECT 1 FROM frequencies f WHERE f.variant_id=v.id AND f.cohort_id=?${baseRangeSql})`);
			args.push(cid, ...baseRangeArgs);
		}
	}

	const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';

	// sort
	const dir = params.dir === 'desc' ? 'DESC' : 'ASC';
	const orderArgs: unknown[] = [];
	let orderExpr: string;
	if (params.sort === 'rsid') orderExpr = `v.rsid ${dir}`;
	else if (params.sort === 'vrs') orderExpr = `v.vrs_digest ${dir}`;
	else if (params.sort === 'maxaf') {
		const bf = biobankIds.length ? `AND f3.biobank_id IN (${biobankIds.map(() => '?').join(',')})` : '';
		orderExpr = `(SELECT MAX(f3.af) FROM frequencies f3 WHERE f3.variant_id=v.id ${bf}) ${dir}`;
		if (biobankIds.length) orderArgs.push(...biobankIds);
	} else orderExpr = `v.chrom ${dir}, v.pos ${dir}`;
	const orderSql = `ORDER BY ${orderExpr}, v.chrom, v.pos`;

	const totalRow = await db
		.prepare(`SELECT COUNT(*) n FROM variants v ${whereSql}`)
		.bind(...args)
		.first<{ n: number }>();
	const total = totalRow?.n ?? 0;

	const vrows = await db
		.prepare(`SELECT * FROM variants v ${whereSql} ${orderSql} LIMIT ? OFFSET ?`)
		.bind(...args, ...orderArgs, limit, offset)
		.all<any>();

	const ids = vrows.results.map((r) => r.id);
	if (ids.length === 0) return { rows: [], total };

	const placeholders = ids.map(() => '?').join(',');
	const fbiobank = biobankIds.length ? `AND f.biobank_id IN (${biobankIds.map(() => '?').join(',')})` : '';
	const fcohort = cohortIds.length ? `AND f.cohort_id IN (${cohortIds.map(() => '?').join(',')})` : '';
	const freqSql = `
		SELECT f.variant_id, f.cohort_id, c.label cohort_label, c.biobank_id, b.slug biobank_slug,
		       p.name population, p.country_code, f.af, f.ac, f.an, f.n_homo, f.n_hetero, f.n_homo_ref
		FROM frequencies f
		JOIN cohorts c ON c.id=f.cohort_id
		JOIN populations p ON p.id=c.population_id
		JOIN biobanks b ON b.id=f.biobank_id
		WHERE f.variant_id IN (${placeholders}) ${fbiobank} ${fcohort}
		ORDER BY f.af DESC`;
	const frows = await db.prepare(freqSql).bind(...ids, ...biobankIds, ...cohortIds).all<any>();
	const growSql = `
		SELECT v.id variant_id, g.ensembl_id, g.symbol, g.gene_type, g.start, g.end, g.strand
		FROM variants v
		JOIN genes g ON g.chrom=v.chrom AND v.pos BETWEEN g.start AND g.end
		WHERE v.id IN (${placeholders})
		ORDER BY g.symbol`;
	const grows = await db.prepare(growSql).bind(...ids).all<any>();

	const byVariant = new Map<number, FreqCell[]>();
	for (const f of frows.results) {
		const cell: FreqCell = {
			cohortId: f.cohort_id,
			cohortLabel: f.cohort_label,
			population: f.population,
			countryCode: f.country_code,
			biobankId: f.biobank_id,
			biobankSlug: f.biobank_slug,
			af: f.af,
			ac: f.ac,
			an: f.an,
			nHomo: f.n_homo,
			nHetero: f.n_hetero,
			nHomoRef: f.n_homo_ref
		};
		const arr = byVariant.get(f.variant_id) ?? [];
		arr.push(cell);
		byVariant.set(f.variant_id, arr);
	}
	const genesByVariant = new Map<number, GeneHit[]>();
	for (const g of grows.results) {
		const arr = genesByVariant.get(g.variant_id) ?? [];
		arr.push({
			ensemblId: g.ensembl_id,
			symbol: g.symbol,
			geneType: g.gene_type,
			start: g.start,
			end: g.end,
			strand: g.strand
		});
		genesByVariant.set(g.variant_id, arr);
	}

	const rows: VariantRow[] = vrows.results.map((v) => ({
		id: v.id,
		chrom: v.chrom,
		chromName: CODE_CHROM[v.chrom] ?? String(v.chrom),
		pos: v.pos,
		ref: v.ref,
		alt: v.alt,
		rsid: v.rsid,
		vrsDigest: v.vrs_digest,
		posHg19: v.pos_hg19,
		lifted: v.lifted,
		genes: genesByVariant.get(v.id) ?? [],
		frequencies: byVariant.get(v.id) ?? []
	}));
	return { rows, total };
}

export async function getVariant(db: D1Database, id: number): Promise<VariantRow | null> {
	const v = await db.prepare('SELECT * FROM variants WHERE id=?').bind(id).first<any>();
	if (!v) return null;
	const frows = await db
		.prepare(
			`SELECT f.cohort_id, c.label cohort_label, c.biobank_id, b.slug biobank_slug,
			        p.name population, p.country_code, f.af, f.ac, f.an, f.n_homo, f.n_hetero, f.n_homo_ref
			 FROM frequencies f
			 JOIN cohorts c ON c.id=f.cohort_id
			 JOIN populations p ON p.id=c.population_id
			 JOIN biobanks b ON b.id=f.biobank_id
			 WHERE f.variant_id=? ORDER BY f.af DESC`
		)
		.bind(id)
		.all<any>();
	const [withGenes] = await attachGenesToRows(db, [{ id: v.id }]);
	return {
		id: v.id,
		chrom: v.chrom,
		chromName: CODE_CHROM[v.chrom] ?? String(v.chrom),
		pos: v.pos,
		ref: v.ref,
		alt: v.alt,
		rsid: v.rsid,
		vrsDigest: v.vrs_digest,
		posHg19: v.pos_hg19,
		lifted: v.lifted,
		genes: withGenes.genes,
		frequencies: frows.results.map((f) => ({
			cohortId: f.cohort_id,
			cohortLabel: f.cohort_label,
			population: f.population,
			countryCode: f.country_code,
			biobankId: f.biobank_id,
			biobankSlug: f.biobank_slug,
			af: f.af,
			ac: f.ac,
			an: f.an,
			nHomo: f.n_homo,
			nHetero: f.n_hetero,
			nHomoRef: f.n_homo_ref
		}))
	};
}

function scopedVariantExistsSql(scopeSlug: string | null): { sql: string; args: unknown[] } {
	if (!scopeSlug) return { sql: '', args: [] };
	return {
		sql: `AND EXISTS (
			SELECT 1
			FROM frequencies f
			JOIN biobanks b ON b.id=f.biobank_id
			WHERE f.variant_id=v.id AND b.slug=?
		)`,
		args: [scopeSlug]
	};
}

async function getVariantBySql(db: D1Database, whereSql: string, args: unknown[], scopeSlug: string | null) {
	const scoped = scopedVariantExistsSql(scopeSlug);
	const row = await db
		.prepare(`SELECT v.id FROM variants v WHERE ${whereSql} ${scoped.sql} ORDER BY v.chrom, v.pos, v.id LIMIT 1`)
		.bind(...args, ...scoped.args)
		.first<{ id: number }>();
	return row ? getVariant(db, row.id) : null;
}

export function canonicalVariantId(v: VariantRow): string {
	return publicVariantId(v);
}

export async function resolveVariantIdentifier(db: D1Database, raw: string, scopeSlug: string | null): Promise<VariantRow | null> {
	const token = decodeURIComponent(raw).trim();
	if (!token) return null;

	if (/^\d+$/.test(token)) return getVariant(db, Number(token));

	let m = /^rs(\d+)$/i.exec(token);
	if (m) return getVariantBySql(db, 'v.rsid=?', [Number(m[1])], scopeSlug);

	m = /^(?:ga4gh:VA\.)?([A-Za-z0-9_-]{32})$/.exec(token);
	if (m) return getVariantBySql(db, 'v.vrs_digest=?', [m[1]], scopeSlug);

	m = /^(?:chr)?([0-9]+|x|y|mt|m)[-:](\d+)-([A-Za-z]+)-([A-Za-z]+)$/i.exec(token.replace(/,/g, ''));
	if (m) {
		const chrom = chromToCode(m[1]);
		if (!chrom) return null;
		return getVariantBySql(db, 'v.chrom=? AND v.pos=? AND v.ref=? AND v.alt=?', [chrom, Number(m[2]), m[3].toUpperCase(), m[4].toUpperCase()], scopeSlug);
	}

	return null;
}

export interface BiobankOverview {
	id: number;
	slug: string;
	name: string;
	description: string;
	website: string;
	populations: Array<{
		id: number;
		name: string;
		country: string;
		countryCode: string;
		lat: number;
		lon: number;
		sampleCount: number;
		cohortId: number;
		variantCount: number;
	}>;
	totalSamples: number;
	totalVariants: number;
}

export async function biobanksOverview(db: D1Database, scopeSlug: string | null): Promise<BiobankOverview[]> {
	const scopeId = await biobankIdForSlug(db, scopeSlug);
	const bWhere = scopeId ? 'WHERE id=?' : '';
	const banks = await db.prepare(`SELECT * FROM biobanks ${bWhere} ORDER BY id`).bind(...(scopeId ? [scopeId] : [])).all<any>();

	const out: BiobankOverview[] = [];
	for (const b of banks.results) {
		const pops = await db
			.prepare(
				`SELECT p.id, p.name, p.country, p.country_code, p.lat, p.lon,
				        c.id cohort_id, c.sample_count,
				        (SELECT COUNT(*) FROM frequencies f WHERE f.cohort_id=c.id) variant_count
				 FROM populations p
				 JOIN cohorts c ON c.population_id=p.id
				 WHERE p.biobank_id=? ORDER BY p.name`
			)
			.bind(b.id)
			.all<any>();
		const populations = pops.results.map((p) => ({
			id: p.id,
			name: p.name,
			country: p.country,
			countryCode: p.country_code,
			lat: p.lat,
			lon: p.lon,
			sampleCount: p.sample_count,
			cohortId: p.cohort_id,
			variantCount: p.variant_count
		}));
		const totalSamples = populations.reduce((s, p) => s + p.sampleCount, 0);
		const tv = await db
			.prepare('SELECT COUNT(DISTINCT variant_id) n FROM frequencies WHERE biobank_id=?')
			.bind(b.id)
			.first<{ n: number }>();
		out.push({
			id: b.id,
			slug: b.slug,
			name: b.name,
			description: b.description,
			website: b.website,
			populations,
			totalSamples,
			totalVariants: tv?.n ?? 0
		});
	}
	return out;
}

// Tenant-scoped headline numbers + variant frequency-class breakdown (by each
// variant's max AF within the biobank). Drives the "Database totals" panel.
export interface TenantStats {
	variants: number;
	common: number; // AF >= 0.05
	lowFreq: number; // 0.01 <= AF < 0.05
	rare: number; // AF < 0.01
}

export async function tenantStats(db: D1Database, scopeSlug: string | null): Promise<TenantStats> {
	const id = await biobankIdForSlug(db, scopeSlug);
	const where = id ? 'WHERE biobank_id=?' : '';
	const args = id ? [id] : [];
	const r = await db
		.prepare(
			`SELECT
				COUNT(*) variants,
				SUM(CASE WHEN m>=0.05 THEN 1 ELSE 0 END) common,
				SUM(CASE WHEN m>=0.01 AND m<0.05 THEN 1 ELSE 0 END) lowFreq,
				SUM(CASE WHEN m<0.01 THEN 1 ELSE 0 END) rare
			 FROM (SELECT variant_id, MAX(af) m FROM frequencies ${where} GROUP BY variant_id)`
		)
		.bind(...args)
		.first<any>();
	return { variants: r?.variants ?? 0, common: r?.common ?? 0, lowFreq: r?.lowFreq ?? 0, rare: r?.rare ?? 0 };
}

// Precomputed stats cache (seeder writes `home:<scope>` / `explore:<scope>`).
// Resilient: if the table is missing or unseeded, return null so callers fall
// back to live computation instead of 500-ing.
export async function getStats(db: D1Database, key: string): Promise<any | null> {
	try {
		const r = await db.prepare('SELECT value FROM stats WHERE key=?').bind(key).first<{ value: string }>();
		if (!r) return null;
		return JSON.parse(r.value);
	} catch {
		return null;
	}
}

// Datasets (tenant-owned, JSON metadata). Counts are baked into the metadata at
// seed time. Variants belong to a dataset via its cohorts.
export interface DatasetRow {
	id: number;
	slug: string;
	biobankId: number;
	metadata: Record<string, any>;
}

function safeParse(s: string): Record<string, any> {
	try {
		return JSON.parse(s || '{}');
	} catch {
		return {};
	}
}

export async function getDatasets(db: D1Database, scopeSlug: string | null): Promise<DatasetRow[]> {
	const scopeId = await biobankIdForSlug(db, scopeSlug);
	const where = scopeId ? 'WHERE biobank_id=?' : '';
	const rows = await db
		.prepare(`SELECT id, slug, biobank_id, metadata FROM datasets ${where} ORDER BY id`)
		.bind(...(scopeId ? [scopeId] : []))
		.all<any>();
	return rows.results.map((d) => ({ id: d.id, slug: d.slug, biobankId: d.biobank_id, metadata: safeParse(d.metadata) }));
}

// The browser shows het/hom_alt/hom_ref unless every dataset in scope opts out.
export async function showGenotypeCounts(db: D1Database, scopeSlug: string | null): Promise<boolean> {
	const ds = await getDatasets(db, scopeSlug);
	if (!ds.length) return true;
	return ds.some((d) => d.metadata.showGenotypeCounts !== false);
}

// Build a full VRS Allele object from a stored variant row.
export function buildVrsAllele(v: { chrom: number; pos: number; alt: string; vrsDigest: string | null }) {
	const sq = REFGET_SQ[v.chrom];
	if (!sq || !v.vrsDigest) return null;
	const start = v.pos - 1;
	const end = v.pos;
	return {
		id: `ga4gh:VA.${v.vrsDigest}`,
		type: 'Allele',
		digest: v.vrsDigest,
		location: {
			type: 'SequenceLocation',
			sequenceReference: { type: 'SequenceReference', refgetAccession: sq },
			start,
			end
		},
		state: { type: 'LiteralSequenceExpression', sequence: v.alt }
	};
}
