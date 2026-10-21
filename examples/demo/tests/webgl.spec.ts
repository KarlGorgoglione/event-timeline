import { expect, test } from '@playwright/test';
import { openFixture } from './fixturePage';

// WebGL backend smoke (§4). Pixel-level look parity is asserted by the
// golden spec (the WebGL render is compared against the Canvas2D baseline);
// this spec covers the paths goldens can't: a large dataset rendering and
// zooming without errors, and the backend round-trip — switching backends
// must start on a fresh canvas, since a canvas is permanently bound to its
// first context type.

test('WebGL renders 10k events, zooms, and switches backends cleanly', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });

  await openFixture(page, { renderer: 'webgl', dataset: 'synthetic10k' });
  const status = page.getByTestId('status-renderer');
  await expect(status).not.toHaveText('renderer: —');
  test.skip(
    (await status.textContent()) !== 'renderer: webgl',
    'WebGL2 unavailable in this environment',
  );

  // Large dataset + a zoom interaction exercise the full draw path (clusters,
  // labels, LOD transitions) on the WebGL backend.
  await page.evaluate(() => window.__e2e!.fit());
  const pxPerMs = page.getByTestId('status-pxperms');
  const before = await pxPerMs.textContent();
  const root = page.getByTestId('timeline-root');
  const box = await root.boundingBox();
  if (box === null) throw new Error('timeline-root has no bounding box');
  await page.mouse.move(box.x + box.width / 3, box.y + box.height / 2);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -400);
  await page.keyboard.up('Control');
  await expect(pxPerMs).not.toHaveText(before ?? '');

  // Backend round-trip: the engine starts each backend on a fresh canvas,
  // so 2D after WebGL (and back) must both come up live.
  await page.evaluate(() => window.__e2e!.setOptions({ renderer: 'canvas2d' }));
  await expect(status).toHaveText('renderer: canvas2d');
  await page.evaluate(() => window.__e2e!.setOptions({ renderer: 'webgl' }));
  await expect(status).toHaveText('renderer: webgl');

  expect(errors).toEqual([]);
});
