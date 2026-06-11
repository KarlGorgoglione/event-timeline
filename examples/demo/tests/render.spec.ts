import { expect, test } from '@playwright/test';

// Phase 2 acceptance (DESIGN.md §15): 10k synthetic events render correctly and
// culled. The lightest meaningful signal: the demo mounts the 10k dataset with
// no page/console errors (culling keeps it from hanging) and the base canvas has
// drawn non-background pixels in the content band (arrows/lines actually drew).

test('renders 10k events with no errors and a non-blank canvas', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  await page.goto('/?renderer=canvas2d');
  await expect(page.getByTestId('timeline-root')).toBeVisible();
  // Swap in the 10k dataset via the panel's dataset selector.
  await page.getByLabel('Dataset').selectOption('synthetic10k');

  // Poll the base canvas until content (anything not the #161b22 background)
  // appears in the central content band, below the header.
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const root = document.querySelector('[data-testid="timeline-root"]');
          const canvas = root?.querySelector('canvas');
          if (!(canvas instanceof HTMLCanvasElement) || canvas.width === 0) {
            return false;
          }
          const ctx = canvas.getContext('2d');
          if (ctx === null) return false;
          const y = Math.floor(canvas.height * 0.3);
          const h = Math.max(1, Math.floor(canvas.height * 0.4));
          const data = ctx.getImageData(0, y, canvas.width, h).data;
          for (let i = 0; i < data.length; i += 4) {
            const r = data[i] ?? 0;
            const g = data[i + 1] ?? 0;
            const b = data[i + 2] ?? 0;
            // Background is #161b22 = rgb(22, 27, 34).
            if (
              Math.abs(r - 22) > 8 ||
              Math.abs(g - 27) > 8 ||
              Math.abs(b - 34) > 8
            ) {
              return true;
            }
          }
          return false;
        }),
      { timeout: 5000 },
    )
    .toBe(true);

  expect(errors).toEqual([]);
});
