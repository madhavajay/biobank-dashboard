// Import worst-only Ensembl VEP annotations into the local D1 SQLite database.
//
// Usage:
//   bun scripts/import-vep-inline.ts
//   bun scripts/import-vep-inline.ts --vcf data/vep/output/variants.grch38.vep.vcf.gz

import { Database } from 'bun:sqlite';
import { createReadStream, existsSync, readdirSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { join, resolve } from 'node:path';
import { createGunzip } from 'node:zlib';

const ROOT = join(import.meta.dir, '..');
const D1_DIR = join(ROOT, '.wrangler/state/v3/d1/miniflare-D1DatabaseObject');

const DEFAULT_VCF = join(ROOT, 'data/vep/output/variants.grch38.vep.vcf.gz');

const CHROM_CODE: Record<string, number> = Object.fromEntries([
	...Array.from({ length: 22 }, (_, i) => [String(i + 1), i + 1] as const),
	['X', 23],
	['Y', 24],
	['MT', 25],
	['M', 25]
]);

// Lower rank is more severe. Based on Ensembl/VEP consequence severity order.
const CONSEQUENCE_RANK: Record<string, number> = {
	transcript_ablation: 1,
	splice_acceptor_variant: 2,
	splice_donor_variant: 3,
	stop_gained: 4,
	frameshift_variant: 5,
	stop_lost: 6,
	start_lost: 7,
	transcript_amplification: 8,
	feature_elongation: 9,
	feature_truncation: 10,
	inframe_insertion: 11,
	inframe_deletion: 12,
	missense_variant: 13,
	protein_altering_variant: 14,
	splice_donor_5th_base_variant: 15,
	splice_region_variant: 16,
	splice_donor_region_variant: 17,
	splice_polypyrimidine_tract_variant: 18,
	incomplete_terminal_codon_variant: 19,
	start_retained_variant: 20,
	stop_retained_variant: 21,
	synonymous_variant: 22,
	coding_sequence_variant: 23,
	mature_miRNA_variant: 24,
	'5_prime_UTR_variant': 25,
	'3_prime_UTR_variant': 26,
	non_coding_transcript_exon_variant: 27,
	intron_variant: 28,
	NMD_transcript_variant: 29,
	non_coding_transcript_variant: 30,
	coding_transcript_variant: 31,
	upstream_gene_variant: 32,
	downstream_gene_variant: 33,
	TFBS_ablation: 34,
	TFBS_amplification: 35,
	TF_binding_site_variant: 36,
	regulatory_region_ablation: 37,
	regulatory_region_amplification: 38,
	regulatory_region_variant: 39,
	intergenic_variant: 40,
	sequence_variant: 41
};

interface Args {
	db?: string;
	vcf: string;
	limit?: number;
	batchSize: number;
}

interface PickedAnnotation {
	label: string;
	impact: string;
	hgvs: string | null;
	score: number;
}

function usage(code = 1): never {
	console.error(`Import worst-only VEP annotations into local D1 SQLite.

Options:
  --db <path>          SQLite file to update. Defaults to local D1 database.
  --vcf <path>         VEP VCF(.gz) file. Default: data/vep/output/variants.grch38.vep.vcf.gz
  --limit <n>          Stop after n variant records, for testing.
  --batch-size <n>     Transaction batch size. Default: 50000.
  --help              Show this help.`);
	process.exit(code);
}

function parsePositiveInt(raw: string, flag: string): number {
	const n = Number(raw);
	if (!Number.isInteger(n) || n <= 0) throw new Error(`${flag} must be a positive integer, got "${raw}"`);
	return n;
}

function parseArgs(argv: string[]): Args {
	const args: Args = { vcf: DEFAULT_VCF, batchSize: 50_000 };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === '--help') usage(0);
		else if (a === '--db') args.db = resolve(argv[++i] ?? '');
		else if (a === '--vcf') args.vcf = resolve(argv[++i] ?? '');
		else if (a === '--limit') args.limit = parsePositiveInt(argv[++i] ?? '', '--limit');
		else if (a === '--batch-size') args.batchSize = parsePositiveInt(argv[++i] ?? '', '--batch-size');
		else throw new Error(`Unknown argument: ${a}`);
	}
	return args;
}

function findDbFile(): string {
	const files = readdirSync(D1_DIR).filter((f) => f.endsWith('.sqlite') && f !== 'metadata.sqlite');
	for (const f of files) {
		const path = join(D1_DIR, f);
		try {
			const db = new Database(path);
			try {
				const t = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='variants'").get();
				if (t) return path;
			} finally {
				db.close();
			}
		} catch {
			// skip non-D1 sqlite files
		}
	}
	throw new Error('No local D1 SQLite database with a `variants` table found. Run bun run db:migrate:local first.');
}

function chromCode(raw: string): number | null {
	const key = raw.replace(/^chr/i, '').toUpperCase();
	return CHROM_CODE[key] ?? null;
}

function decodeVepValue(raw: string): string {
	try {
		return decodeURIComponent(raw);
	} catch {
		return raw;
	}
}

function shortHgvs(raw: string): string | null {
	if (!raw) return null;
	const decoded = decodeVepValue(raw);
	const suffix = decoded.includes(':') ? decoded.slice(decoded.lastIndexOf(':') + 1) : decoded;
	return suffix || null;
}

