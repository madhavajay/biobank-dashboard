import { expect, test } from '@playwright/test';

test.describe('BIPMed explorer locked layout', () => {
	test('keeps the approved BIPMed table contract', async ({ page }) => {
		await page.goto('/explore?tenant=bipmed&gene=BRCA1');

		const table = page.locator('main table');
		const firstRow = table.locator('tbody tr').first();
		await expect(firstRow).toBeVisible({ timeout: 30_000 });

		await expect(table.locator('thead')).toContainText('Variant');
		await expect(table.locator('thead')).toContainText('rsID');
		await expect(table.locator('thead')).toContainText('Gene');
		await expect(table.locator('thead')).toContainText('Freq');
		await expect(table.locator('thead')).toContainText('AC');
		await expect(table.locator('thead')).toContainText('AN');
		await expect(table.locator('thead')).toContainText('VRS');
		await expect(table.locator('thead')).not.toContainText('gnomAD');

		await expect(table.locator('thead')).not.toContainText('HET');
		await expect(table.locator('thead')).not.toContainText('HOM_ALT');
		await expect(table.locator('thead')).not.toContainText('HOM_REF');
		await expect(table.locator('thead')).not.toContainText('Max AF');

		await expect(firstRow.locator('td').first().locator('svg')).toBeVisible();
		await expect(firstRow.locator('img[alt="gnomAD"]')).toHaveCount(0);
		const variantHref = await firstRow.locator('td').first().locator('a').getAttribute('href');
		expect(variantHref).toMatch(/^\/explore\/variant\/chr[0-9XYMT]+-\d+-[ACGT]+-[ACGT]+\?tenant=bipmed$/);

		const metrics = await firstRow.evaluate((row) => {
			const tableEl = row.closest('table');
			const firstCell = row.querySelector('td:first-child');
			const icon = firstCell?.querySelector('svg');
			const coord = firstCell?.querySelector('span.font-semibold');
			if (!tableEl || !icon || !coord) return null;
			const tableRect = tableEl.getBoundingClientRect();
			const iconRect = icon.getBoundingClientRect();
			const coordRect = coord.getBoundingClientRect();
			return {
				iconInsideTableBy: iconRect.left - tableRect.left,
				iconTextGap: coordRect.left - iconRect.right
			};
		});

		expect(metrics).not.toBeNull();
		expect(metrics!.iconInsideTableBy).toBeGreaterThanOrEqual(6);
		expect(metrics!.iconTextGap).toBeGreaterThanOrEqual(4);
	});

	test('uses stable public variant URLs for coordinate and rsID visits', async ({ page }) => {
		await page.goto('/explore/variant/chr17-43045257-C-A?tenant=bipmed');
		await expect(page.getByRole('heading', { name: 'chr17-43045257-C-A' })).toBeVisible();
		await expect(page.getByText('Variant detail · GRCh38 · rs8176318')).toBeVisible();
		await expect(page.getByText('BRCA1, RND2')).toBeVisible();
		await expect(page.getByText('Local average')).toHaveCount(0);
		await expect(page.getByRole('link', { name: 'API JSON' })).toHaveAttribute(
			'href',
			'/api/variants/chr17-43045257-C-A?tenant=bipmed'
		);

		await page.goto('/explore/variant/rs8176318?tenant=bipmed');
		await expect(page.getByRole('heading', { name: 'chr17-43045257-C-A' })).toBeVisible();
	});
});

test.describe('Non-BIPMed explorer defaults', () => {
	for (const [name, path] of [
		['global', '/explore?gene=BRCA1'],
		['CariGenetics', '/explore?tenant=carigenetics&gene=G6PD'],
		['PGP Harvard', '/explore?tenant=pgp-harvard&gene=BRCA1']
	] as const) {
		test(`${name} hides the VRS table column`, async ({ page }) => {
			await page.goto(path);
			const table = page.locator('main table');
			await expect(table.locator('tbody tr').first()).toBeVisible({ timeout: 20_000 });
			await expect(table.locator('thead')).not.toContainText('VRS');
			await expect(table.locator('thead')).not.toContainText('Max AF');
		});
	}

	test('CariGenetics can require selected islands to all match', async ({ page }) => {
		await page.goto('/explore?tenant=carigenetics&gene=G6PD');
		const cohortAll = page.locator('input[name="cohort-match"][value="all"]');
		await expect(cohortAll).toBeEnabled();
		await cohortAll.check();
		await expect(page).toHaveURL(/cohortMatch=all/);
		await expect(page.locator('main table tbody tr').first()).toBeVisible({ timeout: 20_000 });
	});

	test('CariGenetics population dropdown closes on outside click without duplicate all controls', async ({ page }) => {
		await page.goto('/explore?tenant=carigenetics&gene=G6PD');
		const menu = page.locator('details[data-explorer-filter-menu="populations"]');
		await expect(menu).toBeVisible();
		await menu.locator('summary').click();
		await expect(menu).toHaveAttribute('open', '');
		await expect(menu.getByRole('button', { name: 'All' })).toHaveCount(1);
		await expect(menu.getByRole('button', { name: 'None' })).toHaveCount(1);

		await page.getByRole('heading', { name: 'Explore' }).click();
		await expect(menu).not.toHaveAttribute('open', '');
	});
});

test.describe('Multi-population variant detail', () => {
	test('adds per-biobank average rows outside BIPMed', async ({ page }) => {
		await page.goto('/explore/variant/chrX-154526613-G-T?tenant=carigenetics');
		await expect(page.getByRole('heading', { name: 'chrX-154526613-G-T' })).toBeVisible();

		const populationSection = page.locator('section').filter({ hasText: 'Population Frequencies' });
		const ethnicitySection = page.locator('section').filter({ hasText: 'gnomAD Ethnicity Frequencies' });
		await expect(page.getByText('Local average')).toHaveCount(0);
		await expect(populationSection.getByText('carigenetics average')).toBeVisible();
		await expect(ethnicitySection.getByText('carigenetics average')).toBeVisible();
		await expect(ethnicitySection.getByText('Closest to carigenetics')).toBeVisible();
	});
});
