// Dumps local inline VEP annotations into remote-safe staging-table SQL chunks.
// Apply in order with:
//   for f in data/vep/remote/*.sql; do wrangler d1 execute DB --remote --file "$f"; done

import { Database } from 'bun:sqlite';
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dir, '..');
const D1_DIR = join(ROOT, '.wrangler/state/v3/d1/miniflare-D1DatabaseObject');
const OUT_DIR = join(ROOT, 'data/vep/remote');
const ROWS_PER_INSERT = Number(process.env.ROWS_PER_INSERT ?? 500);
const INSERTS_PER_FILE = Number(process.env.INSERTS_PER_FILE ?? 20);
const APPLY_RANGE = Number(process.env.APPLY_RANGE ?? 100000);

function findDbFile(): string {
	for (const f of readdirSync(D1_DIR).filter((f) => f.endsWith('.sqlite') && f !== 'metadata.sqlite')) {
		try {
			const path = join(D1_DIR, f);
			const db = new Database(path, { readonly: true });
			try {
				if (db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='variants'").get()) return path;
			} finally {
				db.close();
			}
		} catch {
			/* skip */
		}
	}
	throw new Error('No local D1 sqlite with a `variants` table.');
}

const sqlValue = (v: string | number | null) => {
	if (v === null) return 'NULL';
	if (typeof v === 'number') return String(v);
	return `'${v.replace(/'/g, "''")}'`;
};

function insertSql(rows: any[]) {
	const values = rows.map(
		(r) =>
			`(${r.id},${sqlValue(r.vep_label)},${sqlValue(r.vep_impact)},${sqlValue(r.hgvs_consequence)},${Number(r.vep_has_multiple_consequences ?? 0)})`
	);
	return `INSERT OR REPLACE INTO vep_import (id,vep_label,vep_impact,hgvs_consequence,vep_has_multiple_consequences) VALUES ${values.join(',')};`;
}

rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });

writeFileSync(
	join(OUT_DIR, '0000_prepare.sql'),
	[
		'DROP TABLE IF EXISTS vep_import;',
		'CREATE TABLE vep_import (',
		'  id INTEGER PRIMARY KEY,',
		'  vep_label TEXT,',
		'  vep_impact TEXT,',
		'  hgvs_consequence TEXT,',
		'  vep_has_multiple_consequences INTEGER NOT NULL DEFAULT 0',
		');'
	].join('\n') + '\n'
);

const db = new Database(findDbFile(), { readonly: true });
const total = db.query(
	`SELECT COUNT(*) n
	 FROM variants
	 WHERE vep_label IS NOT NULL
	    OR vep_impact IS NOT NULL
	    OR hgvs_consequence IS NOT NULL
	    OR vep_has_multiple_consequences != 0`
).get() as { n: number };

const query = db.query(
	`SELECT id, vep_label, vep_impact, hgvs_consequence, vep_has_multiple_consequences
	 FROM variants
	 WHERE vep_label IS NOT NULL
	    OR vep_impact IS NOT NULL
	    OR hgvs_consequence IS NOT NULL
	    OR vep_has_multiple_consequences != 0
	 ORDER BY id
	 LIMIT ? OFFSET ?`
);

let fileNo = 0;
let written = 0;
let statements: string[] = [];
let minId = Number.MAX_SAFE_INTEGER;
let maxId = 0;

function flush() {
	if (!statements.length) return;
	fileNo++;
	const path = join(OUT_DIR, `${String(fileNo).padStart(4, '0')}_insert.sql`);
	writeFileSync(path, statements.join('\n') + '\n');
	console.log(`wrote ${path.replace(ROOT + '/', '')}`);
	statements = [];
}

for (let offset = 0; offset < total.n; offset += ROWS_PER_INSERT) {
	const rows = query.all(ROWS_PER_INSERT, offset) as any[];
	if (!rows.length) break;
	for (const r of rows) {
		minId = Math.min(minId, r.id);
		maxId = Math.max(maxId, r.id);
	}
	statements.push(insertSql(rows));
	written += rows.length;
	if (statements.length >= INSERTS_PER_FILE) flush();
}
flush();
db.close();

let applyNo = 0;
for (let start = minId; start <= maxId; start += APPLY_RANGE) {
	const end = Math.min(start + APPLY_RANGE - 1, maxId);
	applyNo++;
	const path = join(OUT_DIR, `9${String(applyNo).padStart(3, '0')}_apply.sql`);
	writeFileSync(
		path,
		`UPDATE variants
SET
  vep_label = (SELECT v.vep_label FROM vep_import v WHERE v.id = variants.id),
  vep_impact = (SELECT v.vep_impact FROM vep_import v WHERE v.id = variants.id),
  hgvs_consequence = (SELECT v.hgvs_consequence FROM vep_import v WHERE v.id = variants.id),
  vep_has_multiple_consequences = COALESCE((SELECT v.vep_has_multiple_consequences FROM vep_import v WHERE v.id = variants.id), 0)
WHERE id BETWEEN ${start} AND ${end}
  AND EXISTS (SELECT 1 FROM vep_import v WHERE v.id = variants.id);
`
	);
}

console.log(
	`dumped ${written.toLocaleString()} VEP rows into ${fileNo} insert files and ${applyNo} apply files`
);
