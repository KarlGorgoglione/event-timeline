import { expect, test } from '@playwright/test';

test('empty Timeline mounts in the demo', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('timeline-root')).toBeVisible();
});
