import { describe, expect, it } from 'vitest';
import { defaultTheme } from '../engine/theme';
import { computeRowLayout } from '../layout/positions';
import type { TimelineEvent } from '../model/types';
import { Camera, type RowMetrics, type Viewport } from '../scale/camera';
import { buildArrows, subLaneOffset } from './arrows';
import type { BuildContext, DataAccess, RowBand } from './specs';

const metrics: RowMetrics = {
  headerHeight: defaultTheme.headerHeight,
  rowHeight: defaultTheme.rowHeight,
  rowGap: defaultTheme.rowGap,
};
const viewport: Viewport = { cssWidth: 800, cssHeight: 400 };
// Ten rows r0..r9 so culling tests can place endpoints far apart.
const rowIds = Array.from({ length: 10 }, (_, i) => `r${i}`);

const ev = (
  partial: Partial<TimelineEvent> & {
    sourceId: string;
    targetId: string;
    time: number;
  },
): TimelineEvent => ({ id: 'e', label: undefined, ...partial });

function ctxFor(events: TimelineEvent[], band: RowBand): BuildContext {
  const data: DataAccess = {
    getEvents: () => events,
    getElements: () => [],
    getElementById: () => undefined,
    getExtent: () => undefined,
  };
  return {
    camera: new Camera(metrics, { originTime: 0, pxPerMs: 1, scrollY: 0 }),
    rowLayout: computeRowLayout(rowIds, metrics),
    data,
    viewport,
    theme: defaultTheme,
    band,
    resolveIcon: () => ({ kind: 'none' }),
  };
}

const fullBand: RowBand = { firstRow: 0, lastRow: 9 };
const rowCenter = (row: number) =>
  metrics.headerHeight +
  row * (metrics.rowHeight + metrics.rowGap) +
  metrics.rowHeight / 2;

describe('buildArrows geometry (§1)', () => {
  it('draws a downward arrowhead when the target is below the source', () => {
    const r = buildArrows(
      ctxFor([ev({ sourceId: 'r0', targetId: 'r2', time: 100 })], fullBand),
    );
    expect(r.arrowheads).toHaveLength(1);
    const head = r.arrowheads[0]!.items[0]!;
    expect(head.angle).toBeCloseTo(Math.PI / 2);
    expect(head.y).toBeCloseTo(rowCenter(2));
  });

  it('draws an upward arrowhead when the target is above the source', () => {
    const r = buildArrows(
      ctxFor([ev({ sourceId: 'r2', targetId: 'r0', time: 100 })], fullBand),
    );
    expect(r.arrowheads[0]!.items[0]!.angle).toBeCloseTo(-Math.PI / 2);
  });

  it('places the riser x at timeToScreenX(time) and the source node on it', () => {
    const ctx = ctxFor(
      [ev({ sourceId: 'r0', targetId: 'r2', time: 100 })],
      fullBand,
    );
    const r = buildArrows(ctx);
    const expectedX = ctx.camera.timeToScreenX(100);
    expect(r.lines[0]!.segments[0]!.x1).toBeCloseTo(expectedX);
    expect(r.nodes[0]!.items[0]!).toEqual({
      x: expectedX,
      y: rowCenter(0),
    });
  });

  it('resolves arrowhead size and node radius from the theme', () => {
    const r = buildArrows(
      ctxFor([ev({ sourceId: 'r0', targetId: 'r1', time: 100 })], fullBand),
    );
    expect(r.arrowheads[0]!.size).toBe(defaultTheme.event.arrowheadSize);
    expect(r.nodes[0]!.radius).toBe(defaultTheme.event.nodeRadius);
  });

  it('lets per-event style override the theme colour', () => {
    const r = buildArrows(
      ctxFor(
        [
          ev({
            sourceId: 'r0',
            targetId: 'r1',
            time: 100,
            style: { arrowColor: '#ff0000' },
          }),
        ],
        fullBand,
      ),
    );
    expect(r.lines[0]!.color).toBe('#ff0000');
  });

  it('places an event label at the riser midpoint when present', () => {
    const r = buildArrows(
      ctxFor(
        [ev({ sourceId: 'r0', targetId: 'r2', time: 100, label: '$5' })],
        fullBand,
      ),
    );
    expect(r.labels[0]!.items[0]!.text).toBe('$5');
    expect(r.labels[0]!.items[0]!.y).toBeCloseTo(
      (rowCenter(0) + rowCenter(2)) / 2,
    );
  });
});

