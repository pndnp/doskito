import { expect, test } from '@playwright/test';

test('application renders', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Doskito' })).toBeVisible();
});
