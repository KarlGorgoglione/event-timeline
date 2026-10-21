import { expect, test } from '@playwright/test';
import { openFixture } from './fixturePage';

// Scale (DESIGN.md §5, §6): 50k events stay interactive, with dense
// events collapsed into clusters at zoom-out. The robust browser-level signal:
// the 50k dataset mounts with no page/console errors (the binary-search temporal
// index + clustering keep the frame bounded), and the base canvas contains the
// cluster-marker colour (#d29922) — present only when collapsing actually fires —
// proving clusters render at the fitted zoom-out, not just ordinary arrows.

test('renders 50k events with clusters and no errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  await openFixture(page, { dataset: 'synthetic50k' });

  // The cluster marker colour (#d29922 = rgb(210,153,34)) appears in the content
  // band only when dense events collapse — a deterministic render signal.
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
          const y = Math.floor(canvas.height * 0.15);
          const h = Math.max(1, Math.floor(canvas.height * 0.7));
          const data = ctx.getImageData(0, y, canvas.width, h).data;
          for (let i = 0; i < data.length; i += 4) {
            const r = data[i] ?? 0;
            const g = data[i + 1] ?? 0;
            const b = data[i + 2] ?? 0;
            if (
              Math.abs(r - 210) < 24 &&
              Math.abs(g - 153) < 24 &&
              Math.abs(b - 34) < 24
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
