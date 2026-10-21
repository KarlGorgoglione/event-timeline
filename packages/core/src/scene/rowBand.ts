// The visible row band for vertical culling (DESIGN.md §5).
//
// An inclusive row interval padded by one row each side, so a row partly
// scrolled under the header or below the viewport is still drawn, and arrows
// whose endpoints straddle the band are kept (§5 row-interval test).

import type { Camera, Viewport } from '../scale/camera';
import type { RowBand } from './context';

/**
 * The inclusive `[firstRow, lastRow]` interval of rows that may be visible,
 * padded by one row on each side and clamped to `[0, rowCount - 1]`. Returns an
 * empty band (`firstRow > lastRow`) when there are no rows.
 */
export function visibleRowBand(
  camera: Camera,
  viewport: Viewport,
  rowCount: number,
  headerHeight: number,
): RowBand {
  if (rowCount === 0) return { firstRow: 0, lastRow: -1 };
  const top = Math.floor(camera.screenYToRow(headerHeight)) - 1;
  const bottom = Math.ceil(camera.screenYToRow(viewport.cssHeight)) + 1;
  return {
    firstRow: Math.max(0, top),
    lastRow: Math.min(rowCount - 1, bottom),
  };
}
