import { expect, test } from '@playwright/test';

test('loads mission control shell', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Nexus Core')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Launch Run' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Run History/i })).toBeVisible();

  await page.getByRole('button', { name: 'History' }).first().click();
  await expect(page.getByText('Run Explorer')).toBeVisible();

  await page.getByRole('button', { name: 'Models' }).first().click();
  await expect(page.getByText('Language Models')).toBeVisible();

  await page.getByRole('button', { name: 'Library' }).first().click();
  await expect(page.getByText('Knowledge Library')).toBeVisible();
});
