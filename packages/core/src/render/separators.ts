// Optional row/lane separator lines (DESIGN.md §11).
//
// A "border" drawn between element rows — not a background fill. Off by default
// (theme.rowSeparator.enabled === false), so existing themes render unchanged.
// Like the other builders this is a pure function of the camera/layout/theme and
// emits CSS-px specs the engine snaps to device px.
//
// §3 single coordinate truth: every Y comes from `camera.rowToScreenY` — the
// separator at a row's bottom edge sits half the row gap below the line centre,
// never re-derived from raw row arithmetic.

import { lineBatch } from './batch';
import type { BuildContext, LineSpec } from './specs';

export function buildRowSeparators<TData>(
  ctx: BuildContext<TData>,
): LineSpec[] {
  const { theme, camera, rowLayout, viewport, band } = ctx;
  const sep = theme.rowSeparator;
  if (!sep.enabled || rowLayout.rowCount === 0) return [];

  const lines = new Map<string, LineSpec>();
  const batch = lineBatch(lines, sep.color, sep.width, sep.dash);

  // A line at the bottom edge of each visible row, centred in the row gap so it
  // sits exactly between consecutive element lines.
  const lastRow = Math.min(band.lastRow, rowLayout.rowCount - 1);
  for (let r = band.firstRow; r <= lastRow; r++) {
    const y = camera.rowToScreenY(r) + theme.rowHeight + theme.rowGap / 2;
    batch.segments.push({ x1: 0, y1: y, x2: viewport.cssWidth, y2: y });
  }

  return batch.segments.length > 0 ? [...lines.values()] : [];
}
