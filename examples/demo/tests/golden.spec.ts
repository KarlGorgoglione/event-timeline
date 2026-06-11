import { expect, test } from '@playwright/test';

// Golden / visual tests (DESIGN.md §14). Render deterministic seeded datasets to
// the canvas at DPR 1 and screenshot-compare against committed baselines. Uses
// the small hand-built fixture and the AML scenario (both stable, seeded) rather
// than the 50k set, whose sub-pixel anti-aliasing makes exact compares brittle —
// scale is covered by the perf spec instead. `toHaveScreenshot` auto-retries
// until the canvas is stable, so it absorbs the engine's rAF-driven first paint.

const SNAPSHOT_OPTIONS = { maxDiffPixelRatio: 0.01 } as const;

// Baselines were captured on the Canvas2D backend; pin it explicitly (the
// engine default is 'auto', which picks WebGL when available — §4).
test.describe('golden renders (§14)', () => {
  test('default fixture, fitted', async ({ page }) => {
    await page.goto('/?renderer=canvas2d');
    await expect(page.getByTestId('timeline-root')).toBeVisible();
    await page.getByRole('button', { name: 'Fit' }).click();
    // Collapse the panel so it doesn't overlay the canvas in the screenshot.
    await page
      .getByRole('button', { name: 'Collapse customization panel' })
      .click();

    await expect(page.getByTestId('timeline-root')).toHaveScreenshot(
      'fixture-fit.png',
      SNAPSHOT_OPTIONS,
    );
  });

  test('AML scenario with data-driven colours', async ({ page }) => {
    await page.goto('/?renderer=canvas2d');
    await expect(page.getByTestId('timeline-root')).toBeVisible();
    await page.getByLabel('Dataset').selectOption('aml');
    // Colour by pattern via the data-driven resolvers toggle (in "Data hooks").
    await page.getByText('Data hooks').click();
    await page.getByRole('switch', { name: 'Data-driven colours' }).click();
    await page.getByRole('button', { name: 'Fit' }).click();
    await page
      .getByRole('button', { name: 'Collapse customization panel' })
      .click();

    await expect(page.getByTestId('timeline-root')).toHaveScreenshot(
      'aml-colours.png',
      SNAPSHOT_OPTIONS,
    );
  });

  // Look parity (§4): the WebGL backend must reproduce the Canvas2D baseline.
  // Geometry and colours are shared math, so only anti-aliasing/text rasters
  // may differ — hence the looser ratio against the SAME baseline file. If AA
  // drift ever makes this flaky, switch to a dedicated -webgl baseline.
  test('WebGL backend matches the Canvas2D fixture baseline', async ({
    page,
  }) => {
    await page.goto('/?renderer=webgl');
    await expect(page.getByTestId('timeline-root')).toBeVisible();
    // The footer reports the backend once the engine is ready.
    const status = page.getByTestId('status-renderer');
    await expect(status).not.toHaveText('renderer: —');
    test.skip(
      (await status.textContent()) !== 'renderer: webgl',
      'WebGL2 unavailable in this environment',
    );
    await page.getByRole('button', { name: 'Fit' }).click();
    await page
      .getByRole('button', { name: 'Collapse customization panel' })
      .click();

    await expect(page.getByTestId('timeline-root')).toHaveScreenshot(
      'fixture-fit.png',
      { maxDiffPixelRatio: 0.05 },
    );
  });
});
