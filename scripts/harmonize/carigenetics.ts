// Harmonize CariGenetics TSVs -> anchor variants (deduped, with VRS) + frequencies.
// Usage: bun scripts/harmonize/carigenetics.ts [--limit N]

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromCode } from './lib/chroms';
import { parseLocusKey, rsidNum, variantKey, isSnv } from './lib/locus';
import { snvToVrs } from './lib/vrs';
import { LineWriter, eachLine } from './lib/io';
import { CARI_FILE_COHORT } from './lib/registry';

const ROOT = join(import.meta.dir, '../..');
const SRC = join(ROOT, 'data/carigenetics');
const OUT = join(ROOT, 'data/normalized/carigenetics');
mkdirSync(OUT, { recursive: true });

const limitArg = process.argv.indexOf('--limit');
const LIMIT = limitArg > -1 ? Number(process.argv[limitArg + 1]) : Infinity;

const variantId = new Map<string, number>();
let nextId = 1;

const vw = new LineWriter(join(OUT, 'variants.ndjson'));
const fw = new LineWriter(join(OUT, 'frequencies.ndjson'));

let skipped = 0;
for (const [file, cohortId] of Object.entries(CARI_FILE_COHORT)) {
	const path = join(SRC, `allele_freq_${file}.tsv`);
	let rows = 0;
	await eachLine(path, (line, i) => {
		if (i === 0 || rows >= LIMIT) return; // header / limit
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
		let id = variantId.get(key);
		if (id === undefined) {
			id = nextId++;
			variantId.set(key, id);
			const vrs = isSnv(loc.ref, loc.alt) ? snvToVrs({ code, pos: loc.pos, ref: loc.ref, alt: loc.alt }) : null;
			vw.writeJson({
				id,
				chrom: code,
				pos: loc.pos,
				ref: loc.ref,
				alt: loc.alt,
				rsid: rsidNum(c[6]),
				vrs_digest: vrs?.digest ?? null,
				pos_hg19: null,
				lifted: 0
			});
		}
		const ac = Number(c[1]);
		const an = Number(c[2]);
		const nHomo = Number(c[3]);
		const nHetero = Number(c[4]);
		const af = Number(c[5]);
		const nHomoRef = Math.max(0, Math.round(an / 2) - nHomo - nHetero);
		fw.writeJson({
			variant_id: id,
			cohort_id: cohortId,
			biobank_id: 1,
			ac,
			an,
			af,
			n_homo: nHomo,
			n_hetero: nHetero,
			n_homo_ref: nHomoRef
		});
	});
	console.log(`  ${file}: ${rows} rows -> cohort ${cohortId}`);
}

const nv = await vw.close();
const nf = await fw.close();
console.log(`carigenetics done: ${nv} unique variants, ${nf} frequency rows, ${skipped} skipped`);
console.log(`max variant id: ${nextId - 1}`);
