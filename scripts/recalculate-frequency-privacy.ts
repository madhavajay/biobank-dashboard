// Recalculate public/masked frequency columns after changing
// ALLELE_COUNT_REPORTING_THRESHOLD in src/lib/privacy.ts.
//
// Usage:
//   bun scripts/recalculate-frequency-privacy.ts --local
//   bun scripts/recalculate-frequency-privacy.ts --remote

import { writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { ALLELE_COUNT_REPORTING_THRESHOLD, publicFrequencySql } from '../src/lib/privacy';

const ROOT = join(import.meta.dir, '..');
const mode = process.argv.includes('--remote') ? '--remote' : '--local';
const file = join(ROOT, 'data', `recalculate-frequency-privacy-${ALLELE_COUNT_REPORTING_THRESHOLD}.sql`);

writeFileSync(file, `UPDATE frequencies SET ${publicFrequencySql(ALLELE_COUNT_REPORTING_THRESHOLD)};\n`);
try {
	execFileSync('bunx', ['wrangler', 'd1', 'execute', 'DB', mode, '--file', file], {
		cwd: ROOT,
		stdio: 'inherit'
	});
} finally {
	rmSync(file, { force: true });
}
