import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';
import { COHORTS, COHORT_DATASET, DATASETS } from './harmonize/lib/registry';

const ROOT = join(import.meta.dir, '..');
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
const client = new Client({ connectionString: databaseUrl });

await client.connect();
try {
	await client.query('BEGIN');

	for (const cohort of COHORTS) {
		const maxAn = await client.query<{ max_an: number | null }>('SELECT MAX(an) max_an FROM frequencies WHERE cohort_id=$1', [
			cohort.id
		]);
		const sampleCount = cohort.sampleCount || Math.ceil((maxAn.rows[0]?.max_an ?? 0) / 2);
		await client.query('UPDATE cohorts SET sample_count=$1 WHERE id=$2', [sampleCount, cohort.id]);
	}

	for (const dataset of DATASETS) {
		const cohortIds = COHORTS.filter((cohort) => COHORT_DATASET[cohort.id] === dataset.id).map((cohort) => cohort.id);
		if (!cohortIds.length) continue;

		const counts = await client.query<{ participants: string; variants: string }>(
			`SELECT
				(SELECT COALESCE(SUM(c.sample_count), 0) FROM cohorts c WHERE c.id = ANY($1::int[]))::text participants,
				(SELECT COUNT(DISTINCT f.variant_id) FROM frequencies f WHERE f.cohort_id = ANY($1::int[]))::text variants`,
			[cohortIds]
		);
		const participants = Number(counts.rows[0]?.participants ?? 0);
		const variants = Number(counts.rows[0]?.variants ?? 0);

		await client.query('UPDATE datasets SET metadata=$1 WHERE id=$2', [
			JSON.stringify({ ...dataset.metadata, participants, variants }),
			dataset.id
		]);
		console.log(`${dataset.slug}: ${participants.toLocaleString()} participants, ${variants.toLocaleString()} variants`);
	}

	await client.query('COMMIT');
} catch (error) {
	await client.query('ROLLBACK').catch(() => undefined);
	throw error;
} finally {
	await client.end();
}
