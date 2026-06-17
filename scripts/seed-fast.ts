// Fast bulk loader for the LOCAL miniflare D1 sqlite file (millions of rows).
// Writes directly via bun:sqlite — far faster than `wrangler d1 execute --file`.
// The wrangler dev server MUST be stopped first (it holds the file open).
//
// Usage: bun scripts/seed-fast.ts

import { Database } from 'bun:sqlite';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { BIOBANKS, POPULATIONS, COHORTS, DATASETS, COHORT_DATASET, POPULATION_COUNTRY_MAPPINGS } from './harmonize/lib/registry';
import { eachLine } from './harmonize/lib/io';
import { publicFrequencyValues } from '../src/lib/privacy';

const ROOT = join(import.meta.dir, '..');
const NORM = join(ROOT, 'data/normalized');
const D1_DIR = join(ROOT, '.wrangler/state/v3/d1/miniflare-D1DatabaseObject');

// find the sqlite file that has our schema
function findDbFile(): string {
	const files = readdirSync(D1_DIR).filter((f) => f.endsWith('.sqlite') && f !== 'metadata.sqlite');
	for (const f of files) {
		try {
			const db = new Database(join(D1_DIR, f)); // read-write (WAL dbs can't open read-only)
			try {
				const t = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='variants'").get();
				if (t) return join(D1_DIR, f);
			} finally {
				db.close();
			}
		} catch {
			// not a usable sqlite db; skip
		}
	}
	throw new Error('No D1 sqlite with a `variants` table — run migrations first (bun run db:migrate:local).');
}

const path = findDbFile();
console.log('D1 file:', path.replace(ROOT + '/', ''));
const db = new Database(path);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA synchronous = OFF');

console.log('clearing tables…');
for (const t of ['frequencies', 'variants', 'population_country_mappings', 'cohorts', 'datasets', 'populations', 'biobanks']) db.exec(`DELETE FROM ${t}`);

// registry
for (const b of BIOBANKS)
	db.query('INSERT INTO biobanks (id,slug,name,description,website) VALUES (?,?,?,?,?)').run(b.id, b.slug, b.name, b.description, b.website);
for (const p of POPULATIONS)
	db.query('INSERT INTO populations (id,biobank_id,name,country,country_code,admin_level,lat,lon) VALUES (?,?,?,?,?,?,?,?)').run(
		p.id, p.biobankId, p.name, p.country, p.countryCode, p.adminLevel, p.lat, p.lon
	);
for (const m of POPULATION_COUNTRY_MAPPINGS)
	db.query('INSERT INTO population_country_mappings (id,population_id,country,country_code,region_group,subpopulation_code,subpopulation_name,sample_count) VALUES (?,?,?,?,?,?,?,?)').run(
		m.id, m.populationId, m.country, m.countryCode, m.regionGroup, m.subpopulationCode, m.subpopulationName, m.sampleCount
	);
for (const d of DATASETS)
	db.query('INSERT INTO datasets (id,biobank_id,slug,metadata) VALUES (?,?,?,?)').run(d.id, d.biobankId, d.slug, JSON.stringify(d.metadata));

// variants
const insV = db.query(
	'INSERT OR IGNORE INTO variants (id,chrom,pos,ref,alt,rsid,vrs_digest,pos_hg19,lifted) VALUES (?,?,?,?,?,?,?,?,?)'
);
async function loadVariants(file: string) {
	let n = 0;
	db.exec('BEGIN');
	await eachLine(file, (line) => {
		if (!line) return;
		const v = JSON.parse(line);
		insV.run(v.id, v.chrom, v.pos, v.ref, v.alt, v.rsid, v.vrs_digest, v.pos_hg19, v.lifted);
		if (++n % 200000 === 0) {
			db.exec('COMMIT');
			db.exec('BEGIN');
		}
	});
	db.exec('COMMIT');
	return n;
}

