// Dumps PGP-Harvard (biobank 3) data missing from remote: the novel variants it
// introduced (id > anchor) + all of its frequencies. Written as chunked SQL files
// under data/pgp/ so each `wrangler d1 execute --file` stays a manageable size.
// All inserts are OR IGNORE (idempotent; shared variants already on remote are skipped).
//
// Usage: bun scripts/dump-pgp-remote-sql.ts
// Then load each file: for f in data/pgp/*.sql; do wrangler d1 execute DB --remote --file "$f"; done

import { Database } from 'bun:sqlite';
import { readdirSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { publicFrequencyValues } from '../src/lib/privacy';

const ROOT = join(import.meta.dir, '..');
const D1_DIR = join(ROOT, '.wrangler/state/v3/d1/miniflare-D1DatabaseObject');
const OUTDIR = join(ROOT, 'data/pgp');
const PGP_BIOBANK = 3;
const CHUNK = 300_000; // rows per file
const BATCH = 500; // rows per INSERT statement

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
const sQ = (s: string | null) => (s == null ? 'NULL' : "'" + String(s).replace(/'/g, "''") + "'");
const nQ = (n: number | null) => (n == null ? 'NULL' : String(n));

// anchor = max variant id NOT introduced by PGP (i.e. shared by cari/bipmed)
const anchor = (db.query('SELECT MAX(variant_id) m FROM frequencies WHERE biobank_id IN (1,2)').get() as any).m as number;

rmSync(OUTDIR, { recursive: true, force: true });
mkdirSync(OUTDIR, { recursive: true });

let part = 0;
let buf: string[] = [];
let bufRows = 0;
function flush() {
	if (!buf.length) return;
	const name = `part-${String(part).padStart(3, '0')}.sql`;
	writeFileSync(join(OUTDIR, name), buf.join('\n') + '\n');
	console.log(`  wrote ${name} (${bufRows} rows)`);
	part++;
	buf = [];
	bufRows = 0;
}
function emit(head: string, values: string[]) {
	for (let i = 0; i < values.length; i += BATCH) {
		buf.push(head + values.slice(i, i + BATCH).join(',') + ';');
		bufRows += Math.min(BATCH, values.length - i);
		if (bufRows >= CHUNK) flush();
	}
}

console.log(`PGP novel variants (id > ${anchor}) ...`);
const vrows = db.query(`SELECT id,chrom,pos,ref,alt,rsid,vrs_digest,pos_hg19,lifted FROM variants WHERE id > ${anchor} ORDER BY id`).all() as any[];
emit(
	'INSERT OR IGNORE INTO variants (id,chrom,pos,ref,alt,rsid,vrs_digest,pos_hg19,lifted) VALUES ',
	vrows.map((v) => `(${v.id},${v.chrom},${v.pos},${sQ(v.ref)},${sQ(v.alt)},${nQ(v.rsid)},${sQ(v.vrs_digest)},${nQ(v.pos_hg19)},${v.lifted})`)
);
flush();

console.log('PGP frequencies (biobank 3) ...');
const frows = db.query(`SELECT variant_id,cohort_id,biobank_id,ac,an,af,n_homo,n_hetero,n_homo_ref FROM frequencies WHERE biobank_id=${PGP_BIOBANK} ORDER BY variant_id`).all() as any[];
emit(
	`INSERT OR IGNORE INTO frequencies (
		variant_id,cohort_id,biobank_id,ac,an,af,n_homo,n_hetero,n_homo_ref,
		ac_masked,public_ac,public_af,ac_upper_bound,af_upper_bound,
		genotype_masked,public_n_hetero,public_n_homo,public_n_homo_ref
	) VALUES `,
	frows.map((f) => {
		const p = publicFrequencyValues(f);
		return `(${f.variant_id},${f.cohort_id},${f.biobank_id},${f.ac},${f.an},${f.af},${nQ(f.n_homo)},${nQ(f.n_hetero)},${nQ(f.n_homo_ref)},${p.acMasked ? 1 : 0},${nQ(p.publicAc)},${nQ(p.publicAf)},${nQ(p.acUpperBound)},${nQ(p.afUpperBound)},${p.genotypeMasked ? 1 : 0},${nQ(p.publicNHetero)},${nQ(p.publicNHomo)},${nQ(p.publicNHomoRef)})`;
	})
);
flush();

console.log(`done: ${vrows.length} variants + ${frows.length} frequencies across ${part} files in data/pgp/`);
