import { describe, expect, it } from 'vitest';
import { computeRowLayout } from './positions';
import type { RowMetrics } from '../scale/camera';

const metrics: RowMetrics = { headerHeight: 40, rowHeight: 28, rowGap: 4 };

describe('computeRowLayout', () => {
  it('assigns sequential row indices in order', () => {
    const layout = computeRowLayout(['a', 'b', 'c'], metrics);
    expect(layout.rowIndexById.get('a')).toBe(0);
    expect(layout.rowIndexById.get('b')).toBe(1);
    expect(layout.rowIndexById.get('c')).toBe(2);
    expect(layout.rowCount).toBe(3);
  });

  it('computes content height as rowCount * (rowHeight + rowGap)', () => {
    const layout = computeRowLayout(['a', 'b', 'c'], metrics);
    expect(layout.contentHeight).toBe(3 * (28 + 4));
  });

  it('handles an empty dataset', () => {
    const layout = computeRowLayout([], metrics);
    expect(layout.rowCount).toBe(0);
    expect(layout.contentHeight).toBe(0);
  });
});
