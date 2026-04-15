import { expect, test } from '@playwright/test';

test('loads mission control shell', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Mission Control For Stateful Multi-Agent Operations')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Timeline' }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Graph' }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Artifacts' }).first()).toBeVisible();
});
