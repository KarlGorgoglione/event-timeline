import { expect, test } from '@playwright/test';

// WebGL backend smoke (§4, §16). Pixel-level look parity is asserted by the
// golden spec (the WebGL render is compared against the Canvas2D baseline);
// this spec covers the paths goldens can't: a large dataset rendering and
// zooming without errors, and the renderer select round-trip — switching
// backends must remount the canvases, since a canvas is permanently bound to
// its first context type.

test('WebGL renders 10k events, zooms, and switches backends cleanly', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });

  await page.goto('/?renderer=webgl');
  await expect(page.getByTestId('timeline-root')).toBeVisible();
  const status = page.getByTestId('status-renderer');
  await expect(status).not.toHaveText('renderer: —');
  test.skip(
    (await status.textContent()) !== 'renderer: webgl',
    'WebGL2 unavailable in this environment',
  );

  // Large dataset + a zoom interaction exercise the full draw path (clusters,
  // labels, LOD transitions) on the WebGL backend.
  await page
    .getByLabel('Dataset', { exact: true })
    .selectOption('synthetic10k');
  await page.getByRole('button', { name: 'Fit' }).click();
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

  // Backend round-trip: the React binding mounts fresh canvases per renderer
  // preference, so 2D after WebGL (and back) must both come up live.
  await page.getByLabel('Renderer').selectOption('canvas2d');
  await expect(status).toHaveText('renderer: canvas2d');
  await page.getByLabel('Renderer').selectOption('webgl');
  await expect(status).toHaveText('renderer: webgl');

  expect(errors).toEqual([]);
});
