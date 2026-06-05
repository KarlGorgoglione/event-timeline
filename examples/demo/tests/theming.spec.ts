import { expect, test } from '@playwright/test';

// Phase 6 acceptance (DESIGN.md §15, §11): the demo themes and renders
// data-driven colours/labels. We drive the three customisation toggles and read
// the base canvas back: the theme toggle flips the background luminance, the
// "colours" toggle introduces a data-driven (green) line that the dark default
// never draws, and every toggle re-renders without page/console errors. Exact
// formatter text is asserted in the engine unit tests (canvas text is opaque to
// the DOM); here we confirm the formatter toggle re-renders cleanly.

/** Average luminance of the base canvas and a count of clearly-green pixels. */
async function canvasStats(
  page: import('@playwright/test').Page,
): Promise<{ avgLum: number; green: number } | null> {
  return page.evaluate(() => {
    const root = document.querySelector('[data-testid="timeline-root"]');
    const canvas = root?.querySelector('canvas');
    if (!(canvas instanceof HTMLCanvasElement) || canvas.width === 0) {
      return null;
    }
    const ctx = canvas.getContext('2d');
    if (ctx === null) return null;
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let sum = 0;
    let count = 0;
    let green = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i] ?? 0;
      const g = data[i + 1] ?? 0;
      const b = data[i + 2] ?? 0;
      sum += (r + g + b) / 3;
      count += 1;
      // The data-driven palette green (#98c379, category 1 = "Bob"); absent from
      // the dark default theme, whose line/arrow/accent colours are blue/grey/
      // orange/cyan — none of which is green-dominant with a low blue channel.
      if (g > 150 && r < 180 && b < 150 && g - r > 25 && g - b > 40) green += 1;
    }
    return { avgLum: count > 0 ? sum / count : 0, green };
  });
}

test('theming + data-driven colours/labels render without errors (§11)', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  await page.goto('/');
  await expect(page.getByTestId('timeline-root')).toBeVisible();

  // First render: dark default theme → low average luminance, no reddish content.
  await expect
    .poll(async () => (await canvasStats(page))?.avgLum ?? 999, {
      timeout: 5000,
    })
    .toBeLessThan(60);
  const greenBefore = (await canvasStats(page))?.green ?? 0;

  // Theme → light: the background flips, so average luminance jumps.
  await page.getByTestId('toggle-theme').click();
  await expect
    .poll(async () => (await canvasStats(page))?.avgLum ?? 0, { timeout: 5000 })
    .toBeGreaterThan(180);

  // Back to dark for a clean data-driven-colour comparison.
  await page.getByTestId('toggle-theme').click();
  await expect
    .poll(async () => (await canvasStats(page))?.avgLum ?? 999, {
      timeout: 5000,
    })
    .toBeLessThan(60);

  // Colours on → a resolver paints at least one line a palette green.
  await page.getByTestId('toggle-resolvers').click();
  await expect
    .poll(async () => (await canvasStats(page))?.green ?? 0, { timeout: 5000 })
    .toBeGreaterThan(greenBefore);

  // Formatters on → re-renders (labels upper-cased / events prefixed); the
  // canvas must stay non-blank. Exact text is covered by the unit tests.
  await page.getByTestId('toggle-formatters').click();
  await expect
    .poll(async () => (await canvasStats(page))?.avgLum ?? 0, { timeout: 5000 })
    .toBeGreaterThan(0);

  expect(errors).toEqual([]);
});
