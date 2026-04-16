import { test, expect } from '@playwright/test';

test.describe('BIPMed biobank smoke', () => {
	test('home page renders with navigation', async ({ page }) => {
		await page.goto('/');
		await expect(page).toHaveTitle(/.+/);
		await expect(page.getByRole('link', { name: /browse/i }).first()).toBeVisible();
		await expect(page.getByRole('link', { name: /home/i }).first()).toBeVisible();
	});

	test('explorer page loads and renders result rows', async ({ page }) => {
		await page.goto('/explorer');
		const firstRow = page.locator('table tbody tr').first();
		await expect(firstRow).toBeVisible({ timeout: 20_000 });
		await expect(page.getByText(/loading results/i)).toHaveCount(0);
		await expect(firstRow.locator('a[href^="/variant/"]')).toBeVisible();
	});

	test('explorer search submits and returns rows', async ({ page }) => {
		await page.goto('/explorer');
		await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 20_000 });
		const form = page.locator('form[method="GET"]').first();
		await form.locator('input[name="q"]').fill('chr1');
		await form.getByRole('button', { name: /^search$/i }).click();
		await expect(page).toHaveURL(/[?&]q=chr1/);
		await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 20_000 });
	});

	test('variant detail page opens from explorer', async ({ page }) => {
		await page.goto('/explorer');
		const firstVariant = page.locator('table tbody tr a[href^="/variant/"]').first();
		await expect(firstVariant).toBeVisible({ timeout: 20_000 });
		const href = await firstVariant.getAttribute('href');
		expect(href).toBeTruthy();
		await firstVariant.click();
		await page.waitForURL(new RegExp(href!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
		await expect(page.locator('h1, h2').first()).toBeVisible();
	});
});
