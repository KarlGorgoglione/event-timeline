import { expect, test, type Page } from '@playwright/test';

// Phase 3 acceptance (DESIGN.md §15): zoom-about-cursor, vertical scroll, hover
// highlight + tooltip, and click selection. These drive the demo through real
// pointer/wheel input and assert via the demo's status bar (text, robust) and
// the overlay canvas pixels (the selection/hover highlight actually drew).

/** Centre point of the timeline overlay canvas in client (viewport) px. */
async function overlayCentre(page: Page): Promise<{ x: number; y: number }> {
  const box = await page.getByTestId('timeline-root').boundingBox();
  if (box === null) throw new Error('timeline-root has no box');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Number rendered in a status-bar span, e.g. "pxPerMs: 0.0001" → 0.0001. */
async function statusNumber(page: Page, testId: string): Promise<number> {
  const text = (await page.getByTestId(testId).textContent()) ?? '';
  return Number(text.split(':')[1]?.trim());
}

/** Read back the timeline-root's top-left so we can hit a specific row centre. */
async function rootBox(page: Page) {
  const box = await page.getByTestId('timeline-root').boundingBox();
  if (box === null) throw new Error('timeline-root has no box');
  return box;
}

test('hovering an element line shows a tooltip and updates the status bar', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('timeline-root')).toBeVisible();

  const box = await rootBox(page);
  // Sweep across row centres until we land on an element line (lines are thin).
  // Default theme: header 44, row 28, gap 6 → row r centre = 44 + r*34 + 14.
  const x = box.x + box.width * 0.5;
  let hit = false;
  for (let r = 0; r < 4 && !hit; r++) {
    const y = box.y + 44 + r * 34 + 14;
    await page.mouse.move(x, y);
    hit = await page
      .getByTestId('timeline-tooltip')
      .isVisible()
      .catch(() => false);
  }

  await expect(page.getByTestId('timeline-tooltip')).toBeVisible();
  await expect(page.getByTestId('status-hover')).not.toHaveText('hover: —');
});

test('clicking a primitive selects it (status + overlay highlight)', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('timeline-root')).toBeVisible();

  const box = await rootBox(page);
  const x = box.x + box.width * 0.5;
  // Click each row centre until the selection status changes.
  for (let r = 0; r < 4; r++) {
    const y = box.y + 44 + r * 34 + 14;
    await page.mouse.move(x, y);
    await page.mouse.click(x, y);
    const text = await page.getByTestId('status-selected').textContent();
    if (text && !text.includes('—')) break;
  }

  await expect(page.getByTestId('status-selected')).not.toHaveText(
    'selected: —',
  );

  // Move the pointer to an empty patch of canvas so hover clears: whatever
  // remains on the overlay is the *selection* highlight, drawn without a base
  // redraw (§4). Bottom-left is below the element rows and clear of the panel.
  await page.mouse.move(box.x + 2, box.y + box.height - 2);
  await expect(page.getByTestId('status-hover')).toHaveText('hover: —');

  // The overlay canvas (topmost) still has the selection highlight: non-blank.
  const overlayHasPixels = await page.evaluate(() => {
    const root = document.querySelector('[data-testid="timeline-root"]');
    const canvases = root?.querySelectorAll('canvas');
    const overlay = canvases?.[1];
    if (!(overlay instanceof HTMLCanvasElement)) return false;
    const ctx = overlay.getContext('2d');
    if (ctx === null) return false;
    const { data } = ctx.getImageData(0, 0, overlay.width, overlay.height);
    for (let i = 3; i < data.length; i += 4) {
      if ((data[i] ?? 0) !== 0) return true; // any non-transparent pixel
    }
    return false;
  });
  expect(overlayHasPixels).toBe(true);
});

test('ctrl+wheel zooms about the cursor (pxPerMs increases)', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('timeline-root')).toBeVisible();
  // Wait for the first viewport emission (auto-fit).
  await expect
    .poll(() => statusNumber(page, 'status-pxperms'))
    .toBeGreaterThan(0);

  const before = await statusNumber(page, 'status-pxperms');
  const { x, y } = await overlayCentre(page);

  // Dispatch a real ctrl+wheel on the overlay canvas (zoom-in: deltaY < 0).
  await page.evaluate(
    ({ x, y }) => {
      const root = document.querySelector('[data-testid="timeline-root"]');
      const overlay = root?.querySelectorAll('canvas')[1];
      overlay?.dispatchEvent(
        new WheelEvent('wheel', {
          deltaY: -400,
          ctrlKey: true,
          clientX: x,
          clientY: y,
          bubbles: true,
          cancelable: true,
        }),
      );
    },
    { x, y },
  );

  await expect
    .poll(() => statusNumber(page, 'status-pxperms'))
    .toBeGreaterThan(before);
});

