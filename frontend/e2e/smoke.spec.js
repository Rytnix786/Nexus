import { expect, test } from '@playwright/test';

test('loads mission control shell', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Nexus Core')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Launch Run' })).toBeVisible();
  await expect(page.getByText('Run History')).toBeVisible();

  await page.getByRole('button', { name: 'History' }).click();
  await expect(page.getByText('Run Explorer')).toBeVisible();

  await page.getByRole('button', { name: 'Models' }).click();
  await expect(page.getByText('Language Models')).toBeVisible();

  await page.getByRole('button', { name: 'Library' }).click();
  await expect(page.getByText('Knowledge Library')).toBeVisible();
});
