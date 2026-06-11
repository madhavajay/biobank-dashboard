// Harmonize the PGP Harvard (USA) allele-freq TSV (GRCh38) -> new cohort 8.
// Same column format as CariGenetics; variants are deduped against the existing
// carigenetics + bipmed anchor so shared loci reuse their canonical id.
// Usage: bun scripts/harmonize/pgp.ts [--limit N]

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromCode } from './lib/chroms';
import { parseLocusKey, rsidNum, variantKey, isSnv } from './lib/locus';
import { snvToVrs } from './lib/vrs';
import { LineWriter, eachLine } from './lib/io';

const ROOT = join(import.meta.dir, '../..');
const SRC = '/Users/madhavajay/dev/snpdata/clean/allele_freqs/allele_freq_pgp_usa.tsv';
const OUT = join(ROOT, 'data/normalized/pgp');
const NORM = join(ROOT, 'data/normalized');
const COHORT = 8;
const BIOBANK = 3;
mkdirSync(OUT, { recursive: true });

const limitArg = process.argv.indexOf('--limit');
const LIMIT = limitArg > -1 ? Number(process.argv[limitArg + 1]) : Infinity;

// load existing variants as the dedupe anchor
const anchor = new Map<string, number>();
let maxId = 0;
for (const file of ['carigenetics/variants.ndjson', 'bipmed/variants.ndjson']) {
	await eachLine(join(NORM, file), (line) => {
		if (!line) return;
		const v = JSON.parse(line);
		anchor.set(variantKey(v.chrom, v.pos, v.ref, v.alt), v.id);
		if (v.id > maxId) maxId = v.id;
	});
}
console.log(`anchor: ${anchor.size} existing variants, maxId=${maxId}`);

const vw = new LineWriter(join(OUT, 'variants.ndjson'));
const fw = new LineWriter(join(OUT, 'frequencies.ndjson'));
let nextId = maxId + 1;
const newKeys = new Map<string, number>();
let rows = 0,
	matched = 0,
	novel = 0,
	skipped = 0;

await eachLine(SRC, (line, i) => {
	if (i === 0 || rows >= LIMIT) return;
	const c = line.split('\t');
	if (c.length < 7) return;
	const loc = parseLocusKey(c[0]);
	if (!loc) {
		skipped++;
		return;
	}
	const code = chromCode(loc.chrom);
	if (code === null) {
		skipped++;
		return;
	}
	rows++;
	const key = variantKey(code, loc.pos, loc.ref, loc.alt);
	let id = anchor.get(key) ?? newKeys.get(key);
	if (id === undefined) {
		id = nextId++;
		newKeys.set(key, id);
		novel++;
		const vrs = isSnv(loc.ref, loc.alt) ? snvToVrs({ code, pos: loc.pos, ref: loc.ref, alt: loc.alt }) : null;
		vw.writeJson({ id, chrom: code, pos: loc.pos, ref: loc.ref, alt: loc.alt, rsid: rsidNum(c[6]), vrs_digest: vrs?.digest ?? null, pos_hg19: null, lifted: 0 });
	} else if (anchor.has(key)) matched++;

	const ac = Number(c[1]);
	const an = Number(c[2]);
	const nHomo = Number(c[3]);
	const nHetero = Number(c[4]);
	fw.writeJson({
		variant_id: id,
		cohort_id: COHORT,
		biobank_id: BIOBANK,
		ac,
		an,
		af: Number(c[5]),
		n_homo: nHomo,
		n_hetero: nHetero,
		n_homo_ref: Math.max(0, Math.round(an / 2) - nHomo - nHetero)
	});
});

const nv = await vw.close();
const nf = await fw.close();
console.log(`pgp done: ${rows} rows, matched=${matched} novel=${novel} skipped=${skipped}`);
console.log(`  new variants written: ${nv}, frequency rows: ${nf}, max variant id: ${nextId - 1}`);
