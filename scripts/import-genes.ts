// Import GENCODE GRCh38 gene intervals into the LOCAL miniflare D1 sqlite file.
//
// Download first:
//   mkdir -p data/annotations
//   curl -L https://ftp.ebi.ac.uk/pub/databases/gencode/Gencode_human/release_50/gencode.v50.annotation.gtf.gz \
//     -o data/annotations/gencode.v50.annotation.gtf.gz
//
// Then:
//   bun scripts/import-genes.ts

import { Database } from 'bun:sqlite';
import { createReadStream, readdirSync, existsSync } from 'node:fs';
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import { chromCode } from './harmonize/lib/chroms';

const ROOT = join(import.meta.dir, '..');
const D1_DIR = join(ROOT, '.wrangler/state/v3/d1/miniflare-D1DatabaseObject');
const DEFAULT_GTF = join(ROOT, 'data/annotations/gencode.v50.annotation.gtf.gz');
const gtf = process.argv.find((a) => a.endsWith('.gtf.gz')) ?? DEFAULT_GTF;

function findDbFile(): string {
	const files = readdirSync(D1_DIR).filter((f) => f.endsWith('.sqlite') && f !== 'metadata.sqlite');
	for (const f of files) {
		try {
			const db = new Database(join(D1_DIR, f));
			try {
				const t = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='variants'").get();
				if (t) return join(D1_DIR, f);
			} finally {
				db.close();
			}
		} catch {
			// skip non-openable sqlite files
		}
	}
	throw new Error('No D1 sqlite with a `variants` table found. Run local migrations first.');
}

function attrs(raw: string): Record<string, string> {
	const out: Record<string, string> = {};
	for (const m of raw.matchAll(/(\S+)\s+"([^"]*)";/g)) out[m[1]] = m[2];
	return out;
}

if (!existsSync(gtf)) {
	throw new Error(`Missing GTF: ${gtf}. Download the GENCODE GTF first.`);
}

const path = findDbFile();
console.log('D1 file:', path.replace(ROOT + '/', ''));
console.log('GTF:', gtf.replace(ROOT + '/', ''));

const db = new Database(path);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA synchronous = OFF');
db.exec(`
	CREATE TABLE IF NOT EXISTS genes (
		id INTEGER PRIMARY KEY,
		ensembl_id TEXT NOT NULL,
		symbol TEXT NOT NULL,
		symbol_norm TEXT NOT NULL,
		chrom INTEGER NOT NULL,
		start INTEGER NOT NULL,
		end INTEGER NOT NULL,
		strand TEXT NOT NULL,
		gene_type TEXT NOT NULL
	);
	CREATE INDEX IF NOT EXISTS genes_symbol_norm_idx ON genes(symbol_norm);
	CREATE INDEX IF NOT EXISTS genes_region_idx ON genes(chrom, start, end);
	DELETE FROM genes;
`);

const insert = db.query(
	'INSERT INTO genes (ensembl_id,symbol,symbol_norm,chrom,start,end,strand,gene_type) VALUES (?,?,?,?,?,?,?,?)'
);

let n = 0;
let skipped = 0;
db.exec('BEGIN');
const rl = createInterface({ input: createReadStream(gtf).pipe(createGunzip()), crlfDelay: Infinity });
for await (const line of rl) {
	if (!line || line[0] === '#') continue;
	const cols = line.split('\t');
	if (cols.length < 9 || cols[2] !== 'gene') continue;
	const chrom = chromCode(cols[0]);
	if (!chrom) {
		skipped++;
		continue;
	}
	const a = attrs(cols[8]);
	const symbol = a.gene_name;
	const ensembl = a.gene_id;
	const geneType = a.gene_type;
	if (!symbol || !ensembl || !geneType) {
		skipped++;
		continue;
	}
	insert.run(ensembl, symbol, symbol.toUpperCase(), chrom, Number(cols[3]), Number(cols[4]), cols[6], geneType);
	if (++n % 10000 === 0) {
		db.exec('COMMIT');
		db.exec('BEGIN');
	}
}
db.exec('COMMIT');
db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
db.close();

console.log(`genes imported: ${n.toLocaleString()} (${skipped.toLocaleString()} skipped non-canonical/incomplete rows)`);