function displayConsequence(term: string): string {
	return term
		.replace(/_variant$/, '')
		.replace(/^5_prime_UTR$/, '5 prime UTR')
		.replace(/^3_prime_UTR$/, '3 prime UTR')
		.replace(/^NMD_transcript$/, 'NMD transcript')
		.replace(/_/g, ' ');
}

function termRank(term: string): number {
	return CONSEQUENCE_RANK[term] ?? 999;
}

function tieBreakScore(fields: string[], hasProteinHgvs: boolean): number {
	const canonical = fields[24] === 'YES';
	const mane = Boolean(fields[25] || fields[26] || fields[27]);
	return (mane ? 0 : canonical ? 10 : 20) + (hasProteinHgvs ? 0 : 5);
}

function extractCsq(info: string): string | null {
	const m = /(?:^|;)CSQ=([^;]+)/.exec(info);
	return m?.[1] ?? null;
}

function pickWorst(csq: string): { picked: PickedAnnotation | null; hasMultipleConsequences: boolean } {
	let picked: PickedAnnotation | null = null;
	const distinctTerms = new Set<string>();

	for (const ann of csq.split(',')) {
		const fields = ann.split('|');
		const consequence = fields[1] ?? '';
		if (!consequence) continue;

		const terms = consequence.split('&').filter(Boolean);
		for (const term of terms) distinctTerms.add(term);

		let worstTerm = terms[0] ?? '';
		for (const term of terms) {
			if (termRank(term) < termRank(worstTerm)) worstTerm = term;
		}
		if (!worstTerm) continue;

		const hgvsp = shortHgvs(fields[11] ?? '');
		const hgvsc = shortHgvs(fields[10] ?? '');
		const hgvs = hgvsp ?? hgvsc;
		const score = termRank(worstTerm) * 100 + tieBreakScore(fields, Boolean(hgvsp));
		if (!picked || score < picked.score) {
			picked = {
				label: displayConsequence(worstTerm),
				impact: fields[2] || '',
				hgvs,
				score
			};
		}
	}

	return { picked, hasMultipleConsequences: distinctTerms.size > 1 };
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	if (!existsSync(args.vcf)) throw new Error(`VEP VCF not found: ${args.vcf}`);

	const dbPath = args.db ?? findDbFile();
	console.log('D1 file:', dbPath.replace(ROOT + '/', ''));
	console.log('VEP VCF:', args.vcf.replace(ROOT + '/', ''));

	const db = new Database(dbPath);
	db.exec('PRAGMA journal_mode = WAL');
	db.exec('PRAGMA synchronous = OFF');
	db.exec('PRAGMA temp_store = MEMORY');

	const update = db.query(`
		UPDATE variants
		SET vep_label=?,
		    vep_impact=?,
		    hgvs_consequence=?,
		    vep_has_multiple_consequences=?
		WHERE chrom=? AND pos=? AND ref=? AND alt=?
	`);

	const fileStream = createReadStream(args.vcf);
	const input = args.vcf.endsWith('.gz') ? fileStream.pipe(createGunzip()) : fileStream;
	const rl = createInterface({ input, crlfDelay: Infinity });

	let seen = 0;
	let withCsq = 0;
	let pickedCount = 0;
	let updated = 0;
	let missing = 0;
	let multi = 0;
	const started = Date.now();

	db.exec('BEGIN');
	try {
		for await (const line of rl) {
			if (!line || line.charCodeAt(0) === 35) continue;
			const cols = line.split('\t');
			const chrom = chromCode(cols[0] ?? '');
			if (!chrom) continue;
			const pos = Number(cols[1]);
			const ref = cols[3] ?? '';
			const alt = (cols[4] ?? '').split(',')[0] ?? '';
			const csq = extractCsq(cols[7] ?? '');
			seen++;
			if (!csq) continue;
			withCsq++;

			const { picked, hasMultipleConsequences } = pickWorst(csq);
			if (!picked) continue;
			pickedCount++;
			if (hasMultipleConsequences) multi++;

			const result = update.run(picked.label, picked.impact || null, picked.hgvs, hasMultipleConsequences ? 1 : 0, chrom, pos, ref, alt);
			if (result.changes) updated += result.changes;
			else missing++;

			if (seen % args.batchSize === 0) {
				db.exec('COMMIT');
				const elapsed = (Date.now() - started) / 1000;
				console.log(`processed=${seen.toLocaleString()} updated=${updated.toLocaleString()} missing=${missing.toLocaleString()} rate=${Math.round(seen / elapsed).toLocaleString()}/s`);
				db.exec('BEGIN');
			}
			if (args.limit && seen >= args.limit) {
				rl.close();
				input.destroy();
				fileStream.destroy();
				break;
			}
		}
		db.exec('COMMIT');
	} catch (err) {
		db.exec('ROLLBACK');
		throw err;
	} finally {
		db.close();
	}

	const elapsed = (Date.now() - started) / 1000;
	console.log(`done in ${elapsed.toFixed(1)}s`);
	console.log(`records=${seen.toLocaleString()} with_csq=${withCsq.toLocaleString()} picked=${pickedCount.toLocaleString()} updated=${updated.toLocaleString()} missing=${missing.toLocaleString()} multiple_distinct_consequences=${multi.toLocaleString()}`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
