import { createReadStream, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { Client } from 'pg';
import { publicFrequencyValues } from '../src/lib/privacy';
import {
	BIOBANKS,
	COHORT_DATASET,
	COHORTS,
	DATASETS,
	ONE_KGP_SUPERPOP_COHORT_ID,
	POPULATIONS,
	POPULATION_COUNTRY_MAPPINGS
} from './harmonize/lib/registry';

const ROOT = join(import.meta.dir, '..');
const NORM = join(ROOT, 'data/normalized');
const ONE_KGP_AF_DIR = join(ROOT, 'data/1kgp/superpop-af');
const NORMALIZED_SOURCES = ['carigenetics', 'bipmed', 'pgp'];
const ONE_KGP_SUPERPOPS = ['AFR', 'AMR', 'EAS', 'EUR', 'SAS'] as const;
const DEFAULT_DATABASE_URL = 'postgresql://biovault_data_user:biovault_data_password@127.0.0.1:55432/biovault_data?sslmode=disable';

function envDatabaseUrl() {
	const envPath = join(ROOT, '.env');
	if (!existsSync(envPath)) return undefined;
	const line = readFileSync(envPath, 'utf8')
		.split(/\r?\n/)
		.find((l) => /^\s*DATABASE_URL\s*=/.test(l));
	if (!line) return undefined;
	return line
		.replace(/^\s*DATABASE_URL\s*=\s*/, '')
		.trim()
		.replace(/^['"]|['"]$/g, '');
}

const databaseUrl = process.env.DATABASE_URL ?? envDatabaseUrl() ?? DEFAULT_DATABASE_URL;

mkdirSync(NORM, { recursive: true });

const q = (s: string) => `'${String(s).replace(/'/g, "''")}'`;
const n = (v: number | null | undefined) => (v === null || v === undefined ? 'NULL' : String(v));

function readNdjson(path: string): any[] {
	if (!existsSync(path)) return [];
	return readFileSync(path, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

function chromCode(chrom: string): number | null {
	const c = chrom.replace(/^chr/i, '').toUpperCase();
	if (c === 'X') return 23;
	if (c === 'Y') return 24;
	if (c === 'M' || c === 'MT') return 25;
	const n = Number(c);
	return Number.isInteger(n) && n >= 1 && n <= 22 ? n : null;
}

function parseLocusKey(key: string) {
	const [chromRaw, posRaw, ref, alt] = key.split('-');
	const chrom = chromCode(chromRaw ?? '');
	const pos = Number(posRaw);
	if (!chrom || !Number.isInteger(pos) || !ref || !alt) return null;
	return { chrom, pos, ref, alt };
}

async function readOneKgpSuperpopFrequencies(variantByLocus: Map<string, number>) {
	const rows: any[] = [];
	if (!existsSync(ONE_KGP_AF_DIR)) return rows;

	for (const superpop of ONE_KGP_SUPERPOPS) {
		const file = join(ONE_KGP_AF_DIR, `1kg_grch38_${superpop}.allele_freq.tsv`);
		if (!existsSync(file)) continue;
		const cohortId = ONE_KGP_SUPERPOP_COHORT_ID[superpop];
		const rl = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
		let header = true;
		let imported = 0;
		let skipped = 0;

		for await (const line of rl) {
			if (header) {
				header = false;
				continue;
			}
			if (!line) continue;
			const [locusKey, acRaw, anRaw, homRaw, hetRaw, afRaw] = line.split('\t');
			const locus = parseLocusKey(locusKey ?? '');
			const variantId = locus ? variantByLocus.get(`${locus.chrom}:${locus.pos}:${locus.ref}:${locus.alt}`) : undefined;
			if (!variantId) {
				skipped++;
				continue;
			}
			rows.push({
				variant_id: variantId,
				cohort_id: cohortId,
				biobank_id: 4,
				ac: Number(acRaw),
				an: Number(anRaw),
				af: Number(afRaw),
				n_homo: Number(homRaw),
				n_hetero: Number(hetRaw),
				n_homo_ref: null
			});
			imported++;
		}
		console.log(`1KGP ${superpop}: ${imported.toLocaleString()} frequency rows, ${skipped.toLocaleString()} skipped`);
	}
	return rows;
}

function batchInsert(head: string, rows: string[]) {
	const sql: string[] = [];
	const batchSize = 5000;
	for (let i = 0; i < rows.length; i += batchSize) sql.push(head + rows.slice(i, i + batchSize).join(',') + ';');
	return sql;
}

const variants = NORMALIZED_SOURCES.flatMap((source) => readNdjson(join(NORM, source, 'variants.ndjson')));
const variantByLocus = new Map<string, number>();
for (const v of variants) variantByLocus.set(`${v.chrom}:${v.pos}:${v.ref}:${v.alt}`, v.id);
const rawFreqs = [
	...NORMALIZED_SOURCES.flatMap((source) => readNdjson(join(NORM, source, 'frequencies.ndjson'))),
	...(await readOneKgpSuperpopFrequencies(variantByLocus))
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
	if ((f.an ?? 0) > (prev.an ?? 0)) freqByKey.set(key, f);
}
const freqs = [...freqByKey.values()];
if (duplicateFreqs) console.warn(`deduped ${duplicateFreqs} duplicate frequency rows`);

const maxAn = new Map<number, number>();
for (const f of freqs) maxAn.set(f.cohort_id, Math.max(maxAn.get(f.cohort_id) ?? 0, f.an));

const setupSql: string[] = [
	'DROP TABLE IF EXISTS frequencies, variants, genes, population_country_mappings, cohorts, datasets, populations, biobanks, stats;',
	readFileSync(join(ROOT, 'sql/postgres/0000_schema.sql'), 'utf8'),
	'TRUNCATE frequencies, variants, population_country_mappings, cohorts, datasets, populations, biobanks, stats;'
];
const indexSql = readFileSync(join(ROOT, 'sql/postgres/0001_indexes.sql'), 'utf8');
const genesSqlPath = join(ROOT, 'data/genes.sql');
const genesSql = existsSync(genesSqlPath)
	? readFileSync(genesSqlPath, 'utf8').replace(/chrom,start,end,strand/g, 'chrom,start,"end",strand')
	: '';
const dataSql: string[] = [];

for (const b of BIOBANKS)
	dataSql.push(`INSERT INTO biobanks (id,slug,name,description,website) VALUES (${b.id},${q(b.slug)},${q(b.name)},${q(b.description)},${q(b.website)});`);
for (const p of POPULATIONS)
	dataSql.push(`INSERT INTO populations (id,biobank_id,name,country,country_code,admin_level,lat,lon) VALUES (${p.id},${p.biobankId},${q(p.name)},${q(p.country)},${q(p.countryCode)},${q(p.adminLevel)},${p.lat},${p.lon});`);
for (const m of POPULATION_COUNTRY_MAPPINGS)
	dataSql.push(
		`INSERT INTO population_country_mappings (id,population_id,country,country_code,region_group,subpopulation_code,subpopulation_name,sample_count) VALUES (${m.id},${m.populationId},${q(m.country)},${q(m.countryCode)},${q(m.regionGroup)},${q(m.subpopulationCode)},${q(m.subpopulationName)},${m.sampleCount});`
	);
for (const d of DATASETS) {
	const cohortIds = COHORTS.filter((c) => COHORT_DATASET[c.id] === d.id).map((c) => c.id);
	const participants = COHORTS.filter((c) => cohortIds.includes(c.id)).reduce(
		(s, c) => s + (c.sampleCount || Math.ceil((maxAn.get(c.id) ?? 0) / 2)),
		0
	);
	const variantIds = new Set(freqs.filter((f) => cohortIds.includes(f.cohort_id)).map((f) => f.variant_id));
	dataSql.push(
		`INSERT INTO datasets (id,biobank_id,slug,metadata) VALUES (${d.id},${d.biobankId},${q(d.slug)},${q(JSON.stringify({ ...d.metadata, participants, variants: variantIds.size }))});`
	);
}
for (const c of COHORTS) {
	const sampleCount = c.sampleCount || Math.ceil((maxAn.get(c.id) ?? 0) / 2);
	dataSql.push(
		`INSERT INTO cohorts (id,biobank_id,population_id,dataset_id,label,assay,release,sample_count) VALUES (${c.id},${c.biobankId},${c.populationId},${n(COHORT_DATASET[c.id])},${q(c.label)},${q(c.assay)},${q(c.release)},${sampleCount});`
	);
}

dataSql.push(
	...batchInsert(
		'INSERT INTO variants (id,chrom,pos,ref,alt,rsid,vrs_digest,pos_hg19,lifted) VALUES ',
		variants.map((v) => `(${v.id},${v.chrom},${v.pos},${q(v.ref)},${q(v.alt)},${n(v.rsid)},${v.vrs_digest ? q(v.vrs_digest) : 'NULL'},${n(v.pos_hg19)},${v.lifted ? 'TRUE' : 'FALSE'})`)
	)
);
dataSql.push(
	...batchInsert(
		`INSERT INTO frequencies (
			variant_id,cohort_id,biobank_id,ac,an,af,n_homo,n_hetero,n_homo_ref,
			ac_masked,public_ac,public_af,ac_upper_bound,af_upper_bound,
			genotype_masked,public_n_hetero,public_n_homo,public_n_homo_ref
		) VALUES `,
		freqs.map((f) => {
			const p = publicFrequencyValues(f);
			return `(${f.variant_id},${f.cohort_id},${f.biobank_id},${f.ac},${f.an},${f.af},${n(f.n_homo)},${n(f.n_hetero)},${n(f.n_homo_ref)},${p.acMasked ? 'TRUE' : 'FALSE'},${n(p.publicAc)},${n(p.publicAf)},${n(p.acUpperBound)},${n(p.afUpperBound)},${p.genotypeMasked ? 'TRUE' : 'FALSE'},${n(p.publicNHetero)},${n(p.publicNHomo)},${n(p.publicNHomoRef)})`;
		})
	)
);

const client = new Client({ connectionString: databaseUrl });
await client.connect();
try {
	for (const statement of setupSql) await client.query(statement);
	await client.query('BEGIN');
	await client.query('SET LOCAL synchronous_commit = OFF');
	for (const statement of dataSql) await client.query(statement);
	if (genesSql) await client.query(genesSql);
	await client.query('COMMIT');
	await client.query(indexSql);
	console.log(`postgres seed: ${variants.length} variants, ${freqs.length} frequencies, ${genesSql ? 'genes, ' : ''}${setupSql.length + dataSql.length + (genesSql ? 1 : 0) + 1} statements`);
} catch (error) {
	await client.query('ROLLBACK').catch(() => undefined);
	throw error;
} finally {
	await client.end();
}
