import { describe, expect, it } from 'vitest';
import { defaultTheme, resolveTheme } from '../engine/theme';
import { computeRowLayout } from '../layout/positions';
import type { Theme } from '../model/types';
import { Camera, type RowMetrics, type Viewport } from '../scale/camera';
import { bySourceTargetColumn } from '../cluster/strategies';
import { overlayStyle } from './resolveStyle';
import { buildRowSeparators } from './separators';
import type { BuildContext, DataAccess, RowBand } from './specs';

const metrics: RowMetrics = {
  headerHeight: defaultTheme.headerHeight,
  rowHeight: defaultTheme.rowHeight,
  rowGap: defaultTheme.rowGap,
};
const viewport: Viewport = { cssWidth: 800, cssHeight: 400 };
const rowIds = ['a', 'b', 'c'];

function ctxFor(theme: Theme, band: RowBand): BuildContext {
  const data: DataAccess = {
    getEvents: () => [],
    getEventsInRange: () => [],
    getElements: () => [],
    getElementById: () => undefined,
    getExtent: () => undefined,
  };
  return {
    camera: new Camera(metrics, { originTime: 0, pxPerMs: 1, scrollY: 0 }),
    rowLayout: computeRowLayout(rowIds, metrics),
    data,
    viewport,
    theme,
    band,
    resolveIcon: () => ({ kind: 'none' }),
    lod: { eventLabelMinPxPerMs: 0 },
    clustering: {
      enabled: false,
      strategy: bySourceTargetColumn,
      minSeparationPx: 12,
    },
    resolveElementStyle: (element) =>
      overlayStyle(theme.element, undefined, element.style),
    resolveEventStyle: (event) =>
      overlayStyle(theme.event, undefined, event.style),
    formatElementLabel: (element) => element.label ?? element.id,
    formatEventLabel: (event) => event.label,
    eventLabel: { placement: 'midpoint' },
    measureText: (text) => ({ width: text.length * 6 }),
  };
}

const fullBand: RowBand = { firstRow: 0, lastRow: 2 };

describe('buildRowSeparators (§11)', () => {
  it('emits nothing when separators are disabled (the default)', () => {
    expect(buildRowSeparators(ctxFor(defaultTheme, fullBand))).toEqual([]);
  });

  it('emits one horizontal line per visible row, carrying the separator style', () => {
    const theme = resolveTheme({
      rowSeparator: { enabled: true, color: '#abc', width: 2, dash: [4, 2] },
    });
    const specs = buildRowSeparators(ctxFor(theme, fullBand));
    expect(specs).toHaveLength(1);
    const spec = specs[0]!;
    expect(spec.color).toBe('#abc');
    expect(spec.width).toBe(2);
    expect(spec.dash).toEqual([4, 2]);
    expect(spec.segments).toHaveLength(rowIds.length);
  });

  it('derives Y from the camera only (§3) and spans the full viewport width', () => {
    const theme = resolveTheme({
      rowSeparator: { enabled: true, color: '#abc', width: 1, dash: [] },
    });
    const ctx = ctxFor(theme, fullBand);
    const spec = buildRowSeparators(ctx)[0]!;
    const seg = spec.segments[0]!;
    // Bottom edge of row 0: rowToScreenY(0) + rowHeight + rowGap/2.
    const expectedY =
      ctx.camera.rowToScreenY(0) + theme.rowHeight + theme.rowGap / 2;
    expect(seg.y1).toBeCloseTo(expectedY);
    expect(seg.y2).toBeCloseTo(expectedY);
    expect(seg.x1).toBe(0);
    expect(seg.x2).toBe(viewport.cssWidth);
  });

  it('only emits separators for rows inside the visible band', () => {
    const theme = resolveTheme({
      rowSeparator: { enabled: true, color: '#abc', width: 1, dash: [] },
    });
    const specs = buildRowSeparators(
      ctxFor(theme, { firstRow: 1, lastRow: 1 }),
    );
    expect(specs[0]!.segments).toHaveLength(1);
  });
});