/** Cheap hash of the base canvas, used to detect when a rebuild has repainted. */
async function baseCanvasHash(page: Page): Promise<number> {
  return page.evaluate(() => {
    const root = document.querySelector('[data-testid="timeline-root"]');
    const canvas = root?.querySelector('canvas'); // first canvas = base layer
    if (!(canvas instanceof HTMLCanvasElement) || canvas.width === 0) return -1;
    const ctx = canvas.getContext('2d');
    if (ctx === null) return -1;
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let hash = 0;
    for (let i = 0; i < data.length; i += 64)
      hash = (hash + (data[i] ?? 0)) | 0;
    return hash;
  });
}

test('editing a panel parameter preserves pan/zoom (no camera reset, §12)', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('timeline-root')).toBeVisible();
  // Tall dataset so vertical scroll has somewhere to go.
  await page.getByLabel('Dataset').selectOption('synthetic10k');
  await expect
    .poll(() => statusNumber(page, 'status-pxperms'))
    .toBeGreaterThan(0);

  const fitPx = await statusNumber(page, 'status-pxperms');
  const { x, y } = await overlayCentre(page);

  // Move the camera off its fit: ctrl+wheel zooms in 4× (deltaY -400), then a
  // plain wheel scrolls the rows down.
  await page.evaluate(
    ({ x, y }) => {
      const root = document.querySelector('[data-testid="timeline-root"]');
      const overlay = root?.querySelectorAll('canvas')[1];
      const at = (init: WheelEventInit) =>
        overlay?.dispatchEvent(
          new WheelEvent('wheel', {
            clientX: x,
            clientY: y,
            bubbles: true,
            cancelable: true,
            ...init,
          }),
        );
      at({ deltaY: -400, ctrlKey: true });
      at({ deltaY: 600 });
    },
    { x, y },
  );

  await expect
    .poll(() => statusNumber(page, 'status-pxperms'))
    .toBeGreaterThan(fitPx * 2);
  await expect
    .poll(() => statusNumber(page, 'status-scrolly'))
    .toBeGreaterThan(0);
  const pxBefore = await statusNumber(page, 'status-pxperms');
  const scrollBefore = await statusNumber(page, 'status-scrolly');

  // Edit a theme parameter (row separators). The React binding rebuilds the
  // engine on a theme-reference change; the new engine must restore the prior
  // view instead of snapping back to fit (DESIGN.md §12).
  const hashBefore = await baseCanvasHash(page);
  await page.getByText('Rows & layout').click();
  await page.getByRole('switch', { name: 'Row separators' }).click();
  // Wait until the rebuilt engine has repainted (separators now drawn) — at
  // which point the restored camera is the engine's final state for this frame.
  await expect.poll(() => baseCanvasHash(page)).not.toBe(hashBefore);

  const pxAfter = await statusNumber(page, 'status-pxperms');
  const scrollAfter = await statusNumber(page, 'status-scrolly');
  // A reset would drop pxPerMs back to ~fitPx and scrollY to 0; preservation
  // keeps both within rounding of their pre-edit values.
  expect(pxAfter).toBeGreaterThan(fitPx * 2);
  expect(Math.abs(pxAfter - pxBefore) / pxBefore).toBeLessThan(0.02);
  expect(scrollAfter).toBeGreaterThan(0);
  expect(Math.abs(scrollAfter - scrollBefore)).toBeLessThan(1);
});

test('vertical wheel scrolls the tall dataset (scrollY increases)', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('timeline-root')).toBeVisible();
  // 200-row synthetic set, selected via the panel's dataset selector.
  await page.getByLabel('Dataset').selectOption('synthetic10k');

  const { x, y } = await overlayCentre(page);
  await page.evaluate(
    ({ x, y }) => {
      const root = document.querySelector('[data-testid="timeline-root"]');
      const overlay = root?.querySelectorAll('canvas')[1];
      overlay?.dispatchEvent(
        new WheelEvent('wheel', {
          deltaY: 600,
          clientX: x,
          clientY: y,
          bubbles: true,
          cancelable: true,
        }),
      );
    },
    { x, y },
  );

  await expect
    .poll(() => statusNumber(page, 'status-scrolly'))
    .toBeGreaterThan(0);
});
