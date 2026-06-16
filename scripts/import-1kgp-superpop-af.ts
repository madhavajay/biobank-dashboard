// Import 1000 Genomes super-population AF files into the local D1 SQLite.
//
// Expected files:
//   data/1kgp/superpop-af/1kg_grch38_AFR.allele_freq.tsv
//   data/1kgp/superpop-af/1kg_grch38_AMR.allele_freq.tsv
//   data/1kgp/superpop-af/1kg_grch38_EAS.allele_freq.tsv
//   data/1kgp/superpop-af/1kg_grch38_EUR.allele_freq.tsv
//   data/1kgp/superpop-af/1kg_grch38_SAS.allele_freq.tsv
//
// Usage:
//   bun scripts/import-1kgp-superpop-af.ts

import { Database } from 'bun:sqlite';
import { createReadStream, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import {
	BIOBANKS,
	COHORTS,
	COHORT_DATASET,
	DATASETS,
	ONE_KGP_SUPERPOP_COHORT_ID,
	ONE_KGP_SUPERPOP_DATASET_ID,
	POPULATIONS,
	POPULATION_COUNTRY_MAPPINGS
} from './harmonize/lib/registry';
import { publicFrequencyValues } from '../src/lib/privacy';

type SuperPop = keyof typeof ONE_KGP_SUPERPOP_COHORT_ID;

const ROOT = join(import.meta.dir, '..');
const D1_DIR = join(ROOT, '.wrangler/state/v3/d1/miniflare-D1DatabaseObject');
const AF_DIR = join(ROOT, 'data/1kgp/superpop-af');
const SUPERPOPS: SuperPop[] = ['AFR', 'AMR', 'EAS', 'EUR', 'SAS'];

const q = (s: string) => `'${String(s).replace(/'/g, "''")}'`;
const n = (v: number | null | undefined) => (v === null || v === undefined ? 'NULL' : String(v));

function findDbFile(): string {
	for (const f of readdirSync(D1_DIR).filter((f) => f.endsWith('.sqlite') && f !== 'metadata.sqlite')) {
		const path = join(D1_DIR, f);
		try {
			const db = new Database(path);
			try {
				if (db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='variants'").get()) return path;
			} finally {
				db.close();
			}
		} catch {
			/* skip */
		}
	}
	throw new Error(`No local D1 sqlite with a variants table found in ${D1_DIR}`);
}

function parseLocusKey(key: string) {
	const parts = key.split('-');
	if (parts.length !== 4) return null;
	return { chrom: parts[0], pos: Number(parts[1]), ref: parts[2], alt: parts[3] };
}

function chromCode(chrom: string): number | null {
	const c = chrom.replace(/^chr/i, '').toUpperCase();
	if (c === 'X') return 23;
	if (c === 'Y') return 24;
	if (c === 'M' || c === 'MT') return 25;
	const n = Number(c);
	return Number.isInteger(n) && n >= 1 && n <= 22 ? n : null;
}

function ensureSchema(db: Database) {
	db.exec(`
		CREATE TABLE IF NOT EXISTS population_country_mappings (
			id INTEGER PRIMARY KEY,
			population_id INTEGER NOT NULL,
			country TEXT NOT NULL,
			country_code TEXT NOT NULL,
			region_group TEXT NOT NULL DEFAULT '',
			subpopulation_code TEXT NOT NULL DEFAULT '',
			subpopulation_name TEXT NOT NULL DEFAULT '',
			sample_count INTEGER NOT NULL DEFAULT 0
		);
		CREATE INDEX IF NOT EXISTS population_country_mappings_population_idx ON population_country_mappings(population_id);
		CREATE INDEX IF NOT EXISTS population_country_mappings_country_idx ON population_country_mappings(country_code);
	`);
}

function seedMetadata(db: Database) {
	const biobank = BIOBANKS.find((b) => b.slug === '1kgp');
	if (!biobank) throw new Error('1kgp biobank missing from registry');
	const insertBiobank = db.query('INSERT OR REPLACE INTO biobanks (id,slug,name,description,website) VALUES (?,?,?,?,?)');
	insertBiobank.run(biobank.id, biobank.slug, biobank.name, biobank.description, biobank.website);

	const insertPopulation = db.query('INSERT OR REPLACE INTO populations (id,biobank_id,name,country,country_code,admin_level,lat,lon) VALUES (?,?,?,?,?,?,?,?)');
	for (const p of POPULATIONS.filter((p) => p.biobankId === biobank.id)) {
		insertPopulation.run(p.id, p.biobankId, p.name, p.country, p.countryCode, p.adminLevel, p.lat, p.lon);
	}

	db.query('DELETE FROM population_country_mappings WHERE population_id IN (SELECT id FROM populations WHERE biobank_id=?)').run(biobank.id);
	const insertMapping = db.query(
		'INSERT INTO population_country_mappings (id,population_id,country,country_code,region_group,subpopulation_code,subpopulation_name,sample_count) VALUES (?,?,?,?,?,?,?,?)'
	);
	for (const m of POPULATION_COUNTRY_MAPPINGS) {
		insertMapping.run(m.id, m.populationId, m.country, m.countryCode, m.regionGroup, m.subpopulationCode, m.subpopulationName, m.sampleCount);
	}

	const insertDataset = db.query('INSERT OR REPLACE INTO datasets (id,biobank_id,slug,metadata) VALUES (?,?,?,?)');
	for (const d of DATASETS.filter((d) => d.biobankId === biobank.id)) {
		insertDataset.run(d.id, d.biobankId, d.slug, JSON.stringify(d.metadata));
	}

	const insertCohort = db.query('INSERT OR REPLACE INTO cohorts (id,biobank_id,population_id,dataset_id,label,assay,release,sample_count) VALUES (?,?,?,?,?,?,?,?)');
	for (const c of COHORTS.filter((c) => c.biobankId === biobank.id)) {
		insertCohort.run(c.id, c.biobankId, c.populationId, COHORT_DATASET[c.id], c.label, c.assay, c.release, c.sampleCount);
	}
}

async function importSuperpop(db: Database, superpop: SuperPop) {
	const file = join(AF_DIR, `1kg_grch38_${superpop}.allele_freq.tsv`);
	const cohortId = ONE_KGP_SUPERPOP_COHORT_ID[superpop];
	const biobankId = 4;
	const datasetId = ONE_KGP_SUPERPOP_DATASET_ID[superpop];
	const findVariant = db.query('SELECT id FROM variants WHERE chrom=? AND pos=? AND ref=? AND alt=?');
	const insertFreq = db.query(
		`INSERT OR REPLACE INTO frequencies (
			variant_id,cohort_id,biobank_id,ac,an,af,n_homo,n_hetero,n_homo_ref,
			ac_masked,public_ac,public_af,ac_upper_bound,af_upper_bound,
			genotype_masked,public_n_hetero,public_n_homo,public_n_homo_ref
		) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
	);

	let imported = 0;
	let skipped = 0;
	let maxAn = 0;
	let inTxn = false;
	const begin = () => {
		db.exec('BEGIN');
		inTxn = true;
	};
	const commit = () => {
		db.exec('COMMIT');
		inTxn = false;
	};
	begin();

	try {
		const rl = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
		let header = true;
		for await (const line of rl) {
			if (header) {
				header = false;
				continue;
			}
			if (!line) continue;
			const [locusKey, acRaw, anRaw, homRaw, hetRaw, afRaw] = line.split('\t');
			const locus = parseLocusKey(locusKey);
			const chrom = locus ? chromCode(locus.chrom) : null;
			if (!locus || !chrom) {
				skipped++;
				continue;
			}
			const variant = findVariant.get(chrom, locus.pos, locus.ref, locus.alt) as { id: number } | null;
			if (!variant) {
				skipped++;
				continue;
			}
			const ac = Number(acRaw);
			const an = Number(anRaw);
			const af = Number(afRaw);
			const nHomo = Number(homRaw);
			const nHetero = Number(hetRaw);
			maxAn = Math.max(maxAn, an);
			const publicValues = publicFrequencyValues({ ac, an, af, n_homo: nHomo, n_hetero: nHetero, n_homo_ref: null });
			insertFreq.run(
				variant.id,
				cohortId,
				biobankId,
				ac,
				an,
				af,
				nHomo,
				nHetero,
				null,
				publicValues.acMasked ? 1 : 0,
				publicValues.publicAc,
				publicValues.publicAf,
				publicValues.acUpperBound,
				publicValues.afUpperBound,
				publicValues.genotypeMasked ? 1 : 0,
				publicValues.publicNHetero,
				publicValues.publicNHomo,
				publicValues.publicNHomoRef
			);
			imported++;
			if (imported % 10000 === 0) {
				commit();
				begin();
			}
		}
		if (inTxn) commit();
	} catch (error) {
		if (inTxn) db.exec('ROLLBACK');
		throw error;
	}

	const participants = Math.ceil(maxAn / 2);
	db.query('UPDATE cohorts SET sample_count=? WHERE id=?').run(participants, cohortId);
	const variantCount = (db.query('SELECT COUNT(*) n FROM frequencies WHERE cohort_id=?').get(cohortId) as { n: number }).n;
	const dataset = DATASETS.find((d) => d.id === datasetId);
	if (dataset) {
		db.query('UPDATE datasets SET metadata=? WHERE id=?').run(
			JSON.stringify({ ...dataset.metadata, participants, variants: variantCount }),
			datasetId
		);
	}
	console.log(`${superpop}: imported ${imported.toLocaleString()}, skipped ${skipped.toLocaleString()}, participants ${participants.toLocaleString()}`);
}

const db = new Database(findDbFile());
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA synchronous = NORMAL');

try {
	ensureSchema(db);
	seedMetadata(db);
	db.query('DELETE FROM frequencies WHERE biobank_id=?').run(4);
	for (const superpop of SUPERPOPS) await importSuperpop(db, superpop);
	db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
} finally {
	db.close();
}
