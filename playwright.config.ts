import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.TEST_PORT ?? 8787);
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
	testDir: './tests',
	timeout: 30_000,
	expect: { timeout: 10_000 },
	fullyParallel: false,
	workers: 1,
	retries: 0,
	reporter: 'list',
	use: {
		baseURL,
		trace: 'retain-on-failure'
	},
	projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
	webServer: {
		command: `wrangler dev --port ${PORT}`,
		url: baseURL,
		timeout: 120_000,
		reuseExistingServer: true,
		stdout: 'ignore',
		stderr: 'pipe'
	}
});
