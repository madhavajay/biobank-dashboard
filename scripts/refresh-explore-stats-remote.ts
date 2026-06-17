import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = join(import.meta.dir, '..');
const OUT_DIR = join(ROOT, 'data/explore-stats');
const BASE_URL = process.env.BASE_URL ?? 'https://data.biovault.net';
const DB = process.env.DB_NAME ?? 'DB';
const APPLY = process.argv.includes('--apply');
const VERIFY_ONLY = process.argv.includes('--verify-only');
const CHUNK_SIZE = 24_000;

const scopes = [
	{ key: 'global', query: '' },
	{ key: 'carigenetics', query: 'tenant=carigenetics' },
	{ key: 'bipmed', query: 'tenant=bipmed' },
	{ key: 'pgp-harvard', query: 'tenant=pgp-harvard' }
];

const sqlEsc = (s: string) => s.replace(/'/g, "''");

function apiUrl(scope: (typeof scopes)[number], bypassCache: boolean) {
	const params = new URLSearchParams({ limit: '50', offset: '0' });
	if (scope.query) {
		for (const [key, value] of new URLSearchParams(scope.query)) params.set(key, value);
	}
	if (bypassCache) params.set('__cache', 'skip');
	return `${BASE_URL}/api/variants?${params.toString()}`;
}

async function verifyCache() {
	let ok = true;
	for (const scope of scopes) {
		const response = await fetch(apiUrl(scope, false), { method: 'HEAD' });
		const path = response.headers.get('x-biovault-query-path') ?? '';
		const timing = response.headers.get('server-timing') ?? '';
		const passed = response.ok && path === 'stats-cache';
		ok &&= passed;
		console.log(`${passed ? 'ok' : 'miss'} explore:${scope.key} path=${path || 'none'} timing=${timing || 'none'}`);
	}
	if (!ok) throw new Error('One or more explore stats cache entries are missing or not being used.');
}

function writeChunkedSql(key: string, value: string) {
	const chunks: string[] = [];
	for (let i = 0; i < value.length; i += CHUNK_SIZE) chunks.push(value.slice(i, i + CHUNK_SIZE));
	const lines = [
		'CREATE TABLE IF NOT EXISTS stats (key TEXT PRIMARY KEY, value TEXT NOT NULL);',
		`INSERT OR REPLACE INTO stats (key,value) VALUES ('explore:${key}','');`,
		...chunks.map((chunk) => `UPDATE stats SET value = value || '${sqlEsc(chunk)}' WHERE key='explore:${key}';`)
	];
	const file = join(OUT_DIR, `explore-${key}.sql`);
	writeFileSync(file, `${lines.join('\n')}\n`);
	return file;
}

function applySql(file: string) {
	const result = spawnSync('bunx', ['wrangler', 'd1', 'execute', DB, '--remote', '--file', file], {
		cwd: ROOT,
		stdio: 'inherit'
	});
	if (result.status !== 0) throw new Error(`Failed to apply ${file}`);
}

if (VERIFY_ONLY) {
	await verifyCache();
	process.exit(0);
}

rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });

for (const scope of scopes) {
	const response = await fetch(apiUrl(scope, true));
	if (!response.ok) throw new Error(`${apiUrl(scope, true)} -> ${response.status}`);
	const body = (await response.json()) as { total?: number; rows?: unknown[] };
	const value = JSON.stringify({ total: body.total ?? 0, rows: body.rows ?? [] });
	const file = writeChunkedSql(scope.key, value);
	console.log(
		`built explore:${scope.key} total=${body.total ?? 0} rows=${body.rows?.length ?? 0} bytes=${value.length} livePath=${response.headers.get('x-biovault-query-path') ?? ''} timing=${response.headers.get('server-timing') ?? ''}`
	);
	if (APPLY) applySql(file);
}

if (APPLY) await verifyCache();
else console.log(`wrote ${OUT_DIR.replace(`${ROOT}/`, '')}. Re-run with --apply to write remote D1.`);
