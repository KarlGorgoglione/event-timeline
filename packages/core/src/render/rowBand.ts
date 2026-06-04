// The visible row band for vertical culling (DESIGN.md §5, §16).
//
// Phase 1 culled element rows by line-centre Y, which dropped rows whose centre
// had just scrolled under the header or below the viewport even though part of
// the row was still visible (§16 note). This computes an inclusive row interval
// padded by one row each side, so partially-visible edge rows are retained and
// arrows whose endpoints straddle the band are kept (§5 row-interval test).

import type { Camera, Viewport } from '../scale/camera';
import type { RowBand } from './specs';

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
