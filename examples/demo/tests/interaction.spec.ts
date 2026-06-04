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

  // Move the pointer off the canvas so hover clears: whatever remains on the
  // overlay is the *selection* highlight, drawn without a base redraw (§4).
  await page.mouse.move(box.x + box.width - 2, box.y + 2);
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

test('vertical wheel scrolls the tall dataset (scrollY increases)', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('timeline-root')).toBeVisible();
  await page.getByTestId('toggle-dataset').click(); // 200-row synthetic set

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
