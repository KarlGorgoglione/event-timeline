import { expect, test, type Page } from '@playwright/test';

// The showcase page (index.html). Like the fixture specs, these drive it
// through its URL only, never its UI, so reworking the demo can't break them
// (DESIGN.md §14): each scenario and view must render without an error.

const SCENARIOS = [
  'tour',
  'aml',
  'incident',
  'logistics',
  'live',
  'scale',
  'playground',
];

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}

test('the demo mounts a Timeline', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('timeline-root')).toBeVisible();
});

for (const scenario of SCENARIOS) {
  test(`scenario "${scenario}" renders without errors`, async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto(`/?scenario=${scenario}`);
    await expect(page.getByTestId('timeline-root')).toBeVisible();
    // Heavy datasets load a frame or two after the first paint.
    await page.waitForTimeout(1500);
    expect(errors).toEqual([]);
  });
}

test('the Advanced view and a non-default theme render', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?view=advanced&theme=paper&density=compact');
  await expect(page.getByTestId('timeline-root')).toBeVisible();
  await page.waitForTimeout(500);
  expect(errors).toEqual([]);
});
