// Export variants from the local D1 SQLite database as a basic VCF for tools
// such as Ensembl VEP.
//
// Usage:
//   bun scripts/export-vcf.ts --out data/vep/input/variants.vcf.gz
//   bun scripts/export-vcf.ts --biobank bipmed --observed-only --out data/vep/input/bipmed.vcf.gz
//   bun scripts/export-vcf.ts --db path/to/db.sqlite > variants.vcf

import { Database } from 'bun:sqlite';
import { createWriteStream, existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { once } from 'node:events';
import type { Writable } from 'node:stream';
import { finished } from 'node:stream/promises';
import { createGzip } from 'node:zlib';

const ROOT = join(import.meta.dir, '..');
const D1_DIR = join(ROOT, '.wrangler/state/v3/d1/miniflare-D1DatabaseObject');

const CHROM: Record<number, string> = {
	1: '1',
	2: '2',
	3: '3',
	4: '4',
	5: '5',
	6: '6',
	7: '7',
	8: '8',
	9: '9',
	10: '10',
	11: '11',
	12: '12',
	13: '13',
	14: '14',
	15: '15',
	16: '16',
	17: '17',
	18: '18',
	19: '19',
	20: '20',
	21: '21',
	22: '22',
	23: 'X',
	24: 'Y',
	25: 'MT'
};

interface Args {
	db?: string;
	out?: string;
	biobanks: string[];
	datasets: string[];
	cohorts: number[];
	observedOnly: boolean;
	chrPrefix: boolean;
	noInfo: boolean;
	limit?: number;
	batchSize: number;
}

interface VariantRow {
	id: number;
	chrom: number;
	pos: number;
	ref: string;
	alt: string;
	rsid: number | null;
	vrs_digest: string | null;
	pos_hg19: number | null;
	lifted: number;
}

function usage(code = 1): never {
	console.error(`Export variants from local D1 SQLite as VCF.

Options:
  --db <path>              SQLite file to read. Defaults to the local D1 database.
  --out <path>             Output VCF path. Defaults to stdout.
  --biobank <slug[,slug]>  Keep variants present in these biobanks.
  --dataset <slug[,slug]>  Keep variants present in these datasets.
  --cohort <id[,id]>       Keep variants present in these cohorts.
  --observed-only          Require at least one frequency row with AC > 0.
  --chr-prefix             Emit chr1..chr22/chrX/chrY/chrM instead of 1..22/X/Y/MT.
  --no-info                Emit INFO as "." instead of local VRS/liftover metadata.
  --limit <n>              Export at most n records.
  --batch-size <n>         Rows fetched per query batch. Default: 50000.
  --help                   Show this help.

Examples:
  bun scripts/export-vcf.ts --out data/vep/input/variants.vcf.gz
  bun scripts/export-vcf.ts --biobank bipmed --observed-only --out data/vep/input/bipmed.vcf.gz
  bun scripts/export-vcf.ts --db .wrangler/state/v3/d1/miniflare-D1DatabaseObject/example.sqlite > variants.vcf`);
	process.exit(code);
}

function splitValues(raw: string): string[] {
	return raw
		.split(',')
		.map((v) => v.trim())
		.filter(Boolean);
}

function parsePositiveInt(raw: string, flag: string): number {
	const n = Number(raw);
	if (!Number.isInteger(n) || n <= 0) throw new Error(`${flag} must be a positive integer, got "${raw}"`);
	return n;
}

function parseArgs(argv: string[]): Args {
	const args: Args = {
		biobanks: [],
		datasets: [],
		cohorts: [],
		observedOnly: false,
		chrPrefix: false,
		noInfo: false,
		batchSize: 50_000
	};

	for (let i = 0; i < argv.length; i++) {
		const flag = argv[i];
		const next = () => {
			const value = argv[++i];
			if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`);
			return value;
		};

		switch (flag) {
			case '--help':
			case '-h':
				usage(0);
			case '--db':
				args.db = next();
				break;
			case '--out':
			case '-o':
				args.out = next();
				break;
			case '--biobank':
				args.biobanks.push(...splitValues(next()));
				break;
			case '--dataset':
				args.datasets.push(...splitValues(next()));
				break;
			case '--cohort':
				args.cohorts.push(...splitValues(next()).map((v) => parsePositiveInt(v, '--cohort')));
				break;
			case '--observed-only':
				args.observedOnly = true;
				break;
			case '--chr-prefix':
				args.chrPrefix = true;
				break;
			case '--no-info':
				args.noInfo = true;
				break;
			case '--limit':
				args.limit = parsePositiveInt(next(), '--limit');
				break;
			case '--batch-size':
				args.batchSize = parsePositiveInt(next(), '--batch-size');
				break;
			default:
				throw new Error(`Unknown argument: ${flag}`);
		}
	}

	return args;
}

function findDbFile(): string {
	if (!existsSync(D1_DIR)) {
		throw new Error(`Local D1 directory not found: ${D1_DIR}. Run migrations/seed first, or pass --db.`);
	}

	const files = readdirSync(D1_DIR).filter((f) => f.endsWith('.sqlite') && f !== 'metadata.sqlite');
	for (const file of files) {
		const path = join(D1_DIR, file);
		try {
			const db = new Database(path, { readonly: true });
			try {
				const hasVariants = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='variants'").get();
				if (hasVariants) return path;
			} finally {
				db.close();
			}
		} catch {
			// Skip files that are not readable SQLite databases.
		}
	}

	throw new Error('No local D1 SQLite database with a `variants` table found. Run `bun run db:migrate:local` and seed it, or pass --db.');
}

function placeholders(values: unknown[]): string {
	return values.map(() => '?').join(',');
}

function variantFilter(args: Args): { sql: string; values: unknown[] } {
	const clauses: string[] = [];
	const values: unknown[] = [];
	const frequencyClauses: string[] = [];

	if (args.observedOnly) frequencyClauses.push('f.ac > 0');
	if (args.cohorts.length) {
		frequencyClauses.push(`f.cohort_id IN (${placeholders(args.cohorts)})`);
		values.push(...args.cohorts);
	}
	if (args.biobanks.length) {
		frequencyClauses.push(`b.slug IN (${placeholders(args.biobanks)})`);
		values.push(...args.biobanks);
	}
	if (args.datasets.length) {
		frequencyClauses.push(`d.slug IN (${placeholders(args.datasets)})`);
		values.push(...args.datasets);
	}

	if (frequencyClauses.length) {
		const needsBiobanks = args.biobanks.length > 0;
		const needsDatasets = args.datasets.length > 0;
		clauses.push(`EXISTS (
			SELECT 1
			FROM frequencies f
			${needsBiobanks ? 'JOIN biobanks b ON b.id = f.biobank_id' : ''}
			${needsDatasets ? 'JOIN cohorts c ON c.id = f.cohort_id JOIN datasets d ON d.id = c.dataset_id' : ''}
			WHERE f.variant_id = v.id AND ${frequencyClauses.join(' AND ')}
		)`);
	}

	return { sql: clauses.length ? clauses.join(' AND ') : '1', values };
}

function chromName(code: number, chrPrefix: boolean): string {
	const name = CHROM[code] ?? String(code);
	if (!chrPrefix) return name;
	if (name === 'MT') return 'chrM';
	return `chr${name}`;
}

function vcfId(rsid: number | null): string {
	return rsid ? `rs${rsid}` : '.';
}

function escapeInfoValue(value: string | number): string {
	return encodeURIComponent(String(value)).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function infoField(row: VariantRow, noInfo: boolean): string {
	if (noInfo) return '.';
	const parts: string[] = [];
	if (row.vrs_digest) parts.push(`VRS_DIGEST=${escapeInfoValue(row.vrs_digest)}`);
	if (row.pos_hg19 !== null) parts.push(`POS_HG19=${row.pos_hg19}`);
	if (row.lifted) parts.push('LIFTED');
	return parts.length ? parts.join(';') : '.';
}

function vcfLine(row: VariantRow, args: Args): string {
	return [
		chromName(row.chrom, args.chrPrefix),
		row.pos,
		vcfId(row.rsid),
		row.ref,
		row.alt,
		'.',
		'PASS',
		infoField(row, args.noInfo)
	].join('\t');
}

function openOutput(path: string | null): { stream: Writable; close: () => Promise<void>; compressed: boolean } {
	if (!path) return { stream: process.stdout, close: async () => {}, compressed: false };

	if (path.endsWith('.gz')) {
		const file = createWriteStream(path);
		const gzip = createGzip();
		const gzipDone = finished(gzip);
		const fileDone = finished(file);
		gzip.pipe(file);
		return {
			stream: gzip,
			close: async () => {
				gzip.end();
				await Promise.all([gzipDone, fileDone]);
			},
			compressed: true
		};
	}

	const stream = createWriteStream(path, { encoding: 'utf8' });
	const done = finished(stream);
	return {
		stream,
		close: async () => {
			stream.end();
			await done;
		},
		compressed: false
	};
}

class BufferedLineWriter {
	private lines: string[] = [];
	private bytes = 0;

	constructor(
		private stream: Writable,
		private chunkBytes = 4 * 1024 * 1024
	) {}

	async write(line: string): Promise<void> {
		this.lines.push(line);
		this.bytes += line.length + 1;
		if (this.bytes >= this.chunkBytes) await this.flush();
	}

	async flush(): Promise<void> {
		if (!this.lines.length) return;
		const chunk = `${this.lines.join('\n')}\n`;
		this.lines = [];
		this.bytes = 0;
		if (!this.stream.write(chunk)) await once(this.stream, 'drain');
	}
}

async function main() {
	const args = parseArgs(Bun.argv.slice(2));
	const dbPath = resolve(args.db ?? findDbFile());
	const outPath = args.out ? resolve(args.out) : null;
	const db = new Database(dbPath, { readonly: true });

	if (outPath && !existsSync(dirname(outPath))) {
		throw new Error(`Output directory does not exist: ${dirname(outPath)}`);
	}

	const output = openOutput(outPath);

	const filter = variantFilter(args);
	const totalLimit = args.limit ?? Number.POSITIVE_INFINITY;
	let exported = 0;
	let lastChrom = 0;
	let lastPos = 0;
	let lastId = 0;

	console.error(`DB: ${dbPath.replace(`${ROOT}/`, '')}`);
	if (outPath) console.error(`VCF: ${outPath.replace(`${ROOT}/`, '')}${output.compressed ? ' (gzip)' : ''}`);
	const writer = new BufferedLineWriter(output.stream);

	try {
		await writer.write('##fileformat=VCFv4.2');
		await writer.write('##source=biobank-dashboard-sqlite');
		await writer.write('##reference=GRCh38');
		await writer.write('##INFO=<ID=VRS_DIGEST,Number=1,Type=String,Description="GA4GH VRS digest stored by biobank-dashboard">');
		await writer.write('##INFO=<ID=POS_HG19,Number=1,Type=Integer,Description="Original GRCh37/hg19 position when available">');
		await writer.write('##INFO=<ID=LIFTED,Number=0,Type=Flag,Description="Variant position was lifted to GRCh38 by the importer">');
		await writer.write('#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO');

		while (exported < totalLimit) {
			const limit = Math.min(args.batchSize, totalLimit - exported);
			const rows = db
				.query(
					`SELECT v.id, v.chrom, v.pos, v.ref, v.alt, v.rsid, v.vrs_digest, v.pos_hg19, v.lifted
					 FROM variants v
					 WHERE ${filter.sql}
					   AND (v.chrom > ? OR (v.chrom = ? AND v.pos > ?) OR (v.chrom = ? AND v.pos = ? AND v.id > ?))
					 ORDER BY v.chrom, v.pos, v.id
					 LIMIT ?`
				)
				.all(...filter.values, lastChrom, lastChrom, lastPos, lastChrom, lastPos, lastId, limit) as VariantRow[];

			if (!rows.length) break;

			for (const row of rows) {
				await writer.write(vcfLine(row, args));
				exported++;
				lastChrom = row.chrom;
				lastPos = row.pos;
				lastId = row.id;
			}

			if (exported % (args.batchSize * 10) === 0) console.error(`exported ${exported.toLocaleString()} variants`);
		}

		await writer.flush();
	} finally {
		db.close();
		await output.close();
	}

	console.error(`done: exported ${exported.toLocaleString()} variants`);
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});
