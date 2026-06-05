import { expect, test } from '@playwright/test';

// Golden / visual tests (DESIGN.md §14). Render deterministic seeded datasets to
// the canvas at DPR 1 and screenshot-compare against committed baselines. Uses
// the small hand-built fixture and the AML scenario (both stable, seeded) rather
// than the 50k set, whose sub-pixel anti-aliasing makes exact compares brittle —
// scale is covered by the perf spec instead. `toHaveScreenshot` auto-retries
// until the canvas is stable, so it absorbs the engine's rAF-driven first paint.

const SNAPSHOT_OPTIONS = { maxDiffPixelRatio: 0.01 } as const;

test.describe('golden renders (§14)', () => {
  test('default fixture, fitted', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('timeline-root')).toBeVisible();
    await page.getByRole('button', { name: 'Fit' }).click();

    await expect(page.getByTestId('timeline-root')).toHaveScreenshot(
      'fixture-fit.png',
      SNAPSHOT_OPTIONS,
    );
  });

  test('AML scenario with data-driven colours', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('timeline-root')).toBeVisible();
    await page.getByTestId('toggle-aml').click();
    await page.getByTestId('toggle-resolvers').click(); // colour by pattern
    await page.getByRole('button', { name: 'Fit' }).click();

    await expect(page.getByTestId('timeline-root')).toHaveScreenshot(
      'aml-colours.png',
      SNAPSHOT_OPTIONS,
    );
  });
});
