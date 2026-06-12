// Stream normalized NDJSON into remote D1 in smaller SQL batches.
// Usage: CLOUDFLARE_ACCOUNT_ID=... bun scripts/seed-remote-batches.ts

import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { BIOBANKS, POPULATIONS, COHORTS, DATASETS, COHORT_DATASET } from './harmonize/lib/registry';
import { eachLine } from './harmonize/lib/io';

const ROOT = join(import.meta.dir, '..');
const NORM = join(ROOT, 'data/normalized');
const TMP = join(NORM, '.remote-batches');

const ROWS_PER_INSERT = Number(process.env.ROWS_PER_INSERT ?? 500);
const INSERTS_PER_FILE = Number(process.env.INSERTS_PER_FILE ?? 100);
const RESUME_FREQUENCIES_AFTER = Number(process.env.RESUME_FREQUENCIES_AFTER ?? 0);

const q = (s: string) => `'${String(s).replace(/'/g, "''")}'`;
const n = (v: number | null | undefined) => (v === null || v === undefined ? 'NULL' : String(v));

function runSql(name: string, statements: string[]) {
	if (!statements.length) return;
	mkdirSync(TMP, { recursive: true });
	const file = join(TMP, `${String(Date.now())}-${name}.sql`);
	writeFileSync(file, statements.join('\n') + '\n');
	try {
		execFileSync('bunx', ['wrangler', 'd1', 'execute', 'DB', '--remote', '--file', file], {
			cwd: ROOT,
			stdio: 'inherit'
		});
	} finally {
		rmSync(file, { force: true });
	}
}

function insertBatches(table: string, columns: string[], rows: string[], mode = ''): string[] {
	const out: string[] = [];
	const verb = mode ? `INSERT ${mode}` : 'INSERT';
	for (let i = 0; i < rows.length; i += ROWS_PER_INSERT) {
		out.push(`${verb} INTO ${table} (${columns.join(',')}) VALUES ${rows.slice(i, i + ROWS_PER_INSERT).join(',')};`);
	}
	return out;
}

async function streamInsert(
	label: string,
	files: string[],
	columns: string[],
	rowSql: (row: any) => string | null,
	mode = ''
) {
	let rows: string[] = [];
	let statements: string[] = [];
	let read = 0;
	let written = 0;
	let fileNo = 0;

	function flushRows() {
		if (!rows.length) return;
		statements.push(...insertBatches(label, columns, rows, mode));
		written += rows.length;
		rows = [];
	}

	function flushFile(force = false) {
		flushRows();
		if (!statements.length) return;
		if (!force && statements.length < INSERTS_PER_FILE) return;
		fileNo++;
		console.log(`${label}: importing batch ${fileNo} (${written.toLocaleString()} rows written so far)`);
		runSql(`${label}-${fileNo}`, statements);
		statements = [];
	}

	for (const file of files) {
		if (!existsSync(file)) continue;
		await eachLine(file, (line) => {
			if (!line) return;
			read++;
			const row = rowSql(JSON.parse(line));
			if (!row) return;
			rows.push(row);
			if (rows.length >= ROWS_PER_INSERT) flushRows();
			if (statements.length >= INSERTS_PER_FILE) flushFile();
		});
	}
	flushFile(true);
	console.log(`${label}: read ${read.toLocaleString()}, queued ${written.toLocaleString()}`);
}

const maxAn = new Map<number, number>();
const datasetVariants = new Map<number, Set<number>>(DATASETS.map((d) => [d.id, new Set<number>()]));
const seenFreq = new Set<string>();
let duplicateFreqs = 0;
let uniqueFreqsSeen = 0;

