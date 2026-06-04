// Map an ordered id list to row indices and report content height (DESIGN.md §7).
//
// This is the "engine maps order to row indices and y" step kept out of the
// strategy. Screen-Y for a row comes from Camera.rowToScreenY — never
// re-derived here — preserving the single source of coordinate truth (§3).

import type { RowMetrics } from '../scale/camera';

export interface RowLayout {
  orderedIds: string[];
  rowIndexById: Map<string, number>;
  rowCount: number;
  /** Total stacked height of all rows in CSS px. */
  contentHeight: number;
}

export function computeRowLayout(
  orderedIds: string[],
  metrics: RowMetrics,
): RowLayout {
  const rowIndexById = new Map<string, number>();
  orderedIds.forEach((id, index) => rowIndexById.set(id, index));
  const rowCount = orderedIds.length;
  return {
    orderedIds,
    rowIndexById,
    rowCount,
    contentHeight: rowCount * (metrics.rowHeight + metrics.rowGap),
  };
}
