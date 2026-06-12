// Dumps the local `genes` table to batched multi-row INSERTs for the remote D1.
// Apply with: wrangler d1 execute DB --remote --file data/genes-remote.sql
// Usage: bun scripts/dump-genes-remote-sql.ts

import { Database } from 'bun:sqlite';
import { readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dir, '..');
const D1_DIR = join(ROOT, '.wrangler/state/v3/d1/miniflare-D1DatabaseObject');
const OUT = join(ROOT, 'data/genes-remote.sql');
const BATCH = 200;

function findDbFile(): string {
	for (const f of readdirSync(D1_DIR).filter((f) => f.endsWith('.sqlite') && f !== 'metadata.sqlite')) {
		try {
			const db = new Database(join(D1_DIR, f));
			try {
				if (db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='genes'").get()) return join(D1_DIR, f);
			} finally {
				db.close();
			}
		} catch {
			/* skip */
		}
	}
	throw new Error('No D1 sqlite with a `genes` table.');
}

const db = new Database(findDbFile(), { readonly: true });
const rows = db.query('SELECT id,ensembl_id,symbol,symbol_norm,chrom,start,end,strand,gene_type FROM genes ORDER BY id').all() as any[];
const esc = (s: string) => "'" + String(s).replace(/'/g, "''") + "'";

const lines: string[] = ['DELETE FROM genes;'];
for (let i = 0; i < rows.length; i += BATCH) {
	const chunk = rows.slice(i, i + BATCH);
	const vals = chunk
		.map((r) => `(${r.id},${esc(r.ensembl_id)},${esc(r.symbol)},${esc(r.symbol_norm)},${r.chrom},${r.start},${r.end},${esc(r.strand)},${esc(r.gene_type)})`)
		.join(',');
	lines.push(`INSERT INTO genes (id,ensembl_id,symbol,symbol_norm,chrom,start,end,strand,gene_type) VALUES ${vals};`);
}

mkdirSync(join(ROOT, 'data'), { recursive: true });
writeFileSync(OUT, lines.join('\n') + '\n');
console.log(`wrote ${OUT.replace(ROOT + '/', '')}: ${rows.length} genes in ${lines.length - 1} batches`);
