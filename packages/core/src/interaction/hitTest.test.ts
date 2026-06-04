import { describe, expect, it } from 'vitest';
import { defaultTheme } from '../engine/theme';
import { computeRowLayout } from '../layout/positions';
import type { Extent } from '../model/extent';
import type { TimelineElement, TimelineEvent } from '../model/types';
import { buildArrows } from '../render/arrows';
import { buildElementLines } from '../render/elementLines';
import { Camera, type RowMetrics, type Viewport } from '../scale/camera';
import type { BuildContext, DataAccess, RowBand } from '../render/specs';
import { buildHitGrid } from './hitGrid';
import { hitTest } from './hitTest';

const metrics: RowMetrics = {
  headerHeight: defaultTheme.headerHeight,
  rowHeight: defaultTheme.rowHeight,
  rowGap: defaultTheme.rowGap,
};
const viewport: Viewport = { cssWidth: 800, cssHeight: 400 };
const rowIds = ['r0', 'r1', 'r2'];
const fullBand: RowBand = { firstRow: 0, lastRow: 2 };

const rowCenter = (row: number) =>
  metrics.headerHeight +
  row * (metrics.rowHeight + metrics.rowGap) +
  metrics.rowHeight / 2;

function ctxFor(
  elements: TimelineElement[],
  events: TimelineEvent[],
  extents: Map<string, Extent>,
): BuildContext {
  const byId = new Map(elements.map((e) => [e.id, e]));
  const data: DataAccess = {
    getEvents: () => events,
    getElements: () => elements,
    getElementById: (id) => byId.get(id),
    getExtent: (id) => extents.get(id),
  };
  return {
    camera: new Camera(metrics, { originTime: 0, pxPerMs: 1, scrollY: 0 }),
    rowLayout: computeRowLayout(rowIds, metrics),
    data,
    viewport,
    theme: defaultTheme,
    band: fullBand,
    resolveIcon: () => ({ kind: 'none' }),
  };
}

const elements: TimelineElement[] = rowIds.map((id) => ({ id, label: id }));
const extents = new Map<string, Extent>([
  ['r0', { minTime: 0, maxTime: 400 }],
  ['r1', { minTime: 0, maxTime: 400 }],
  ['r2', { minTime: 0, maxTime: 400 }],
]);

function gridFor(events: TimelineEvent[]) {
  const ctx = ctxFor(elements, events, extents);
  const targets = [
    ...buildElementLines(ctx).targets,
    ...buildArrows(ctx).targets,
  ];
  return buildHitGrid(targets);
}

describe('hitTest (§5, §9)', () => {
  it('hits an event arrow on its riser', () => {
    const event: TimelineEvent = {
      id: 'ev1',
      sourceId: 'r0',
      targetId: 'r2',
      time: 200,
    };
    const grid = gridFor([event]);
    // Riser is at x = timeToScreenX(200) = 200, midway between rows 0 and 2.
    const hit = hitTest(grid, 200, (rowCenter(0) + rowCenter(2)) / 2);
    expect(hit?.kind).toBe('event');
    if (hit?.kind === 'event') expect(hit.event.id).toBe('ev1');
  });

  it('hits an element line away from any arrow', () => {
    const grid = gridFor([]);
    const hit = hitTest(grid, 300, rowCenter(1));
    expect(hit?.kind).toBe('element');
    if (hit?.kind === 'element') expect(hit.element.id).toBe('r1');
  });

  it('prefers the event over the element line at the same point', () => {
    const event: TimelineEvent = {
      id: 'ev1',
      sourceId: 'r0',
      targetId: 'r2',
      time: 200,
    };
    const grid = gridFor([event]);
    // The riser endpoint sits on row 0's line; the event must win.
    const hit = hitTest(grid, 200, rowCenter(0));
    expect(hit?.kind).toBe('event');
  });

  it('returns null when the cursor is far from any primitive', () => {
    const grid = gridFor([]);
    // Midway between two element lines, well outside the hit tolerance.
    const hit = hitTest(grid, 300, (rowCenter(0) + rowCenter(1)) / 2);
    expect(hit).toBeNull();
  });
});