describe('buildArrows self-events (§1)', () => {
  it('renders a half-loop glyph with no inter-row riser', () => {
    const r = buildArrows(
      ctxFor([ev({ sourceId: 'r3', targetId: 'r3', time: 100 })], fullBand),
    );
    // Three segments form the rectangular loop; one source node; one arrowhead.
    expect(r.lines[0]!.segments).toHaveLength(3);
    expect(r.nodes[0]!.items).toHaveLength(1);
    expect(r.arrowheads[0]!.items).toHaveLength(1);
    const loop = defaultTheme.event.arrowheadSize * 2;
    const head = r.arrowheads[0]!.items[0]!;
    expect(head.x).toBeCloseTo(100 + loop);
    expect(head.y).toBeCloseTo(rowCenter(3));
    expect(head.angle).toBeCloseTo(Math.PI / 2);
  });
});

describe('subLaneOffset (§16)', () => {
  it('steps by 2px per shared column and caps the spread', () => {
    expect([0, 1, 2, 3, 4, 5, 10].map(subLaneOffset)).toEqual([
      0, 2, 4, 6, 8, 8, 8,
    ]);
  });

  it('spreads events sharing a pixel column deterministically', () => {
    const events = [
      ev({ id: 'a', sourceId: 'r0', targetId: 'r2', time: 100 }),
      ev({ id: 'b', sourceId: 'r1', targetId: 'r3', time: 100 }),
    ];
    const run = () => buildArrows(ctxFor(events, fullBand)).lines[0]!.segments;
    const first = run();
    expect(first[0]!.x1).toBeCloseTo(100);
    expect(first[1]!.x1).toBeCloseTo(102);
    // Determinism: identical input yields identical offsets.
    expect(run()).toEqual(first);
  });

  it('does not offset events in different pixel columns', () => {
    const r = buildArrows(
      ctxFor(
        [
          ev({ id: 'a', sourceId: 'r0', targetId: 'r2', time: 100 }),
          ev({ id: 'b', sourceId: 'r0', targetId: 'r2', time: 200 }),
        ],
        fullBand,
      ),
    );
    const xs = r.lines[0]!.segments.map((s) => s.x1);
    expect(xs).toEqual([100, 200]);
  });
});

describe('buildArrows culling (§5 row-interval test)', () => {
  it('RETAINS an arrow crossing the band with both endpoints off-screen', () => {
    // Source above the band, target below it: both endpoints out of view, but
    // the riser crosses the visible rows and must be drawn.
    const band: RowBand = { firstRow: 2, lastRow: 3 };
    const r = buildArrows(
      ctxFor([ev({ sourceId: 'r0', targetId: 'r5', time: 100 })], band),
    );
    expect(r.lines[0]!.segments).toHaveLength(1);
  });

  it('culls an arrow whose rows are entirely above the band', () => {
    const band: RowBand = { firstRow: 5, lastRow: 6 };
    const r = buildArrows(
      ctxFor([ev({ sourceId: 'r0', targetId: 'r1', time: 100 })], band),
    );
    expect(r.lines).toHaveLength(0);
  });

  it('culls an arrow whose rows are entirely below the band', () => {
    const band: RowBand = { firstRow: 2, lastRow: 3 };
    const r = buildArrows(
      ctxFor([ev({ sourceId: 'r7', targetId: 'r8', time: 100 })], band),
    );
    expect(r.lines).toHaveLength(0);
  });

  it('keeps an arrow with one endpoint inside the band', () => {
    const band: RowBand = { firstRow: 2, lastRow: 3 };
    const r = buildArrows(
      ctxFor([ev({ sourceId: 'r3', targetId: 'r9', time: 100 })], band),
    );
    expect(r.lines[0]!.segments).toHaveLength(1);
  });

  it('culls an event far off-screen horizontally', () => {
    const r = buildArrows(
      ctxFor([ev({ sourceId: 'r0', targetId: 'r2', time: 100_000 })], fullBand),
    );
    expect(r.lines).toHaveLength(0);
  });
});