// frequencies (track max AN per cohort for sample_count)
// OR IGNORE: a few bipmed VCF rows lift to the same canonical variant → duplicate
// (variant_id, cohort_id); keep the first.
const insF = db.query(
	`INSERT OR IGNORE INTO frequencies (
		variant_id,cohort_id,biobank_id,ac,an,af,n_homo,n_hetero,n_homo_ref,
		ac_masked,public_ac,public_af,ac_upper_bound,af_upper_bound,
		genotype_masked,public_n_hetero,public_n_homo,public_n_homo_ref
	) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
);
const maxAn = new Map<number, number>();
async function loadFreqs(file: string) {
	let n = 0;
	db.exec('BEGIN');
	await eachLine(file, (line) => {
		if (!line) return;
		const f = JSON.parse(line);
		const p = publicFrequencyValues(f);
		insF.run(
			f.variant_id, f.cohort_id, f.biobank_id, f.ac, f.an, f.af, f.n_homo, f.n_hetero, f.n_homo_ref,
			p.acMasked ? 1 : 0, p.publicAc, p.publicAf, p.acUpperBound, p.afUpperBound,
			p.genotypeMasked ? 1 : 0, p.publicNHetero, p.publicNHomo, p.publicNHomoRef
		);
		if (f.an > (maxAn.get(f.cohort_id) ?? 0)) maxAn.set(f.cohort_id, f.an);
		if (++n % 200000 === 0) {
			db.exec('COMMIT');
			db.exec('BEGIN');
		}
	});
	db.exec('COMMIT');
	return n;
}

const t0 = Date.now();
const sources = ['carigenetics', 'bipmed', 'pgp'];
let nv = 0;
for (const s of sources) nv += await loadVariants(join(NORM, `${s}/variants.ndjson`));
console.log(`variants: ${nv.toLocaleString()} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
let nf = 0;
for (const s of sources) nf += await loadFreqs(join(NORM, `${s}/frequencies.ndjson`));
console.log(`frequencies: ${nf.toLocaleString()} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);

// cohorts (sample_count = registry value or ceil(maxAN/2); linked to dataset)
for (const c of COHORTS) {
	const sc = c.sampleCount || Math.ceil((maxAn.get(c.id) ?? 0) / 2);
	db.query('INSERT INTO cohorts (id,biobank_id,population_id,dataset_id,label,assay,release,sample_count) VALUES (?,?,?,?,?,?,?,?)').run(
		c.id, c.biobankId, c.populationId, COHORT_DATASET[c.id] ?? null, c.label, c.assay, c.release, sc
	);
}

// bake live participant/variant counts into each dataset's JSON metadata
for (const d of DATASETS) {
	const cohortIds = COHORTS.filter((c) => COHORT_DATASET[c.id] === d.id).map((c) => c.id);
	const participants = COHORTS.filter((c) => cohortIds.includes(c.id)).reduce(
		(s, c) => s + (c.sampleCount || Math.ceil((maxAn.get(c.id) ?? 0) / 2)),
		0
	);
	let variants = 0;
	if (cohortIds.length) {
		const ph = cohortIds.map(() => '?').join(',');
		variants = (db.query(`SELECT COUNT(DISTINCT variant_id) n FROM frequencies WHERE cohort_id IN (${ph})`).get(...cohortIds) as any).n;
	}
	db.query('UPDATE datasets SET metadata=? WHERE id=?').run(JSON.stringify({ ...d.metadata, participants, variants }), d.id);
}

// ---- precompute the `stats` cache (home payload + default explore page per scope) ----
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
			        (SELECT COUNT(DISTINCT f.variant_id) FROM frequencies f WHERE f.cohort_id=c.id AND f.ac > 0) variant_count
			 FROM populations p JOIN cohorts c ON c.population_id=p.id WHERE p.biobank_id=? ORDER BY p.name`, b.id
		).map((p) => ({ id: p.id, name: p.name, country: p.country, countryCode: p.country_code, lat: p.lat, lon: p.lon, sampleCount: p.sample_count, cohortId: p.cohort_id, variantCount: p.variant_count }));
		const tv = q1('SELECT COUNT(DISTINCT variant_id) n FROM frequencies WHERE biobank_id=?', b.id);
		return { id: b.id, slug: b.slug, name: b.name, description: b.description, website: b.website, populations: pops, totalSamples: pops.reduce((s, p) => s + p.sampleCount, 0), totalVariants: tv.n };
	});
	const populations = biobanks.flatMap((b) => b.populations.map((p) => ({ ...p, biobankSlug: b.slug, biobankName: b.name })));
	const datasetCount = q1(`SELECT COUNT(*) n FROM datasets ${bids.length ? `WHERE biobank_id IN (${bids.join(',')})` : ''}`).n;
	const home = {
		biobanks, populations,
		totals: { participants: populations.reduce((s, p) => s + p.sampleCount, 0), datasetCount, variants: cls.variants, populations: populations.length },
		variantClasses: { common: cls.common, lowFreq: cls.lowFreq, rare: cls.rare }
	};

	// default explore first page — always require an OBSERVED freq (ac>0)
	const bf = bids.length ? `AND f.biobank_id IN (${bids.join(',')})` : '';
	const exists = `WHERE EXISTS (SELECT 1 FROM frequencies f WHERE f.variant_id=v.id ${bf} AND f.ac>0)`;
	const total = bids.length
		? q1(`SELECT COUNT(DISTINCT variant_id) n FROM frequencies WHERE biobank_id IN (${bids.join(',')}) AND ac>0`).n
		: q1('SELECT COUNT(DISTINCT variant_id) n FROM frequencies WHERE ac>0').n;
	const vrows = q(`SELECT * FROM variants v ${exists} ORDER BY v.chrom, v.pos LIMIT 50`);
	const cells = freqCellsFor(vrows.map((v) => v.id), bids);
	const rows = vrows.map((v) => ({ id: v.id, chrom: v.chrom, chromName: CHROM[v.chrom] ?? String(v.chrom), pos: v.pos, ref: v.ref, alt: v.alt, rsid: v.rsid, vrsDigest: v.vrs_digest, posHg19: v.pos_hg19, lifted: v.lifted, vepLabel: v.vep_label, vepImpact: v.vep_impact, hgvsConsequence: v.hgvs_consequence, vepHasMultipleConsequences: Boolean(v.vep_has_multiple_consequences), frequencies: cells.get(v.id) ?? [] }));
	return { home, explore: { total, rows } };
}

db.exec('CREATE TABLE IF NOT EXISTS stats (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
db.exec('DELETE FROM stats');
const scopes = [{ key: 'global', bids: [] as number[] }, ...BIOBANKS.map((b) => ({ key: b.slug, bids: [b.id] }))];
const insS = db.query('INSERT OR REPLACE INTO stats (key,value) VALUES (?,?)');
for (const sc of scopes) {
	const s = buildStats(sc.bids);
	insS.run(`home:${sc.key}`, JSON.stringify(s.home));
	insS.run(`explore:${sc.key}`, JSON.stringify(s.explore));
}
console.log(`stats cache: ${scopes.length * 2} entries`);

db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
const counts = db.query("SELECT (SELECT COUNT(*) FROM variants) v, (SELECT COUNT(*) FROM frequencies) f").get() as any;
console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s — variants=${counts.v.toLocaleString()} frequencies=${counts.f.toLocaleString()}`);
db.close();
