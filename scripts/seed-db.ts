// Build a seed.sql from normalized NDJSON + registry and load it into local D1.
// Usage: bun scripts/seed-db.ts [--remote] [--local]

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { BIOBANKS, POPULATIONS, COHORTS, DATASETS, COHORT_DATASET, POPULATION_COUNTRY_MAPPINGS } from './harmonize/lib/registry';
import { publicFrequencyValues } from '../src/lib/privacy';

const ROOT = join(import.meta.dir, '..');
const NORM = join(ROOT, 'data/normalized');
const remote = process.argv.includes('--remote');

mkdirSync(NORM, { recursive: true });

const q = (s: string) => `'${String(s).replace(/'/g, "''")}'`;
const n = (v: number | null | undefined) => (v === null || v === undefined ? 'NULL' : String(v));

function readNdjson(path: string): any[] {
	if (!existsSync(path)) return [];
	return readFileSync(path, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

const variants = [
	...readNdjson(join(NORM, 'carigenetics/variants.ndjson')),
	...readNdjson(join(NORM, 'bipmed/variants.ndjson'))
];
const rawFreqs = [
	...readNdjson(join(NORM, 'carigenetics/frequencies.ndjson')),
	...readNdjson(join(NORM, 'bipmed/frequencies.ndjson'))
];
const freqByKey = new Map<string, any>();
let duplicateFreqs = 0;
for (const f of rawFreqs) {
	const key = `${f.variant_id}:${f.cohort_id}`;
	const prev = freqByKey.get(key);
	if (!prev) {
		freqByKey.set(key, f);
		continue;
	}
	duplicateFreqs++;
	// Keep the row with the larger allele number when harmonization maps two
	// source records onto the same canonical variant/cohort key.
	if ((f.an ?? 0) > (prev.an ?? 0)) freqByKey.set(key, f);
}
const freqs = [...freqByKey.values()];
if (duplicateFreqs) console.warn(`deduped ${duplicateFreqs} duplicate frequency rows`);

const maxAn = new Map<number, number>();
for (const f of freqs) maxAn.set(f.cohort_id, Math.max(maxAn.get(f.cohort_id) ?? 0, f.an));

const sql: string[] = ['PRAGMA foreign_keys=OFF;'];
for (const t of ['frequencies', 'variants', 'population_country_mappings', 'cohorts', 'datasets', 'populations', 'biobanks']) sql.push(`DELETE FROM ${t};`);

for (const b of BIOBANKS)
	sql.push(`INSERT INTO biobanks (id,slug,name,description,website) VALUES (${b.id},${q(b.slug)},${q(b.name)},${q(b.description)},${q(b.website)});`);
for (const p of POPULATIONS)
	sql.push(`INSERT INTO populations (id,biobank_id,name,country,country_code,admin_level,lat,lon) VALUES (${p.id},${p.biobankId},${q(p.name)},${q(p.country)},${q(p.countryCode)},${q(p.adminLevel)},${p.lat},${p.lon});`);
for (const m of POPULATION_COUNTRY_MAPPINGS)
	sql.push(
		`INSERT INTO population_country_mappings (id,population_id,country,country_code,region_group,subpopulation_code,subpopulation_name,sample_count) VALUES (${m.id},${m.populationId},${q(m.country)},${q(m.countryCode)},${q(m.regionGroup)},${q(m.subpopulationCode)},${q(m.subpopulationName)},${m.sampleCount});`
	);
for (const d of DATASETS) {
	const cohortIds = COHORTS.filter((c) => COHORT_DATASET[c.id] === d.id).map((c) => c.id);
	const participants = COHORTS.filter((c) => cohortIds.includes(c.id)).reduce(
		(s, c) => s + (c.sampleCount || Math.ceil((maxAn.get(c.id) ?? 0) / 2)),
		0
	);
	const variantIds = new Set(freqs.filter((f) => cohortIds.includes(f.cohort_id)).map((f) => f.variant_id));
	sql.push(
		`INSERT INTO datasets (id,biobank_id,slug,metadata) VALUES (${d.id},${d.biobankId},${q(d.slug)},${q(JSON.stringify({ ...d.metadata, participants, variants: variantIds.size }))});`
	);
}
for (const c of COHORTS) {
	const sc = c.sampleCount || Math.ceil((maxAn.get(c.id) ?? 0) / 2);
	sql.push(
		`INSERT INTO cohorts (id,biobank_id,population_id,dataset_id,label,assay,release,sample_count) VALUES (${c.id},${c.biobankId},${c.populationId},${n(COHORT_DATASET[c.id])},${q(c.label)},${q(c.assay)},${q(c.release)},${sc});`
	);
}

function batchInsert(head: string, rows: string[]) {
	const B = 500;
	for (let i = 0; i < rows.length; i += B) sql.push(head + rows.slice(i, i + B).join(',') + ';');
}

batchInsert(
	'INSERT INTO variants (id,chrom,pos,ref,alt,rsid,vrs_digest,pos_hg19,lifted) VALUES ',
	variants.map((v) => `(${v.id},${v.chrom},${v.pos},${q(v.ref)},${q(v.alt)},${n(v.rsid)},${v.vrs_digest ? q(v.vrs_digest) : 'NULL'},${n(v.pos_hg19)},${v.lifted})`)
);
batchInsert(
	`INSERT INTO frequencies (
		variant_id,cohort_id,biobank_id,ac,an,af,n_homo,n_hetero,n_homo_ref,
		ac_masked,public_ac,public_af,ac_upper_bound,af_upper_bound,
		genotype_masked,public_n_hetero,public_n_homo,public_n_homo_ref
	) VALUES `,
	freqs.map((f) => {
		const p = publicFrequencyValues(f);
		return `(${f.variant_id},${f.cohort_id},${f.biobank_id},${f.ac},${f.an},${f.af},${n(f.n_homo)},${n(f.n_hetero)},${n(f.n_homo_ref)},${p.acMasked ? 1 : 0},${n(p.publicAc)},${n(p.publicAf)},${n(p.acUpperBound)},${n(p.afUpperBound)},${p.genotypeMasked ? 1 : 0},${n(p.publicNHetero)},${n(p.publicNHomo)},${n(p.publicNHomoRef)})`;
	})
);

const out = join(NORM, 'seed.sql');
writeFileSync(out, sql.join('\n'));
console.log(`seed.sql: ${variants.length} variants, ${freqs.length} frequencies, ${sql.length} statements`);

execFileSync('bunx', ['wrangler', 'd1', 'execute', 'DB', remote ? '--remote' : '--local', '--file', out], {
	cwd: ROOT,
	stdio: 'inherit'
});
