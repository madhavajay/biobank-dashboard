// Engine query layer — runs directly on the D1 binding for predictable analytics.
import { CODE_CHROM, REFGET_SQ } from './chroms';

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
	frequencies: FreqCell[];
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
	afMin?: number;
	afMax?: number;
	acMin?: number;
	acMax?: number;
	vrs?: string;
	cohorts?: number[]; // restrict to these cohort/population ids (display + existence)
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

	const where: string[] = [];
	const args: unknown[] = [];
	// free-text query — supports compound `a|b|c` (OR of rsID / VRS / locus / range)
	if (params.q && params.q.trim()) {
		const cond = parseQueryCondition(params.q);
		if (cond) {
			where.push(cond.sql);
			args.push(...cond.args);
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
	// When scoped to a biobank set, require the alt allele to be actually OBSERVED
	// (ac>0) — don't surface variants the tenant genotyped but never saw.
	const range: string[] = biobankIds.length > 0 ? ['f.ac > 0'] : [];
	const rangeArgs: unknown[] = [];
	const cohortIds = params.cohorts ?? [];
	if (cohortIds.length) {
		range.push(`f.cohort_id IN (${cohortIds.map(() => '?').join(',')})`);
		rangeArgs.push(...cohortIds);
	}
	if (params.afMin != null) {
		range.push('f.af>=?');
		rangeArgs.push(params.afMin);
	}
	if (params.afMax != null) {
		range.push('f.af<=?');
		rangeArgs.push(params.afMax);
	}
	if (params.acMin != null) {
		range.push('f.ac>=?');
		rangeArgs.push(params.acMin);
	}
	if (params.acMax != null) {
		range.push('f.ac<=?');
		rangeArgs.push(params.acMax);
	}
	const rangeSql = range.length ? ' AND ' + range.join(' AND ') : '';

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
			        p.name population, p.country_code, f.af, f.ac, f.an, f.n_homo, f.n_hetero
			 FROM frequencies f
			 JOIN cohorts c ON c.id=f.cohort_id
			 JOIN populations p ON p.id=c.population_id
			 JOIN biobanks b ON b.id=f.biobank_id
			 WHERE f.variant_id=? ORDER BY f.af DESC`
		)
		.bind(id)
		.all<any>();
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
