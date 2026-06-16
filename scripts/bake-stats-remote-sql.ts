// Emits a stats.sql for the REMOTE D1 (which has CariGenetics + BIPMed only, no PGP).
// Reads the LOCAL sqlite (whose biobank_id IN (1,2) data is identical to remote) and
// bakes the `stats` rows, scoping `global` to biobanks 1,2 so it matches remote exactly.
// Does NOT write the local stats table. Apply the output with:
//   wrangler d1 execute DB --remote --file data/stats-remote.sql
//
// Usage: bun scripts/bake-stats-remote-sql.ts

import { Database } from 'bun:sqlite';
import { readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { BIOBANKS } from './harmonize/lib/registry';

const ROOT = join(import.meta.dir, '..');
const D1_DIR = join(ROOT, '.wrangler/state/v3/d1/miniflare-D1DatabaseObject');
const OUT = join(ROOT, 'data/stats-remote.sql');

function findDbFile(): string {
	for (const f of readdirSync(D1_DIR).filter((f) => f.endsWith('.sqlite') && f !== 'metadata.sqlite')) {
		try {
			const db = new Database(join(D1_DIR, f));
			try {
				if (db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='variants'").get()) return join(D1_DIR, f);
			} finally {
				db.close();
			}
		} catch {
			/* skip */
		}
	}
	throw new Error('No D1 sqlite with a `variants` table.');
}

const db = new Database(findDbFile(), { readonly: true });
const CHROM: Record<number, string> = {
	1: '1', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10', 11: '11', 12: '12',
	13: '13', 14: '14', 15: '15', 16: '16', 17: '17', 18: '18', 19: '19', 20: '20', 21: '21', 22: '22', 23: 'X', 24: 'Y', 25: 'MT'
};
const q = (s: string, ...a: any[]) => db.query(s).all(...a) as any[];
const q1 = (s: string, ...a: any[]) => db.query(s).get(...a) as any;

function freqCellsFor(ids: number[], bids: number[]) {
	if (!ids.length) return new Map<number, any[]>();
	const fb = bids.length ? `AND f.biobank_id IN (${bids.join(',')})` : '';
	const rows = q(
		`SELECT f.variant_id, f.cohort_id, c.label cohort_label, c.biobank_id, b.slug biobank_slug, p.name population, p.country_code,
		        f.public_af, f.public_ac, f.an, f.ac_masked, f.ac_upper_bound, f.af_upper_bound,
		        f.genotype_masked, f.public_n_homo, f.public_n_hetero, f.public_n_homo_ref
		 FROM frequencies f JOIN cohorts c ON c.id=f.cohort_id JOIN populations p ON p.id=c.population_id JOIN biobanks b ON b.id=f.biobank_id
		 WHERE f.variant_id IN (${ids.join(',')}) ${fb} ORDER BY COALESCE(f.public_af, f.af_upper_bound, 0) DESC, p.name`
	);
	const m = new Map<number, any[]>();
	for (const f of rows) {
		const cell = {
			cohortId: f.cohort_id, cohortLabel: f.cohort_label, population: f.population, countryCode: f.country_code,
			biobankId: f.biobank_id, biobankSlug: f.biobank_slug, af: f.public_af, ac: f.public_ac, an: f.an,
			acMasked: Boolean(f.ac_masked), acUpperBound: f.ac_upper_bound, afUpperBound: f.af_upper_bound,
			genotypeMasked: Boolean(f.genotype_masked),
			nHomo: f.public_n_homo, nHetero: f.public_n_hetero, nHomoRef: f.public_n_homo_ref
		};
		(m.get(f.variant_id) ?? m.set(f.variant_id, []).get(f.variant_id)!).push(cell);
	}
	return m;
}

// overlapping genes for a set of variant ids (same logic as attachGenesToRows)
function genesFor(ids: number[]) {
	const m = new Map<number, any[]>();
	if (!ids.length) return m;
	let rows: any[] = [];
	try {
		rows = q(
			`SELECT v.id variant_id, g.ensembl_id, g.symbol, g.gene_type, g.start, g.end, g.strand
			 FROM variants v JOIN genes g ON g.chrom=v.chrom AND v.pos BETWEEN g.start AND g.end
			 WHERE v.id IN (${ids.join(',')}) ORDER BY g.symbol`
		);
	} catch {
		return m; // genes table not present
	}
	for (const g of rows) {
		const arr = m.get(g.variant_id) ?? [];
		arr.push({ ensemblId: g.ensembl_id, symbol: g.symbol, geneType: g.gene_type, start: g.start, end: g.end, strand: g.strand });
		m.set(g.variant_id, arr);
	}
	return m;
}

function buildStats(bids: number[]) {
	const wIn = bids.length ? `WHERE biobank_id IN (${bids.join(',')})` : '';
	const cls = q1(
		`SELECT COUNT(*) variants,
		        SUM(CASE WHEN m>=0.05 THEN 1 ELSE 0 END) common,
		        SUM(CASE WHEN m>=0.01 AND m<0.05 THEN 1 ELSE 0 END) lowFreq,
		        SUM(CASE WHEN m<0.01 THEN 1 ELSE 0 END) rare
		 FROM (SELECT variant_id, MAX(public_af) m FROM frequencies ${wIn} GROUP BY variant_id HAVING MAX(ac) > 0)`
	);
	const banks = q(`SELECT * FROM biobanks ${bids.length ? `WHERE id IN (${bids.join(',')})` : ''} ORDER BY id`);
	const biobanks = banks.map((b) => {
		const pops = q(
			`SELECT p.id,p.name,p.country,p.country_code,p.lat,p.lon,c.id cohort_id,c.sample_count,
			        (SELECT COUNT(*) FROM frequencies f WHERE f.cohort_id=c.id) variant_count
			 FROM populations p JOIN cohorts c ON c.population_id=p.id WHERE p.biobank_id=? ORDER BY p.name`, b.id
		);
		const pids = pops.map((p) => p.id);
		let mappings: any[] = [];
		try {
			if (pids.length) {
				mappings = q(
					`SELECT population_id, country, country_code, region_group, subpopulation_code, subpopulation_name, sample_count
					 FROM population_country_mappings
					 WHERE population_id IN (${pids.join(',')})
					 ORDER BY population_id, region_group, country, subpopulation_code`
				);
			}
		} catch {
			mappings = [];
		}
		const byPopulation = new Map<number, any[]>();
		for (const m of mappings) {
			const list = byPopulation.get(m.population_id) ?? [];
			list.push({
				country: m.country,
				countryCode: m.country_code,
				regionGroup: m.region_group,
				subpopulationCode: m.subpopulation_code,
				subpopulationName: m.subpopulation_name,
				sampleCount: m.sample_count
			});
			byPopulation.set(m.population_id, list);
		}
		const populations = pops.map((p) => ({
			id: p.id,
			name: p.name,
			country: p.country,
			countryCode: p.country_code,
			lat: p.lat,
			lon: p.lon,
			sampleCount: p.sample_count,
			cohortId: p.cohort_id,
			variantCount: p.variant_count,
			countryMappings: byPopulation.get(p.id) ?? []
		}));
		const tv = q1('SELECT COUNT(DISTINCT variant_id) n FROM frequencies WHERE biobank_id=?', b.id);
		return { id: b.id, slug: b.slug, name: b.name, description: b.description, website: b.website, populations, totalSamples: populations.reduce((s, p) => s + p.sampleCount, 0), totalVariants: tv.n };
	});
	const populations = biobanks.flatMap((b) => b.populations.map((p) => ({ ...p, biobankSlug: b.slug, biobankName: b.name })));
	const datasetCount = q1(`SELECT COUNT(*) n FROM datasets ${bids.length ? `WHERE biobank_id IN (${bids.join(',')})` : ''}`).n;
	const home = {
		biobanks, populations,
		totals: { participants: populations.reduce((s, p) => s + p.sampleCount, 0), datasetCount, variants: cls.variants, populations: populations.length },
		variantClasses: { common: cls.common, lowFreq: cls.lowFreq, rare: cls.rare }
	};

	const bf = bids.length ? `AND f.biobank_id IN (${bids.join(',')})` : '';
	const exists = `WHERE EXISTS (SELECT 1 FROM frequencies f WHERE f.variant_id=v.id ${bf} AND f.ac>0)`;
	const total = bids.length
		? q1(`SELECT COUNT(DISTINCT variant_id) n FROM frequencies WHERE biobank_id IN (${bids.join(',')}) AND ac>0`).n
		: q1('SELECT COUNT(DISTINCT variant_id) n FROM frequencies WHERE ac>0').n;
	const vrows = q(`SELECT * FROM variants v ${exists} ORDER BY v.chrom, v.pos LIMIT 50`);
	const cells = freqCellsFor(vrows.map((v) => v.id), bids);
	const gmap = genesFor(vrows.map((v) => v.id));
	const rows = vrows.map((v) => ({ id: v.id, chrom: v.chrom, chromName: CHROM[v.chrom] ?? String(v.chrom), pos: v.pos, ref: v.ref, alt: v.alt, rsid: v.rsid, vrsDigest: v.vrs_digest, posHg19: v.pos_hg19, lifted: v.lifted, vepLabel: v.vep_label, vepImpact: v.vep_impact, hgvsConsequence: v.hgvs_consequence, vepHasMultipleConsequences: Boolean(v.vep_has_multiple_consequences), genes: gmap.get(v.id) ?? [], frequencies: cells.get(v.id) ?? [] }));
	return { home, explore: { total, rows } };
}

const scopes = [{ key: 'global', bids: BIOBANKS.map((b) => b.id) }, ...BIOBANKS.map((b) => ({ key: b.slug, bids: [b.id] }))];

const sqlEsc = (s: string) => s.replace(/'/g, "''");
const lines = ['CREATE TABLE IF NOT EXISTS stats (key TEXT PRIMARY KEY, value TEXT NOT NULL);', 'DELETE FROM stats;'];
for (const sc of scopes) {
	const s = buildStats(sc.bids);
	lines.push(`INSERT OR REPLACE INTO stats (key,value) VALUES ('home:${sc.key}','${sqlEsc(JSON.stringify(s.home))}');`);
	lines.push(`INSERT OR REPLACE INTO stats (key,value) VALUES ('explore:${sc.key}','${sqlEsc(JSON.stringify(s.explore))}');`);
	console.log(`baked ${sc.key}: ${s.explore.rows.length} explore rows, ${s.home.totals.variants} variants`);
}

mkdirSync(join(ROOT, 'data'), { recursive: true });
writeFileSync(OUT, lines.join('\n') + '\n');
console.log(`wrote ${OUT.replace(ROOT + '/', '')} (${scopes.length * 2} stats rows)`);
