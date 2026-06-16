// Export tracked BioVault/BVS loci as a compact TSV for filtering external
// resources such as 1000 Genomes .pvar.zst files.
//
// Usage:
//   bun scripts/export-loci-filter.ts
//   bun scripts/export-loci-filter.ts --out data/1kgp/tracked-loci.tsv
//   bun scripts/export-loci-filter.ts --format locus-key --out data/1kgp/tracked-locus-keys.tsv
//   bun scripts/export-loci-filter.ts --biobank bipmed,carigenetics
//
// Default output columns match the existing BVS target variant panel shape:
//   chrom  pos  rsid  ref  alt

import { Database } from 'bun:sqlite';
import { createWriteStream, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { once } from 'node:events';
import { CODE_CHROM } from '../src/lib/server/db/chroms';

type Format = 'bvs' | 'locus-key' | 'both';

interface Args {
	dbPath?: string;
	out: string;
	format: Format;
	biobanks: string[];
	includeZeroAc: boolean;
	noHeader: boolean;
	chromPrefix: boolean;
}

const ROOT = join(import.meta.dir, '..');
const D1_DIR = join(ROOT, '.wrangler/state/v3/d1/miniflare-D1DatabaseObject');

function usage(): never {
	console.error(`Usage: bun scripts/export-loci-filter.ts [options]

Options:
  --db <path>                 SQLite/D1 database path. Defaults to local Wrangler D1.
  --out <path>                Output TSV path. Default: data/1kgp/tracked-loci.tsv
  --format <bvs|locus-key|both>
                              bvs: chrom,pos,rsid,ref,alt (default)
                              locus-key: locus_key only
                              both: locus_key,chrom,pos,rsid,ref,alt
  --biobank <slug[,slug]>     Restrict to variants present in these biobanks.
  --include-zero-ac           Include loci with only AC=0 observations.
  --no-header                 Do not write a TSV header.
  --chrom-prefix              Emit chr1 instead of 1 in chrom/locus_key.
`);
	process.exit(1);
}

function parseArgs(argv: string[]): Args {
	const args: Args = {
		out: 'data/1kgp/tracked-loci.tsv',
		format: 'bvs',
		biobanks: [],
		includeZeroAc: false,
		noHeader: false,
		chromPrefix: false
	};
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		const next = () => {
			const v = argv[++i];
			if (!v) usage();
			return v;
		};
		if (a === '--db') args.dbPath = next();
		else if (a === '--out') args.out = next();
		else if (a === '--format') {
			const format = next() as Format;
			if (!['bvs', 'locus-key', 'both'].includes(format)) usage();
			args.format = format;
		} else if (a === '--biobank') {
			args.biobanks = next()
				.split(',')
				.map((s) => s.trim())
				.filter(Boolean);
		} else if (a === '--include-zero-ac') args.includeZeroAc = true;
		else if (a === '--no-header') args.noHeader = true;
		else if (a === '--chrom-prefix') args.chromPrefix = true;
		else if (a === '-h' || a === '--help') usage();
		else usage();
	}
	return args;
}

function findDbFile(): string {
	for (const f of readdirSync(D1_DIR).filter((f) => f.endsWith('.sqlite') && f !== 'metadata.sqlite')) {
		const path = join(D1_DIR, f);
		try {
			const db = new Database(path, { readonly: true });
			try {
				if (db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='variants'").get()) return path;
			} finally {
				db.close();
			}
		} catch {
			/* skip non-D1 sqlite files */
		}
	}
	throw new Error(`No local D1 sqlite with a variants table found in ${D1_DIR}`);
}

function chromName(code: number, prefix: boolean): string {
	const name = CODE_CHROM[code] ?? String(code);
	return prefix ? `chr${name}` : name;
}

function locusKey(row: { chrom: number; pos: number; ref: string; alt: string }, prefix: boolean): string {
	return `${chromName(row.chrom, prefix)}-${row.pos}-${row.ref}-${row.alt}`;
}

function sqlFor(args: Args, db: Database): { sql: string; params: unknown[] } {
	const where = ['EXISTS (SELECT 1 FROM frequencies f WHERE f.variant_id = v.id'];
	const params: unknown[] = [];

	if (!args.includeZeroAc) where.push('AND f.ac > 0');

	if (args.biobanks.length) {
		const rows = db
			.query(`SELECT id, slug FROM biobanks WHERE slug IN (${args.biobanks.map(() => '?').join(',')})`)
			.all(...args.biobanks) as Array<{ id: number; slug: string }>;
		const found = new Set(rows.map((r) => r.slug));
		const missing = args.biobanks.filter((slug) => !found.has(slug));
		if (missing.length) throw new Error(`Unknown biobank slug(s): ${missing.join(', ')}`);
		where.push(`AND f.biobank_id IN (${rows.map(() => '?').join(',')})`);
		params.push(...rows.map((r) => r.id));
	}

	where.push(')');
	return {
		sql: `SELECT v.chrom, v.pos, v.rsid, v.ref, v.alt
		      FROM variants v
		      WHERE ${where.join(' ')}
		      ORDER BY v.chrom, v.pos, v.ref, v.alt`,
		params
	};
}

async function writeLine(out: ReturnType<typeof createWriteStream>, line: string) {
	if (!out.write(line)) await once(out, 'drain');
}

const args = parseArgs(process.argv.slice(2));
const dbPath = resolve(args.dbPath ?? findDbFile());
const outPath = resolve(ROOT, args.out);
mkdirSync(dirname(outPath), { recursive: true });

const db = new Database(dbPath, { readonly: true });
const out = createWriteStream(outPath, { encoding: 'utf8' });

let count = 0;
try {
	const { sql, params } = sqlFor(args, db);
	if (!args.noHeader) {
		if (args.format === 'bvs') await writeLine(out, 'chrom\tpos\trsid\tref\talt\n');
		else if (args.format === 'locus-key') await writeLine(out, 'locus_key\n');
		else await writeLine(out, 'locus_key\tchrom\tpos\trsid\tref\talt\n');
	}

	const stmt = db.query(sql);
	for (const row of stmt.iterate(...params) as Iterable<{ chrom: number; pos: number; rsid: number | null; ref: string; alt: string }>) {
		const chrom = chromName(row.chrom, args.chromPrefix);
		const rsid = row.rsid ? `rs${row.rsid}` : '';
		if (args.format === 'bvs') {
			await writeLine(out, `${chrom}\t${row.pos}\t${rsid}\t${row.ref}\t${row.alt}\n`);
		} else if (args.format === 'locus-key') {
			await writeLine(out, `${locusKey(row, args.chromPrefix)}\n`);
		} else {
			await writeLine(out, `${locusKey(row, args.chromPrefix)}\t${chrom}\t${row.pos}\t${rsid}\t${row.ref}\t${row.alt}\n`);
		}
		count++;
	}
} finally {
	db.close();
	out.end();
	await once(out, 'finish');
}

console.log(`wrote ${count.toLocaleString()} loci to ${outPath}`);
