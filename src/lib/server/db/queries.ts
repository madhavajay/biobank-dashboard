// Engine query layer — runs on the request PostgreSQL connection for predictable analytics.
import type { PostgresDatabase } from './postgres';
import { CODE_CHROM, REFGET_SQ } from './chroms';
import { publicVariantId } from '$lib/variant-id';
import { ALLELE_COUNT_REPORTING_THRESHOLD, alleleFrequencyUpperBound, isAlleleCountMasked, isGenotypeMasked } from '$lib/privacy';
import {
	GENE_SEARCH_MIN_LEN,
	looksLikeGeneSymbol,
	looksLikeLocusToken,
	looksLikeRsidToken,
	normalizeVariantSearchInput,
	parseVariantSearchTerm,
	rowMatchesGeneToken,
	rowMatchesSearchQuery,
	rowMatchesSearchToken
} from '$lib/search/variant-search';

type QueryDb = PostgresDatabase;

export interface FreqCell {
	cohortId: number;
	cohortLabel: string;
	population: string;
	countryCode: string;
	biobankId: number;
	biobankSlug: string;
	af: number | null;
	ac: number | null;
	an: number;
	acMasked: boolean;
	acUpperBound: number | null;
	afUpperBound: number | null;
	genotypeMasked: boolean;
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
	vepLabel: string | null;
	vepImpact: string | null;
	hgvsConsequence: string | null;
	vepHasMultipleConsequences: boolean;
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

async function biobankIdForSlug(db: QueryDb, slug: string | null): Promise<number | null> {
	if (!slug) return null;
	const r = await db.prepare('SELECT id FROM biobanks WHERE slug=?').bind(slug).first<{ id: number }>();
	return r?.id ?? null;
}

async function biobankIdsForSlugs(db: QueryDb, slugs: string[]): Promise<number[]> {
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
	vepImpacts?: string[];
	vepConsequences?: string[];
	vrs?: string;
	country?: string;
	cohorts?: number[]; // restrict to these cohort/population ids (display + existence)
	cohortMatch?: 'any' | 'all';
	limit?: number;
	offset?: number;
	// biobank filter: which biobanks to require, and whether a variant must appear
	// in ANY ('any') or ALL ('all') of them.
	biobanks?: string[];
	match?: 'any' | 'all';
	sort?: 'variant' | 'rsid' | 'gene' | 'maxaf' | 'vrs';
	dir?: 'asc' | 'desc';
	skipTotal?: boolean;
	totalOverride?: number;
}

const VALID_VEP_IMPACTS = new Set(['HIGH', 'MODERATE', 'LOW', 'MODIFIER']);

function normGeneSymbol(raw: string): string {
	return raw.trim().toUpperCase();
}

async function genesForSymbols(db: QueryDb, symbols: string[]): Promise<{ chrom: number; start: number; end: number }[]> {
	const norms = [...new Set(symbols.map(normGeneSymbol).filter(Boolean))];
	if (!norms.length) return [];
	const ph = norms.map(() => '?').join(',');
	try {
		const r = await db
			.prepare(`SELECT chrom, start, "end" AS end FROM genes WHERE symbol_norm IN (${ph})`)
			.bind(...norms)
			.all<{ chrom: number; start: number; end: number }>();
		return r.results;
	} catch {
		return [];
	}
}

async function genesForSymbolPrefix(
	db: QueryDb,
	prefix: string,
	limit = 48
): Promise<{ chrom: number; start: number; end: number }[]> {
	const norm = normGeneSymbol(prefix);
	if (norm.length < GENE_SEARCH_MIN_LEN) return [];
	try {
		const r = await db
			.prepare(`SELECT chrom, start, "end" AS end FROM genes WHERE symbol_norm LIKE ? ORDER BY symbol_norm LIMIT ?`)
			.bind(`${norm}%`, limit)
			.all<{ chrom: number; start: number; end: number }>();
		return r.results;
	} catch {
		return [];
	}
}

function geneIntervalsToCondition(geneIntervals: { chrom: number; start: number; end: number }[]): {
	sql: string;
	args: unknown[];
} | null {
	if (!geneIntervals.length) return null;
	if (geneIntervals.length === 1) {
		const g = geneIntervals[0];
		return { sql: '(v.chrom=? AND v.pos>=? AND v.pos<=?)', args: [g.chrom, g.start, g.end] };
	}
	return {
		sql: '(' + geneIntervals.map(() => '(v.chrom=? AND v.pos>=? AND v.pos<=?)').join(' OR ') + ')',
		args: geneIntervals.flatMap((g) => [g.chrom, g.start, g.end])
	};
}

function geneSymbolContainsCondition(symbolNorm: string): { sql: string; args: unknown[] } | null {
	if (symbolNorm.length < GENE_SEARCH_MIN_LEN) return null;
	return {
		sql: `EXISTS (
			SELECT 1 FROM genes g
			WHERE g.chrom=v.chrom AND v.pos BETWEEN g.start AND g."end"
			AND g.symbol_norm LIKE ?
		)`,
		args: [`%${symbolNorm}%`]
	};
}

async function geneConditionForQuery(
	db: QueryDb,
	raw: string
): Promise<{ sql: string; args: unknown[] } | null> {
	if (looksLikeRsidToken(raw) || !looksLikeGeneSymbol(raw) || looksLikeLocusToken(raw)) return null;

	const geneIntervals = await genesForSymbols(db, [raw]);
	const exact = geneIntervalsToCondition(geneIntervals);
	if (exact) return exact;

	const prefix = normGeneSymbol(raw);
	const prefixIntervals = await genesForSymbolPrefix(db, prefix);
	const prefixCond = geneIntervalsToCondition(prefixIntervals);
	if (prefixCond) return prefixCond;

	return geneSymbolContainsCondition(prefix);
}

async function conditionForQueryToken(db: QueryDb, raw: string): Promise<{ sql: string; args: unknown[] } | null> {
	const parsed = parseVariantSearchTerm(raw);
	if (parsed) return parsed;

	const s = normalizeVariantSearchInput(raw).replace(/,/g, '');
	if (!s || looksLikeLocusToken(s) || looksLikeRsidToken(s)) return null;

	const geneCond = await geneConditionForQuery(db, raw);
	if (geneCond) return geneCond;

	if (s.length >= 2) {
		return { sql: 'LOWER(v.hgvs_consequence) LIKE ?', args: [`%${s.toLowerCase()}%`] };
	}

	return null;
}

export async function attachGenesToRows<T extends { id: number }>(db: QueryDb, rows: T[]): Promise<(T & { genes: GeneHit[] })[]> {
	const ids = rows.map((r) => r.id);
	if (!ids.length) return rows.map((r) => ({ ...r, genes: [] }));
	const placeholders = ids.map(() => '?').join(',');
	try {
		const grows = await db
			.prepare(`
			SELECT v.id variant_id, g.ensembl_id, g.symbol, g.gene_type, g.start, g."end" AS end, g.strand
			FROM variants v
			JOIN genes g ON g.chrom=v.chrom AND v.pos BETWEEN g.start AND g."end"
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

async function parseQueryConditionWithGenes(db: QueryDb, q: string): Promise<{ sql: string; args: unknown[] } | null> {
	const groups = normalizeVariantSearchInput(q)
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
		if (!orConds.length) return { sql: 'FALSE', args: [] };
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

function publicCellFromCached(f: any): FreqCell {
	if ('acMasked' in f || 'afUpperBound' in f || f.publicAc !== undefined || f.public_ac !== undefined) {
		const acMasked = Boolean(f.acMasked ?? f.ac_masked);
		const genotypeMasked = Boolean(f.genotypeMasked ?? f.genotype_masked);
		return {
			...f,
			af: acMasked ? null : (f.publicAf ?? f.public_af ?? f.af ?? null),
			ac: acMasked ? null : (f.publicAc ?? f.public_ac ?? f.ac ?? null),
			an: f.an,
			acMasked,
			acUpperBound: f.acUpperBound ?? f.ac_upper_bound ?? (acMasked ? ALLELE_COUNT_REPORTING_THRESHOLD : null),
			afUpperBound: f.afUpperBound ?? f.af_upper_bound ?? (acMasked ? alleleFrequencyUpperBound(f.an) : null),
			genotypeMasked,
			nHomo: genotypeMasked ? null : (f.publicNHomo ?? f.public_n_homo ?? f.nHomo ?? null),
			nHetero: genotypeMasked ? null : (f.publicNHetero ?? f.public_n_hetero ?? f.nHetero ?? null),
			nHomoRef: genotypeMasked ? null : (f.publicNHomoRef ?? f.public_n_homo_ref ?? f.nHomoRef ?? null)
		};
	}

	const acMasked = isAlleleCountMasked(f.ac);
	const genotypeMasked = isGenotypeMasked(f.nHetero ?? f.n_hetero, f.nHomo ?? f.n_homo, f.nHomoRef ?? f.n_homo_ref);
	return {
		...f,
		af: acMasked ? null : f.af,
		ac: acMasked ? null : f.ac,
		an: f.an,
		acMasked,
		acUpperBound: acMasked ? ALLELE_COUNT_REPORTING_THRESHOLD : null,
		afUpperBound: acMasked ? alleleFrequencyUpperBound(f.an) : null,
		genotypeMasked,
		nHomo: genotypeMasked ? null : (f.nHomo ?? f.n_homo ?? null),
		nHetero: genotypeMasked ? null : (f.nHetero ?? f.n_hetero ?? null),
		nHomoRef: genotypeMasked ? null : (f.nHomoRef ?? f.n_homo_ref ?? null)
	};
}

function freqCellFromDb(f: any): FreqCell {
	return {
		cohortId: f.cohort_id,
		cohortLabel: f.cohort_label,
		population: f.population,
		countryCode: f.country_code,
		biobankId: f.biobank_id,
		biobankSlug: f.biobank_slug,
		af: f.public_af,
		ac: f.public_ac,
		an: f.an,
		acMasked: Boolean(f.ac_masked),
		acUpperBound: f.ac_upper_bound,
		afUpperBound: f.af_upper_bound,
		genotypeMasked: Boolean(f.genotype_masked),
		nHomo: f.public_n_homo,
		nHetero: f.public_n_hetero,
		nHomoRef: f.public_n_homo_ref
	};
}

export function sanitizeVariantRowsForPublic<T extends { frequencies?: any[] }>(rows: T[]): T[] {
	return rows.map((row) => ({ ...row, frequencies: (row.frequencies ?? []).map(publicCellFromCached) }));
}

async function cohortIdsForCountryCode(db: QueryDb, countryCode: string): Promise<number[]> {
	const code = countryCode.trim().toUpperCase();
	if (!code) return [];

	const direct = await db
		.prepare(
			`SELECT DISTINCT c.id
			 FROM cohorts c
			 JOIN populations p ON p.id = c.population_id
			 WHERE p.country_code = ?`
		)
		.bind(code)
		.all<{ id: number }>();

	if (direct.results.length) {
		return direct.results.map((row) => row.id);
	}

	const mapped = await db
		.prepare(
			`SELECT DISTINCT c.id
			 FROM cohorts c
			 JOIN populations p ON p.id = c.population_id
			 JOIN population_country_mappings m ON m.population_id = p.id
			 WHERE m.country_code = ?`
		)
		.bind(code)
		.all<{ id: number }>();

	return mapped.results.map((row) => row.id);
}

async function resolveSearchCohortIds(db: QueryDb, params: SearchParams): Promise<number[]> {
	let cohortIds = params.cohorts ?? [];
	const country = params.country?.trim().toUpperCase();
	if (!country) return cohortIds;

	const countryCohorts = await cohortIdsForCountryCode(db, country);
	if (!countryCohorts.length) return [];

	if (cohortIds.length) {
		return cohortIds.filter((id) => countryCohorts.includes(id));
	}
	return countryCohorts;
}

type PreparedVariantSearch =
	| { empty: true }
	| {
			whereSql: string;
			args: unknown[];
			candidate: { cte: string; args: unknown[] } | null;
			biobankIds: number[];
			cohortIds: number[];
	  };

async function prepareVariantSearchFilters(
	db: QueryDb,
	scopeSlug: string | null,
	params: SearchParams
): Promise<PreparedVariantSearch> {
	const requested = scopeSlug ? [scopeSlug] : params.biobanks ?? [];
	const biobankIds = requested.length ? await biobankIdsForSlugs(db, requested) : [];
	if (scopeSlug && !biobankIds.length) return { empty: true };
	const match = params.match === 'all' ? 'all' : 'any';
	const cohortIds = await resolveSearchCohortIds(db, params);
	if (params.country?.trim() && !cohortIds.length) return { empty: true };
	const cohortMatch = params.cohortMatch === 'all' ? 'all' : 'any';
	const where: string[] = [];
	const args: unknown[] = [];
	if (params.q && params.q.trim()) {
		const cond = await parseQueryConditionWithGenes(db, params.q);
		if (cond) {
			where.push(cond.sql);
			args.push(...cond.args);
		}
	}
	if (params.gene && params.gene.trim()) {
		const cond = await geneConditionForQuery(db, params.gene);
		if (cond) {
			where.push(cond.sql);
			args.push(...cond.args);
		} else {
			where.push('FALSE');
		}
	}
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
	const vepImpacts = [...new Set((params.vepImpacts ?? []).map((v) => v.trim().toUpperCase()).filter((v) => VALID_VEP_IMPACTS.has(v)))];
	if (vepImpacts.length) {
		where.push(`v.vep_impact IN (${vepImpacts.map(() => '?').join(',')})`);
		args.push(...vepImpacts);
	}
	const vepConsequences = [...new Set((params.vepConsequences ?? []).map((v) => v.trim()).filter(Boolean))];
	if (vepConsequences.length) {
		where.push(`v.vep_label IN (${vepConsequences.map(() => '?').join(',')})`);
		args.push(...vepConsequences);
	}
	const hasVariantSelector = Boolean(
		params.q?.trim() ||
			params.gene?.trim() ||
			params.chrom ||
			params.posMin != null ||
			params.posMax != null ||
			params.rsid != null ||
			vepImpacts.length ||
			vepConsequences.length
	);

	const baseRange: string[] = ['f.ac > 0'];
	const baseRangeArgs: unknown[] = [];
	const range: string[] = [...baseRange];
	const rangeArgs: unknown[] = [...baseRangeArgs];
	const hasFrequencyRange = params.afMin != null || params.afMax != null || params.acMin != null || params.acMax != null;
	if (hasFrequencyRange) {
		baseRange.push('f.public_ac IS NOT NULL');
		range.push('f.public_ac IS NOT NULL');
	}
	if (cohortIds.length && cohortMatch !== 'all') {
		range.push(`f.cohort_id IN (${cohortIds.map(() => '?').join(',')})`);
		rangeArgs.push(...cohortIds);
	}
	if (params.afMin != null) {
		baseRange.push('f.public_af>=?');
		baseRangeArgs.push(params.afMin);
		range.push('f.public_af>=?');
		rangeArgs.push(params.afMin);
	}
	if (params.afMax != null) {
		baseRange.push('f.public_af<=?');
		baseRangeArgs.push(params.afMax);
		range.push('f.public_af<=?');
		rangeArgs.push(params.afMax);
	}
	if (params.acMin != null) {
		baseRange.push('f.public_ac>=?');
		baseRangeArgs.push(params.acMin);
		range.push('f.public_ac>=?');
		rangeArgs.push(params.acMin);
	}
	if (params.acMax != null) {
		baseRange.push('f.public_ac<=?');
		baseRangeArgs.push(params.acMax);
		range.push('f.public_ac<=?');
		rangeArgs.push(params.acMax);
	}
	const rangeSql = range.length ? ' AND ' + range.join(' AND ') : '';
	const baseRangeSql = baseRange.length ? ' AND ' + baseRange.join(' AND ') : '';
	const hasFrequencySelector = biobankIds.length > 0 || cohortIds.length > 0 || hasFrequencyRange;

	function frequencyCandidateSql(): { cte: string; args: unknown[] } | null {
		if (!hasFrequencySelector || hasVariantSelector) return null;
		const sets: { sql: string; args: unknown[] }[] = [];
		const addSet = (conditions: string[], setArgs: unknown[]) => {
			sets.push({
				sql: `SELECT DISTINCT f.variant_id FROM frequencies f WHERE ${conditions.join(' AND ')}`,
				args: setArgs
			});
		};
		const needsBaseSet = biobankIds.length === 0 || match !== 'all';
		if (needsBaseSet) {
			const baseWhere = [...range];
			const baseArgs = [...rangeArgs];
			if (biobankIds.length) {
				baseWhere.push(`f.biobank_id IN (${biobankIds.map(() => '?').join(',')})`);
				baseArgs.push(...biobankIds);
			}
			addSet(baseWhere, baseArgs);
		}
		if (biobankIds.length && match === 'all') {
			for (const biobankId of biobankIds) {
				addSet([`f.biobank_id=?`, ...range], [biobankId, ...rangeArgs]);
			}
		}
		if (cohortIds.length && cohortMatch === 'all') {
			for (const cohortId of cohortIds) {
				addSet([`f.cohort_id=?`, ...baseRange], [cohortId, ...baseRangeArgs]);
			}
		}
		if (!sets.length) return null;
		return {
			cte: `candidate AS (${sets.map((set) => set.sql).join(' INTERSECT ')})`,
			args: sets.flatMap((set) => set.args)
		};
	}

	const candidate = frequencyCandidateSql();
	if (!candidate && biobankIds.length === 0) {
		if (range.length) {
			where.push(`EXISTS (SELECT 1 FROM frequencies f WHERE f.variant_id=v.id${rangeSql})`);
			args.push(...rangeArgs);
		}
	} else if (!candidate && match === 'all') {
		for (const bid of biobankIds) {
			where.push(`EXISTS (SELECT 1 FROM frequencies f WHERE f.variant_id=v.id AND f.biobank_id=?${rangeSql})`);
			args.push(bid, ...rangeArgs);
		}
	} else if (!candidate) {
		const ph = biobankIds.map(() => '?').join(',');
		where.push(`EXISTS (SELECT 1 FROM frequencies f WHERE f.variant_id=v.id AND f.biobank_id IN (${ph})${rangeSql})`);
		args.push(...biobankIds, ...rangeArgs);
	}
	if (!candidate && cohortIds.length && cohortMatch === 'all') {
		for (const cid of cohortIds) {
			where.push(`EXISTS (SELECT 1 FROM frequencies f WHERE f.variant_id=v.id AND f.cohort_id=?${baseRangeSql})`);
			args.push(cid, ...baseRangeArgs);
		}
	}

	return {
		whereSql: where.length ? 'WHERE ' + where.join(' AND ') : '',
		args,
		candidate,
		biobankIds,
		cohortIds
	};
}

function frequencyScopeSql(biobankIds: number[], cohortIds: number[]) {
	const parts: string[] = [];
	const args: unknown[] = [];
	if (biobankIds.length) {
		parts.push(`f.biobank_id IN (${biobankIds.map(() => '?').join(',')})`);
		args.push(...biobankIds);
	}
	if (cohortIds.length) {
		parts.push(`f.cohort_id IN (${cohortIds.map(() => '?').join(',')})`);
		args.push(...cohortIds);
	}
	return {
		sql: parts.length ? ` AND ${parts.join(' AND ')}` : '',
		args
	};
}

function variantStatsFromRows(rows: VariantRow[], biobankSlugs: string[], cohortIds: number[]): TenantStats {
	let common = 0;
	let lowFreq = 0;
	let rare = 0;
	for (const row of rows) {
		const freqs = row.frequencies.filter((f) => {
			if (biobankSlugs.length && !biobankSlugs.includes(f.biobankSlug)) return false;
			if (cohortIds.length && !cohortIds.includes(f.cohortId)) return false;
			return (f.ac ?? 0) > 0;
		});
		if (!freqs.length) continue;
		const maxAf = Math.max(...freqs.map((f) => f.af ?? 0));
		if (maxAf >= 0.05) common++;
		else if (maxAf >= 0.01) lowFreq++;
		else rare++;
	}
	return { variants: common + lowFreq + rare, common, lowFreq, rare };
}

async function searchVariantStatsFromCache(
	db: QueryDb,
	scopeSlug: string | null,
	params: SearchParams,
	prepared: Exclude<PreparedVariantSearch, { empty: true }>
): Promise<TenantStats | null> {
	if (params.biobanks?.includes('__none__')) return { variants: 0, common: 0, lowFreq: 0, rare: 0 };
	const cached = await getStats(db, `explore:${scopeSlug ?? 'global'}`);
	if (!cached?.rows?.length) return null;

	const cohortIds = await resolveSearchCohortIds(db, params);
	if (params.country?.trim() && !cohortIds.length) return { variants: 0, common: 0, lowFreq: 0, rare: 0 };
	const freqParams = cohortIds.length ? { ...params, cohorts: cohortIds } : params;
	const biobankSlugs = scopeSlug
		? [scopeSlug]
		: (params.biobanks ?? []).filter((slug) => slug && slug !== '__none__');
	const vepImpacts = [...new Set((params.vepImpacts ?? []).map((v) => v.trim().toUpperCase()).filter((v) => VALID_VEP_IMPACTS.has(v)))];
	const vepConsequences = [...new Set((params.vepConsequences ?? []).map((v) => v.trim()).filter(Boolean))];

	let rows = sanitizeVariantRowsForPublic(cached.rows) as VariantRow[];
	rows = applyScopeToRows(rows, scopeSlug);
	rows = rows.filter((row) => {
		if (params.q?.trim() && !cachedRowMatchesQuery(row, params.q)) return false;
		if (params.gene?.trim() && !cachedRowMatchesGene(row, params.gene)) return false;
		if (params.chrom != null && row.chrom !== params.chrom) return false;
		if (params.posMin != null && row.pos < params.posMin) return false;
		if (params.posMax != null && row.pos > params.posMax) return false;
		if (params.rsid != null && row.rsid !== params.rsid) return false;
		if (vepImpacts.length && (!row.vepImpact || !vepImpacts.includes(row.vepImpact.toUpperCase()))) return false;
		if (vepConsequences.length && (!row.vepLabel || !vepConsequences.includes(row.vepLabel))) return false;
		return rowQualifiesFrequencies(row, freqParams, biobankSlugs);
	});
	return variantStatsFromRows(rows, biobankSlugs, prepared.cohortIds);
}

export async function searchVariantStats(
	db: QueryDb,
	scopeSlug: string | null,
	params: SearchParams
): Promise<TenantStats> {
	const prepared = await prepareVariantSearchFilters(db, scopeSlug, params);
	if ('empty' in prepared) return { variants: 0, common: 0, lowFreq: 0, rare: 0 };

	if (await variantsTableEmpty(db)) {
		const cached = await searchVariantStatsFromCache(db, scopeSlug, params, prepared);
		if (cached) return cached;
	}

	const { whereSql, args, candidate, biobankIds, cohortIds } = prepared;
	const freqScope = frequencyScopeSql(biobankIds, cohortIds);
	const statsSql = candidate
		? `WITH ${candidate.cte}, variant_hits AS (
				SELECT v.id
				FROM candidate c
				JOIN variants v ON v.id=c.variant_id
				${whereSql}
			), variant_af AS (
				SELECT vh.id,
					(SELECT MAX(f.public_af) FROM frequencies f
					 WHERE f.variant_id=vh.id AND f.ac > 0${freqScope.sql}) AS max_af
				FROM variant_hits vh
			)
			SELECT
				COUNT(*) AS variants,
				SUM(CASE WHEN max_af >= 0.05 THEN 1 ELSE 0 END) AS common,
				SUM(CASE WHEN max_af >= 0.01 AND max_af < 0.05 THEN 1 ELSE 0 END) AS lowFreq,
				SUM(CASE WHEN max_af < 0.01 THEN 1 ELSE 0 END) AS rare
			FROM variant_af
			WHERE max_af IS NOT NULL`
		: `WITH variant_hits AS (
				SELECT v.id
				FROM variants v
				${whereSql}
			), variant_af AS (
				SELECT vh.id,
					(SELECT MAX(f.public_af) FROM frequencies f
					 WHERE f.variant_id=vh.id AND f.ac > 0${freqScope.sql}) AS max_af
				FROM variant_hits vh
			)
			SELECT
				COUNT(*) AS variants,
				SUM(CASE WHEN max_af >= 0.05 THEN 1 ELSE 0 END) AS common,
				SUM(CASE WHEN max_af >= 0.01 AND max_af < 0.05 THEN 1 ELSE 0 END) AS lowFreq,
				SUM(CASE WHEN max_af < 0.01 THEN 1 ELSE 0 END) AS rare
			FROM variant_af
			WHERE max_af IS NOT NULL`;

	const row = candidate
		? await db
				.prepare(statsSql)
				.bind(...candidate.args, ...args, ...freqScope.args)
				.first<any>()
		: await db
				.prepare(statsSql)
				.bind(...args, ...freqScope.args)
				.first<any>();

	return {
		variants: row?.variants ?? 0,
		common: row?.common ?? 0,
		lowFreq: row?.lowFreq ?? 0,
		rare: row?.rare ?? 0
	};
}

export async function searchVariants(
	db: QueryDb,
	scopeSlug: string | null,
	params: SearchParams
): Promise<{ rows: VariantRow[]; total: number }> {
	const limit = Math.min(Math.max(params.limit ?? 50, 1), 500);
	const offset = Math.max(params.offset ?? 0, 0);

	const prepared = await prepareVariantSearchFilters(db, scopeSlug, params);
	if ('empty' in prepared) return { rows: [], total: 0 };
	const { whereSql, args, candidate, biobankIds, cohortIds } = prepared;

	// sort
	const dir = params.dir === 'desc' ? 'DESC' : 'ASC';
	const orderArgs: unknown[] = [];
	let orderExpr: string;
	if (params.sort === 'rsid') orderExpr = `v.rsid ${dir}`;
	else if (params.sort === 'vrs') orderExpr = `v.vrs_digest ${dir}`;
	else if (params.sort === 'gene') {
		const geneExpr = `(SELECT MIN(g.symbol_norm) FROM genes g WHERE g.chrom=v.chrom AND v.pos BETWEEN g.start AND g."end")`;
		orderExpr = `CASE WHEN ${geneExpr} IS NULL THEN 1 ELSE 0 END ASC, ${geneExpr} ${dir}`;
	}
	else if (params.sort === 'maxaf') {
		const bf = biobankIds.length ? `AND f3.biobank_id IN (${biobankIds.map(() => '?').join(',')})` : '';
		orderExpr = `(SELECT MAX(f3.public_af) FROM frequencies f3 WHERE f3.variant_id=v.id ${bf}) ${dir}`;
		if (biobankIds.length) orderArgs.push(...biobankIds);
	} else orderExpr = `v.chrom ${dir}, v.pos ${dir}`;
	const orderSql = `ORDER BY ${orderExpr}, v.chrom, v.pos`;

	let total = params.totalOverride ?? 0;
	if (!params.skipTotal && params.totalOverride == null) {
		const totalRow = candidate
			? await db
					.prepare(`WITH ${candidate.cte} SELECT COUNT(*) n FROM candidate c JOIN variants v ON v.id=c.variant_id ${whereSql}`)
					.bind(...candidate.args, ...args)
					.first<{ n: number }>()
			: await db
					.prepare(`SELECT COUNT(*) n FROM variants v ${whereSql}`)
					.bind(...args)
					.first<{ n: number }>();
		total = totalRow?.n ?? 0;
	}

	const vrows =
		params.sort === 'gene'
			? candidate
				? await db
						.prepare(
							`WITH ${candidate.cte}, gene_hits AS (
							SELECT v.id, MIN(g.symbol_norm) gene_sort
							FROM candidate c
							JOIN variants v ON v.id=c.variant_id
							JOIN genes g ON g.chrom=v.chrom AND v.pos BETWEEN g.start AND g."end"
							${whereSql}
							GROUP BY v.id
							ORDER BY gene_sort ${dir}, v.chrom, v.pos
							LIMIT ? OFFSET ?
						)
						SELECT v.*
						FROM variants v
						JOIN gene_hits h ON h.id=v.id
						ORDER BY h.gene_sort ${dir}, v.chrom, v.pos`
						)
						.bind(...candidate.args, ...args, limit, offset)
						.all<any>()
				: await db
						.prepare(
							`WITH gene_hits AS (
							SELECT v.id, MIN(g.symbol_norm) gene_sort
							FROM genes g
							JOIN variants v ON v.chrom=g.chrom AND v.pos BETWEEN g.start AND g."end"
							${whereSql}
							GROUP BY v.id
							ORDER BY gene_sort ${dir}, v.chrom, v.pos
							LIMIT ? OFFSET ?
						)
						SELECT v.*
						FROM variants v
						JOIN gene_hits h ON h.id=v.id
						ORDER BY h.gene_sort ${dir}, v.chrom, v.pos`
						)
						.bind(...args, limit, offset)
						.all<any>()
			: candidate
				? await db
						.prepare(`WITH ${candidate.cte} SELECT v.* FROM candidate c JOIN variants v ON v.id=c.variant_id ${whereSql} ${orderSql} LIMIT ? OFFSET ?`)
						.bind(...candidate.args, ...args, ...orderArgs, limit, offset)
						.all<any>()
			: await db
					.prepare(`SELECT * FROM variants v ${whereSql} ${orderSql} LIMIT ? OFFSET ?`)
					.bind(...args, ...orderArgs, limit, offset)
					.all<any>();

	const ids = vrows.results.map((r) => r.id);
	if (ids.length === 0) return finalizeVariantSearch(db, scopeSlug, params, [], total);

	const placeholders = ids.map(() => '?').join(',');
	const fbiobank = biobankIds.length ? `AND f.biobank_id IN (${biobankIds.map(() => '?').join(',')})` : '';
	const fcohort = cohortIds.length ? `AND f.cohort_id IN (${cohortIds.map(() => '?').join(',')})` : '';
	const freqSql = `
		SELECT f.variant_id, f.cohort_id, c.label cohort_label, c.biobank_id, b.slug biobank_slug,
		       p.name population, p.country_code,
		       f.public_af, f.public_ac, f.an, f.ac_masked, f.ac_upper_bound, f.af_upper_bound,
		       f.genotype_masked, f.public_n_homo, f.public_n_hetero, f.public_n_homo_ref
		FROM frequencies f
		JOIN cohorts c ON c.id=f.cohort_id
		JOIN populations p ON p.id=c.population_id
		JOIN biobanks b ON b.id=f.biobank_id
		WHERE f.variant_id IN (${placeholders}) ${fbiobank} ${fcohort}
		ORDER BY COALESCE(f.public_af, f.af_upper_bound, 0) DESC, p.name`;
	const frows = await db.prepare(freqSql).bind(...ids, ...biobankIds, ...cohortIds).all<any>();
	const growSql = `
		SELECT v.id variant_id, g.ensembl_id, g.symbol, g.gene_type, g.start, g."end" AS end, g.strand
		FROM variants v
		JOIN genes g ON g.chrom=v.chrom AND v.pos BETWEEN g.start AND g."end"
		WHERE v.id IN (${placeholders})
		ORDER BY g.symbol`;
	const grows = await db.prepare(growSql).bind(...ids).all<any>();

	const byVariant = new Map<number, FreqCell[]>();
	for (const f of frows.results) {
		const cell = freqCellFromDb(f);
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
		vepLabel: v.vep_label,
		vepImpact: v.vep_impact,
		hgvsConsequence: v.hgvs_consequence,
		vepHasMultipleConsequences: Boolean(v.vep_has_multiple_consequences),
		genes: genesByVariant.get(v.id) ?? [],
		frequencies: byVariant.get(v.id) ?? []
	}));
	return finalizeVariantSearch(db, scopeSlug, params, rows, total);
}

async function variantsTableEmpty(db: QueryDb): Promise<boolean> {
	try {
		const row = await db.prepare('SELECT COUNT(*) n FROM variants').first<{ n: number }>();
		return (row?.n ?? 0) === 0;
	} catch {
		return false;
	}
}

function cachedRowMatchesQuery(row: VariantRow, q: string): boolean {
	return rowMatchesSearchQuery(row, q);
}

function cachedRowMatchesGene(row: VariantRow, gene: string): boolean {
	return rowMatchesGeneToken(row, gene);
}

function hasFrequencyRangeParams(params: SearchParams): boolean {
	return params.afMin != null || params.afMax != null || params.acMin != null || params.acMax != null;
}

function frequencyCellQualifies(f: FreqCell, params: SearchParams): boolean {
	if ((f.ac ?? 0) <= 0) return false;
	if (hasFrequencyRangeParams(params) && f.af == null && f.ac == null) return false;
	if (params.afMin != null && (f.af == null || f.af < params.afMin)) return false;
	if (params.afMax != null && (f.af == null || f.af > params.afMax)) return false;
	if (params.acMin != null && (f.ac == null || f.ac < params.acMin)) return false;
	if (params.acMax != null && (f.ac == null || f.ac > params.acMax)) return false;
	return true;
}

function rowQualifiesFrequencies(row: VariantRow, params: SearchParams, biobankSlugs: string[]): boolean {
	const match = params.match === 'all' ? 'all' : 'any';
	const cohortIds = params.cohorts ?? [];
	const cohortMatch = params.cohortMatch === 'all' ? 'all' : 'any';
	const hasFreqSelector = biobankSlugs.length > 0 || cohortIds.length > 0 || hasFrequencyRangeParams(params);
	if (!hasFreqSelector) return true;

	const qualifies = (f: FreqCell) => {
		if (biobankSlugs.length && !biobankSlugs.includes(f.biobankSlug)) return false;
		if (cohortIds.length && cohortMatch !== 'all' && !cohortIds.includes(f.cohortId)) return false;
		return frequencyCellQualifies(f, params);
	};

	if (cohortIds.length && cohortMatch === 'all') {
		return cohortIds.every((cohortId) => row.frequencies.some((f) => f.cohortId === cohortId && qualifies(f)));
	}
	if (biobankSlugs.length && match === 'all') {
		return biobankSlugs.every((slug) =>
			row.frequencies.some(
				(f) =>
					f.biobankSlug === slug &&
					frequencyCellQualifies(f, params) &&
					(!cohortIds.length || cohortIds.includes(f.cohortId))
			)
		);
	}
	return row.frequencies.some(qualifies);
}

function applyScopeToRows(rows: VariantRow[], scopeSlug: string | null): VariantRow[] {
	if (!scopeSlug) return rows;
	return rows
		.map((row) => {
			const frequencies = row.frequencies.filter((f) => f.biobankSlug === scopeSlug);
			if (!frequencies.length) return null;
			return { ...row, frequencies };
		})
		.filter((row): row is VariantRow => row !== null);
}

function sortCachedRows(rows: VariantRow[], params: SearchParams): VariantRow[] {
	const dir = params.dir === 'desc' ? -1 : 1;
	const sorted = [...rows];
	if (params.sort === 'rsid') {
		sorted.sort((a, b) => dir * ((a.rsid ?? 0) - (b.rsid ?? 0)) || a.chrom - b.chrom || a.pos - b.pos);
	} else if (params.sort === 'vrs') {
		sorted.sort(
			(a, b) => dir * String(a.vrsDigest ?? '').localeCompare(String(b.vrsDigest ?? '')) || a.chrom - b.chrom || a.pos - b.pos
		);
	} else if (params.sort === 'gene') {
		sorted.sort(
			(a, b) =>
				dir * (a.genes[0]?.symbol ?? '').localeCompare(b.genes[0]?.symbol ?? '') || a.chrom - b.chrom || a.pos - b.pos
		);
	} else if (params.sort === 'maxaf') {
		sorted.sort((a, b) => {
			const maxA = Math.max(...a.frequencies.map((f) => f.af ?? 0), 0);
			const maxB = Math.max(...b.frequencies.map((f) => f.af ?? 0), 0);
			return dir * (maxA - maxB) || a.chrom - b.chrom || a.pos - b.pos;
		});
	} else {
		sorted.sort((a, b) => dir * (a.chrom - b.chrom) || dir * (a.pos - b.pos));
	}
	return sorted;
}

async function searchExploreCacheFallback(
	db: QueryDb,
	scopeSlug: string | null,
	params: SearchParams
): Promise<{ rows: VariantRow[]; total: number } | null> {
	if (params.biobanks?.includes('__none__')) return null;
	const cached = await getStats(db, `explore:${scopeSlug ?? 'global'}`);
	if (!cached?.rows?.length) return null;

	const cohortIds = await resolveSearchCohortIds(db, params);
	if (params.country?.trim() && !cohortIds.length) return null;
	const freqParams = cohortIds.length ? { ...params, cohorts: cohortIds } : params;

	const limit = Math.min(Math.max(params.limit ?? 50, 1), 500);
	const offset = Math.max(params.offset ?? 0, 0);
	const biobankSlugs = scopeSlug
		? [scopeSlug]
		: (params.biobanks ?? []).filter((slug) => slug && slug !== '__none__');
	const vepImpacts = [...new Set((params.vepImpacts ?? []).map((v) => v.trim().toUpperCase()).filter((v) => VALID_VEP_IMPACTS.has(v)))];
	const vepConsequences = [...new Set((params.vepConsequences ?? []).map((v) => v.trim()).filter(Boolean))];

	let rows = sanitizeVariantRowsForPublic(cached.rows) as VariantRow[];
	rows = applyScopeToRows(rows, scopeSlug);
	rows = rows.filter((row) => {
		if (params.q?.trim() && !cachedRowMatchesQuery(row, params.q)) return false;
		if (params.gene?.trim() && !cachedRowMatchesGene(row, params.gene)) return false;
		if (params.chrom != null && row.chrom !== params.chrom) return false;
		if (params.posMin != null && row.pos < params.posMin) return false;
		if (params.posMax != null && row.pos > params.posMax) return false;
		if (params.rsid != null && row.rsid !== params.rsid) return false;
		if (vepImpacts.length && (!row.vepImpact || !vepImpacts.includes(row.vepImpact.toUpperCase()))) return false;
		if (vepConsequences.length && (!row.vepLabel || !vepConsequences.includes(row.vepLabel))) return false;
		return rowQualifiesFrequencies(row, freqParams, biobankSlugs);
	});

	rows = sortCachedRows(rows, params);
	const total = rows.length;
	return { rows: rows.slice(offset, offset + limit), total };
}

async function finalizeVariantSearch(
	db: QueryDb,
	scopeSlug: string | null,
	params: SearchParams,
	rows: VariantRow[],
	total: number
): Promise<{ rows: VariantRow[]; total: number }> {
	if (rows.length === 0 && total === 0 && (await variantsTableEmpty(db))) {
		const cached = await searchExploreCacheFallback(db, scopeSlug, params);
		if (cached) return cached;
	}
	return { rows, total };
}

export async function getVariant(db: QueryDb, id: number): Promise<VariantRow | null> {
	const v = await db.prepare('SELECT * FROM variants WHERE id=?').bind(id).first<any>();
	if (!v) return null;
	const frows = await db
		.prepare(
			`SELECT f.cohort_id, c.label cohort_label, c.biobank_id, b.slug biobank_slug,
			        p.name population, p.country_code,
			        f.public_af, f.public_ac, f.an, f.ac_masked, f.ac_upper_bound, f.af_upper_bound,
			        f.genotype_masked, f.public_n_homo, f.public_n_hetero, f.public_n_homo_ref
			 FROM frequencies f
			 JOIN cohorts c ON c.id=f.cohort_id
			 JOIN populations p ON p.id=c.population_id
			 JOIN biobanks b ON b.id=f.biobank_id
			 WHERE f.variant_id=? ORDER BY COALESCE(f.public_af, f.af_upper_bound, 0) DESC, p.name`
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
		vepLabel: v.vep_label,
		vepImpact: v.vep_impact,
		hgvsConsequence: v.hgvs_consequence,
		vepHasMultipleConsequences: Boolean(v.vep_has_multiple_consequences),
		genes: withGenes.genes,
		frequencies: frows.results.map(freqCellFromDb)
	};
}

function scopedVariantExistsSql(scopeSlug: string | null): { sql: string; args: unknown[] } {
	if (!scopeSlug) return { sql: '', args: [] };
	return {
		sql: `AND EXISTS (
			SELECT 1
			FROM frequencies f
			JOIN biobanks b ON b.id=f.biobank_id
			WHERE f.variant_id=v.id AND b.slug=? AND f.ac > 0
		)`,
		args: [scopeSlug]
	};
}

async function getVariantBySql(db: QueryDb, whereSql: string, args: unknown[], scopeSlug: string | null) {
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

// When the explore stats cache is populated but the variants table is empty (common
// in local dev after baking stats without seeding), fall back to the cached rows.
async function resolveVariantFromExploreCache(db: QueryDb, raw: string, scopeSlug: string | null): Promise<VariantRow | null> {
	const token = normalizeVariantSearchInput(decodeURIComponent(raw));
	if (!token) return null;
	const cached = await getStats(db, `explore:${scopeSlug ?? 'global'}`);
	if (!cached?.rows?.length) return null;
	const rows = sanitizeVariantRowsForPublic(cached.rows) as VariantRow[];
	const hit = rows.find((row) => rowMatchesSearchToken(row, token));
	if (!hit) return null;
	if (scopeSlug) {
		const frequencies = hit.frequencies.filter((f) => f.biobankSlug === scopeSlug);
		if (!frequencies.length) return null;
		return { ...hit, frequencies };
	}
	return hit;
}

export async function resolveVariantIdentifier(db: QueryDb, raw: string, scopeSlug: string | null): Promise<VariantRow | null> {
	const token = normalizeVariantSearchInput(decodeURIComponent(raw));
	if (!token) return null;

	const termCond = parseVariantSearchTerm(token);
	if (termCond) {
		const variant = await getVariantBySql(db, termCond.sql, termCond.args, scopeSlug);
		if (variant) return variant;
	}

	const geneCond = await geneConditionForQuery(db, token);
	if (geneCond) {
		const variant = await getVariantBySql(db, geneCond.sql, geneCond.args, scopeSlug);
		if (variant) return variant;
	}

	return resolveVariantFromExploreCache(db, raw, scopeSlug);
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
		countryMappings?: Array<{
			country: string;
			countryCode: string;
			regionGroup: string;
			subpopulationCode: string;
			subpopulationName: string;
			sampleCount: number;
		}>;
	}>;
	totalSamples: number;
	totalVariants: number;
}

export interface ExploreFilterOptions {
	options: { slug: string; name: string }[];
	populations: { cohortId: number; name: string; biobankSlug: string; biobankName: string }[];
}

export async function exploreFilterOptions(db: QueryDb, scopeSlug: string | null): Promise<ExploreFilterOptions> {
	const scopeId = await biobankIdForSlug(db, scopeSlug);
	if (scopeSlug && !scopeId) return { options: [], populations: [] };
	const bindArgs = scopeId ? [scopeId] : [];
	const bWhere = scopeId ? 'WHERE b.id=?' : '';
	const bankRows = await db
		.prepare(`SELECT b.id, b.slug, b.name FROM biobanks b ${bWhere} ORDER BY b.id`)
		.bind(...bindArgs)
		.all<any>();
	const popRows = await db
		.prepare(
			`SELECT c.id cohort_id, p.name, b.slug biobank_slug, b.name biobank_name
			 FROM cohorts c
			 JOIN populations p ON p.id=c.population_id
			 JOIN biobanks b ON b.id=c.biobank_id
			 ${scopeId ? 'WHERE b.id=?' : ''}
			 ORDER BY b.id, p.name`
		)
		.bind(...bindArgs)
		.all<any>();
	const populations = popRows.results.map((p) => ({
		cohortId: p.cohort_id,
		name: p.name,
		biobankSlug: p.biobank_slug,
		biobankName: p.biobank_name
	}));
	return {
		options: bankRows.results.map((b) => ({ slug: b.slug, name: b.name })),
		populations: scopeSlug && populations.length <= 1 ? [] : populations
	};
}

export async function biobanksOverview(db: QueryDb, scopeSlug: string | null): Promise<BiobankOverview[]> {
	const scopeId = await biobankIdForSlug(db, scopeSlug);
	if (scopeSlug && !scopeId) return [];
	const bWhere = scopeId ? 'WHERE id=?' : '';
	const banks = await db.prepare(`SELECT * FROM biobanks ${bWhere} ORDER BY id`).bind(...(scopeId ? [scopeId] : [])).all<any>();

	const out: BiobankOverview[] = [];
	for (const b of banks.results) {
		const pops = await db
			.prepare(
				`SELECT p.id, p.name, p.country, p.country_code, p.lat, p.lon,
				        c.id cohort_id, c.sample_count,
				        (SELECT COUNT(DISTINCT f.variant_id) FROM frequencies f WHERE f.cohort_id=c.id AND f.ac > 0) variant_count
				 FROM populations p
				 JOIN cohorts c ON c.population_id=p.id
				 WHERE p.biobank_id=? ORDER BY p.name`
			)
			.bind(b.id)
			.all<any>();
		let mappingRows: any[] = [];
		try {
			const populationIds = pops.results.map((p) => p.id);
			if (populationIds.length) {
				mappingRows = (
					await db
						.prepare(
							`SELECT population_id, country, country_code, region_group, subpopulation_code, subpopulation_name, sample_count
							 FROM population_country_mappings
							 WHERE population_id IN (${populationIds.map(() => '?').join(',')})
							 ORDER BY population_id, region_group, country, subpopulation_code`
						)
						.bind(...populationIds)
						.all<any>()
				).results;
			}
		} catch {
			mappingRows = [];
		}
		const mappingsByPopulation = new Map<number, any[]>();
		for (const m of mappingRows) {
			const list = mappingsByPopulation.get(m.population_id) ?? [];
			list.push({
				country: m.country,
				countryCode: m.country_code,
				regionGroup: m.region_group,
				subpopulationCode: m.subpopulation_code,
				subpopulationName: m.subpopulation_name,
				sampleCount: m.sample_count
			});
			mappingsByPopulation.set(m.population_id, list);
		}
		const populations = pops.results.map((p) => ({
			id: p.id,
			name: p.name,
			country: p.country,
			countryCode: p.country_code,
			lat: p.lat,
			lon: p.lon,
			sampleCount: p.sample_count,
			cohortId: p.cohort_id,
			variantCount: p.variant_count,
			countryMappings: mappingsByPopulation.get(p.id) ?? []
		}));
		const totalSamples = populations.reduce((s, p) => s + p.sampleCount, 0);
		const tv = await db
			.prepare('SELECT COUNT(DISTINCT variant_id) n FROM frequencies WHERE biobank_id=? AND ac > 0')
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

export async function tenantStats(db: QueryDb, scopeSlug: string | null): Promise<TenantStats> {
	const id = await biobankIdForSlug(db, scopeSlug);
	if (scopeSlug && !id) return { variants: 0, common: 0, lowFreq: 0, rare: 0 };
	const where = id ? 'WHERE biobank_id=?' : '';
	const args = id ? [id] : [];
	const r = await db
		.prepare(
			`SELECT
				COUNT(*) variants,
				SUM(CASE WHEN m>=0.05 THEN 1 ELSE 0 END) common,
				SUM(CASE WHEN m>=0.01 AND m<0.05 THEN 1 ELSE 0 END) lowFreq,
				SUM(CASE WHEN m<0.01 THEN 1 ELSE 0 END) rare
			 FROM (SELECT variant_id, MAX(public_af) m FROM frequencies ${where} GROUP BY variant_id HAVING MAX(ac) > 0)`
		)
		.bind(...args)
		.first<any>();
	return { variants: r?.variants ?? 0, common: r?.common ?? 0, lowFreq: r?.lowFreq ?? 0, rare: r?.rare ?? 0 };
}

// Precomputed stats cache (seeder writes `home:<scope>` / `explore:<scope>`).
// Resilient: if the table is missing or unseeded, return null so callers fall
// back to live computation instead of 500-ing.
export async function getStats(db: QueryDb, key: string): Promise<any | null> {
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

export async function getDatasets(db: QueryDb, scopeSlug: string | null): Promise<DatasetRow[]> {
	const scopeId = await biobankIdForSlug(db, scopeSlug);
	if (scopeSlug && !scopeId) return [];
	const where = scopeId ? 'WHERE biobank_id=?' : '';
	const rows = await db
		.prepare(`SELECT id, slug, biobank_id, metadata FROM datasets ${where} ORDER BY id`)
		.bind(...(scopeId ? [scopeId] : []))
		.all<any>();
	return rows.results.map((d) => ({ id: d.id, slug: d.slug, biobankId: d.biobank_id, metadata: safeParse(d.metadata) }));
}

// The browser shows het/hom_alt/hom_ref unless every dataset in scope opts out.
export async function showGenotypeCounts(db: QueryDb, scopeSlug: string | null): Promise<boolean> {
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
