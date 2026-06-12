// Harmonize BIPMed VCF -> lift hg19->GRCh38, reconcile strand vs CariGenetics anchor,
// emit new variants + frequencies (cohort 7). Frequencies come from INFO AC/AN.
// Usage: bun scripts/harmonize/bipmed.ts [--limit N]

import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { chromCode, CODE_CHROM } from './lib/chroms';
import { rsidNum, revComp, variantKey, isSnv } from './lib/locus';
import { snvToVrs } from './lib/vrs';
import { LineWriter, eachLine } from './lib/io';

const ROOT = join(import.meta.dir, '../..');
const VCF = join(ROOT, 'data/bipmed/bipmed_filter.recode.vcf');
const OUT = join(ROOT, 'data/normalized/bipmed');
const CARI = join(ROOT, 'data/normalized/carigenetics');
const TOOLS = join(import.meta.dir, '.tools');
mkdirSync(OUT, { recursive: true });

const limitArg = process.argv.indexOf('--limit');
const LIMIT = limitArg > -1 ? Number(process.argv[limitArg + 1]) : Infinity;
const COHORT = 7;
const BIOBANK = 2;

// --- load CariGenetics anchor variants (key -> id, and max id) ---
const anchor = new Map<string, number>();
let maxId = 0;
if (existsSync(join(CARI, 'variants.ndjson'))) {
	await eachLine(join(CARI, 'variants.ndjson'), (line) => {
		if (!line) return;
		const v = JSON.parse(line);
		anchor.set(variantKey(v.chrom, v.pos, v.ref, v.alt), v.id);
		if (v.id > maxId) maxId = v.id;
	});
}
console.log(`anchor: ${anchor.size} carigenetics variants, maxId=${maxId}`);

// --- pass 1: collect records + write BED for liftOver ---
interface Rec { idx: number; chrom: string; pos: number; ref: string; alt: string; rsid: number | null; ac: number; an: number; }
const recs: Rec[] = [];
const bed = new LineWriter(join(OUT, '_lift.bed'));
const reINFO = (info: string, key: string) => {
	const m = new RegExp(`(?:^|;)${key}=([^;]+)`).exec(info);
	return m ? m[1] : null;
};
let read = 0;
await eachLine(VCF, (line) => {
	if (line[0] === '#' || read >= LIMIT) return;
	const c = line.split('\t');
	if (c.length < 8) return;
	const ref = c[3].toUpperCase();
	const alt = c[4].toUpperCase();
	const info = c[7];
	const ac = Number(reINFO(info, 'AC'));
	const an = Number(reINFO(info, 'AN'));
	if (!an) return;
	const idx = recs.length;
	const bedChrom = c[0] === 'MT' ? 'chrM' : `chr${c[0]}`;
	const pos = Number(c[1]);
	recs.push({ idx, chrom: c[0], pos, ref, alt, rsid: rsidNum(reINFO(info, 'DBSNP_RS_ID') ?? undefined), ac, an });
	bed.write(`${bedChrom}\t${pos - 1}\t${pos}\t${idx}`);
	read++;
});
await bed.close();
console.log(`read ${recs.length} bipmed variants; lifting...`);

// --- run UCSC liftOver ---
const mapped = join(OUT, '_lift.mapped.bed');
const unmapped = join(OUT, '_lift.unmapped.bed');
const lift = spawnSync(join(TOOLS, 'liftOver'), [join(OUT, '_lift.bed'), join(TOOLS, 'hg19ToHg38.over.chain.gz'), mapped, unmapped], { encoding: 'utf8' });
if (lift.status !== 0) {
	console.error('liftOver failed:', lift.stderr);
	process.exit(1);
}

// idx -> {code, pos} on GRCh38
const lifted = new Map<number, { code: number; pos: number }>();
let nonprimary = 0;
await eachLine(mapped, (line) => {
	if (!line) return;
	const [chr, , end, name] = line.split('\t');
	const code = chromCode(chr);
	if (code === null) { nonprimary++; return; }
	lifted.set(Number(name), { code, pos: Number(end) });
});

// --- rejects log (anything not lifted/converted) ---
const rej = new LineWriter(join(OUT, 'rejects.tsv'));
rej.write('chrom\tpos_hg19\tref\talt\trsid\treason');

// --- pass 2: emit variants + frequencies ---
const vw = new LineWriter(join(OUT, 'variants.ndjson'));
const fw = new LineWriter(join(OUT, 'frequencies.ndjson'));
let nextId = maxId + 1;
const newKeys = new Map<string, number>();
let matched = 0, flipped = 0, novel = 0, dropped = 0;

for (const r of recs) {
	const lift38 = lifted.get(r.idx);
	if (!lift38) {
		dropped++;
		rej.write(`${r.chrom}\t${r.pos}\t${r.ref}\t${r.alt}\t${r.rsid ? 'rs' + r.rsid : '.'}\tunmapped`);
		continue;
	}
	const { code, pos } = lift38;
	let id: number | undefined;
	let ref = r.ref, alt = r.alt, vrsDigest: string | null = null, lf = 0;

	const k = variantKey(code, pos, r.ref, r.alt);
	const kRc = variantKey(code, pos, revComp(r.ref), revComp(r.alt));
	if (anchor.has(k)) { id = anchor.get(k); matched++; }
	else if (anchor.has(kRc)) { id = anchor.get(kRc); ref = revComp(r.ref); alt = revComp(r.alt); flipped++; }
	else if (newKeys.has(k)) { id = newKeys.get(k); }
	else {
		id = nextId++;
		newKeys.set(k, id);
		novel++;
		const vrs = isSnv(ref, alt) ? snvToVrs({ code, pos, ref, alt }) : null;
		vrsDigest = vrs?.digest ?? null;
		lf = 1;
		vw.writeJson({ id, chrom: code, pos, ref, alt, rsid: r.rsid, vrs_digest: vrsDigest, pos_hg19: r.pos, lifted: lf });
	}

	const af = r.an > 0 ? r.ac / r.an : 0;
	fw.writeJson({ variant_id: id, cohort_id: COHORT, biobank_id: BIOBANK, ac: r.ac, an: r.an, af, n_homo: null, n_hetero: null, n_homo_ref: null });
}

const nv = await vw.close();
const nf = await fw.close();
const nr = (await rej.close()) ;
console.log(`bipmed done: matched=${matched} strand-flipped=${flipped} novel=${novel} dropped=${dropped} nonprimary=${nonprimary}`);
console.log(`  new variants written: ${nv}, frequency rows: ${nf}, rejects logged: ${dropped}`);
