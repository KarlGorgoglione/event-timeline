import { expect, test } from '@playwright/test';
import { openFixture } from './fixturePage';

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
    await openFixture(page);

    await expect(page.getByTestId('timeline-root')).toHaveScreenshot(
      'fixture-fit.png',
      SNAPSHOT_OPTIONS,
    );
  });

  test('AML scenario with data-driven colours', async ({ page }) => {
    await openFixture(page, { dataset: 'aml' });
    // Colour by pattern via the data-driven resolvers.
    await page.evaluate(() => window.__e2e!.setDataHooks({ colours: true }));

    await expect(page.getByTestId('timeline-root')).toHaveScreenshot(
      'aml-colours.png',
      SNAPSHOT_OPTIONS,
    );
  });

  // Look parity (§4, W-06): the WebGL backend must reproduce the Canvas2D
  // baseline under the same 1% budget. Geometry, dash phase, joins and text
  // rasterization are shared with Canvas2D, so only edge anti-aliasing differs
  // (measured ≈0.1% of pixels on this fixture).
  test('WebGL backend matches the Canvas2D fixture baseline', async ({
    page,
  }) => {
    await openFixture(page, { renderer: 'webgl' });
    // The footer reports the backend once the engine is ready.
    const status = page.getByTestId('status-renderer');
    await expect(status).not.toHaveText('renderer: —');
    test.skip(
      (await status.textContent()) !== 'renderer: webgl',
      'WebGL2 unavailable in this environment',
    );

    await expect(page.getByTestId('timeline-root')).toHaveScreenshot(
      'fixture-fit.png',
      SNAPSHOT_OPTIONS,
    );
  });
});