if (RESUME_FREQUENCIES_AFTER > 0) {
	console.log(`resuming frequency import after ${RESUME_FREQUENCIES_AFTER.toLocaleString()} committed rows...`);
} else {
	console.log('clearing and loading registry metadata...');
	runSql('00-registry', [
		'PRAGMA foreign_keys=OFF;',
		'DELETE FROM frequencies;',
		'DELETE FROM variants;',
		'DELETE FROM cohorts;',
		'DELETE FROM datasets;',
		'DELETE FROM populations;',
		'DELETE FROM biobanks;',
		...BIOBANKS.map((b) => `INSERT INTO biobanks (id,slug,name,description,website) VALUES (${b.id},${q(b.slug)},${q(b.name)},${q(b.description)},${q(b.website)});`),
		...POPULATIONS.map((p) => `INSERT INTO populations (id,biobank_id,name,country,country_code,admin_level,lat,lon) VALUES (${p.id},${p.biobankId},${q(p.name)},${q(p.country)},${q(p.countryCode)},${q(p.adminLevel)},${p.lat},${p.lon});`),
		...DATASETS.map((d) => `INSERT INTO datasets (id,biobank_id,slug,metadata) VALUES (${d.id},${d.biobankId},${q(d.slug)},${q(JSON.stringify(d.metadata))});`),
		...COHORTS.map((c) => {
			const sc = c.sampleCount || 0;
			return `INSERT INTO cohorts (id,biobank_id,population_id,dataset_id,label,assay,release,sample_count) VALUES (${c.id},${c.biobankId},${c.populationId},${n(COHORT_DATASET[c.id])},${q(c.label)},${q(c.assay)},${q(c.release)},${sc});`;
		})
	]);

	await streamInsert(
		'variants',
		[join(NORM, 'carigenetics/variants.ndjson'), join(NORM, 'bipmed/variants.ndjson')],
		['id', 'chrom', 'pos', 'ref', 'alt', 'rsid', 'vrs_digest', 'pos_hg19', 'lifted'],
		(v) => `(${v.id},${v.chrom},${v.pos},${q(v.ref)},${q(v.alt)},${n(v.rsid)},${v.vrs_digest ? q(v.vrs_digest) : 'NULL'},${n(v.pos_hg19)},${v.lifted})`,
		'OR IGNORE'
	);
}

await streamInsert(
	'frequencies',
	[join(NORM, 'carigenetics/frequencies.ndjson'), join(NORM, 'bipmed/frequencies.ndjson')],
	['variant_id', 'cohort_id', 'biobank_id', 'ac', 'an', 'af', 'n_homo', 'n_hetero', 'n_homo_ref'],
	(f) => {
		const key = `${f.variant_id}:${f.cohort_id}`;
		if (seenFreq.has(key)) {
			duplicateFreqs++;
			return null;
		}
		seenFreq.add(key);
		maxAn.set(f.cohort_id, Math.max(maxAn.get(f.cohort_id) ?? 0, f.an));
		const datasetId = COHORT_DATASET[f.cohort_id];
		if (datasetId) datasetVariants.get(datasetId)?.add(f.variant_id);
		uniqueFreqsSeen++;
		if (uniqueFreqsSeen <= RESUME_FREQUENCIES_AFTER) return null;
		return `(${f.variant_id},${f.cohort_id},${f.biobank_id},${f.ac},${f.an},${f.af},${n(f.n_homo)},${n(f.n_hetero)},${n(f.n_homo_ref)})`;
	},
	'OR IGNORE'
);

if (duplicateFreqs) console.warn(`deduped ${duplicateFreqs} duplicate frequency rows`);

console.log('updating cohort sample counts and dataset metadata...');
runSql('99-metadata', [
	...COHORTS.map((c) => {
		const sc = c.sampleCount || Math.ceil((maxAn.get(c.id) ?? 0) / 2);
		return `UPDATE cohorts SET sample_count=${sc}, dataset_id=${n(COHORT_DATASET[c.id])} WHERE id=${c.id};`;
	}),
	...DATASETS.map((d) => {
		const participants = COHORTS.filter((c) => COHORT_DATASET[c.id] === d.id).reduce(
			(sum, c) => sum + (c.sampleCount || Math.ceil((maxAn.get(c.id) ?? 0) / 2)),
			0
		);
		const variants = datasetVariants.get(d.id)?.size ?? 0;
		return `UPDATE datasets SET metadata=${q(JSON.stringify({ ...d.metadata, participants, variants }))} WHERE id=${d.id};`;
	})
]);

runSql('100-counts', [
	"SELECT (SELECT COUNT(*) FROM biobanks) biobanks, (SELECT COUNT(*) FROM datasets) datasets, (SELECT COUNT(*) FROM variants) variants, (SELECT COUNT(*) FROM frequencies) frequencies;"
]);
