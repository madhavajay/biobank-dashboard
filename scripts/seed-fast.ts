// Fast bulk loader for the LOCAL miniflare D1 sqlite file (millions of rows).
// Writes directly via bun:sqlite — far faster than `wrangler d1 execute --file`.
// The wrangler dev server MUST be stopped first (it holds the file open).
//
// Usage: bun scripts/seed-fast.ts

import { Database } from 'bun:sqlite';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { BIOBANKS, POPULATIONS, COHORTS, DATASETS, COHORT_DATASET } from './harmonize/lib/registry';
import { eachLine } from './harmonize/lib/io';

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
for (const t of ['frequencies', 'variants', 'cohorts', 'datasets', 'populations', 'biobanks']) db.exec(`DELETE FROM ${t}`);

// registry
for (const b of BIOBANKS)
	db.query('INSERT INTO biobanks (id,slug,name,description,website) VALUES (?,?,?,?,?)').run(b.id, b.slug, b.name, b.description, b.website);
for (const p of POPULATIONS)
	db.query('INSERT INTO populations (id,biobank_id,name,country,country_code,admin_level,lat,lon) VALUES (?,?,?,?,?,?,?,?)').run(
		p.id, p.biobankId, p.name, p.country, p.countryCode, p.adminLevel, p.lat, p.lon
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
	'INSERT OR IGNORE INTO frequencies (variant_id,cohort_id,biobank_id,ac,an,af,n_homo,n_hetero,n_homo_ref) VALUES (?,?,?,?,?,?,?,?,?)'
);
const maxAn = new Map<number, number>();
async function loadFreqs(file: string) {
	let n = 0;
	db.exec('BEGIN');
	await eachLine(file, (line) => {
		if (!line) return;
		const f = JSON.parse(line);
		insF.run(f.variant_id, f.cohort_id, f.biobank_id, f.ac, f.an, f.af, f.n_homo, f.n_hetero, f.n_homo_ref);
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

db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
const counts = db.query("SELECT (SELECT COUNT(*) FROM variants) v, (SELECT COUNT(*) FROM frequencies) f").get() as any;
console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s — variants=${counts.v.toLocaleString()} frequencies=${counts.f.toLocaleString()}`);
db.close();
