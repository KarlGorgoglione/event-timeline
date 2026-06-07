import { describe, expect, it } from 'vitest';
import { defaultTheme } from '../engine/theme';
import { computeRowLayout } from '../layout/positions';
import type { TimelineEvent } from '../model/types';
import { Camera, type RowMetrics, type Viewport } from '../scale/camera';
import { buildArrows, subLaneOffset } from './arrows';
import { bySourceTargetColumn } from '../cluster/strategies';
import { overlayStyle, type EventStyleResolver } from './resolveStyle';
import type {
  BuildContext,
  ClusteringConfig,
  DataAccess,
  LodConfig,
  RowBand,
} from './specs';

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

interface CtxOpts {
  camera?: Camera;
  lod?: Partial<LodConfig>;
  clustering?: Partial<ClusteringConfig>;
  styleResolver?: EventStyleResolver;
  formatEventLabel?: (event: TimelineEvent) => string | undefined;
  /** Override the row set (default: the 10 module rows r0..r9). */
  rowIds?: string[];
}

function ctxFor(
  events: TimelineEvent[],
  band: RowBand,
  opts: CtxOpts = {},
): BuildContext {
  const rows = opts.rowIds ?? rowIds;
  const data: DataAccess = {
    getEvents: () => events,
    // Mirror the store: the temporal-index slice is time-sorted, which the
    // clustering sweep relies on (cluster.ts §6).
    getEventsInRange: (a, b) =>
      events
        .filter((e) => e.time >= a && e.time <= b)
        .sort((x, y) => x.time - y.time),
    getElements: () => [],
    getElementById: () => undefined,
    getExtent: () => undefined,
  };
  return {
    camera:
      opts.camera ??
      new Camera(metrics, { originTime: 0, pxPerMs: 1, scrollY: 0 }),
    rowLayout: computeRowLayout(rows, metrics),
    data,
    viewport,
    theme: defaultTheme,
    band,
    resolveIcon: () => ({ kind: 'none' }),
    // Default off so the geometry tests exercise the single-arrow path; labels
    // always on. The clustering/LOD suites opt in via `opts`.
    lod: { eventLabelMinPxPerMs: 0, ...opts.lod },
    clustering: {
      enabled: false,
      strategy: bySourceTargetColumn,
      minSeparationPx: 12,
      ...opts.clustering,
    },
    // §11 resolution mirrors the engine's binding (theme → resolver → .style).
    resolveElementStyle: (element) =>
      overlayStyle(defaultTheme.element, undefined, element.style),
    resolveEventStyle: (event) =>
      overlayStyle(
        defaultTheme.event,
        opts.styleResolver?.(event),
        event.style,
      ),
    formatElementLabel: (element) => element.label ?? element.id,
    formatEventLabel: opts.formatEventLabel ?? ((event) => event.label),
  };
}

const fullBand: RowBand = { firstRow: 0, lastRow: 9 };
const rowCenter = (row: number) =>
  metrics.headerHeight +
  row * (metrics.rowHeight + metrics.rowGap) +
  metrics.rowHeight / 2;

describe('buildArrows geometry (§1)', () => {
  // The arrowhead lands at the near edge of the target line's thickness (§1):
  // its anchor sits one arrowhead-size and half the target line width back from
  // the row centre, so the tip stops on the line edge instead of piercing it.
  const arrowheadAnchorY = (row: number, dir: number) =>
    rowCenter(row) -
    dir * (defaultTheme.element.lineWidth / 2) -
    dir * defaultTheme.event.arrowheadSize;

  it('draws a downward arrowhead landing at the target line edge', () => {
    const r = buildArrows(
      ctxFor([ev({ sourceId: 'r0', targetId: 'r2', time: 100 })], fullBand),
    );
    expect(r.arrowheads).toHaveLength(1);
    const head = r.arrowheads[0]!.items[0]!;
    expect(head.angle).toBeCloseTo(Math.PI / 2);
    expect(head.y).toBeCloseTo(arrowheadAnchorY(2, 1));
  });

  it('draws an upward arrowhead when the target is above the source', () => {
    const r = buildArrows(
      ctxFor([ev({ sourceId: 'r2', targetId: 'r0', time: 100 })], fullBand),
    );
    expect(r.arrowheads[0]!.items[0]!.angle).toBeCloseTo(-Math.PI / 2);
  });

  it('draws source and target dots and ends the riser at the arrowhead base', () => {
    const ctx = ctxFor(
      [ev({ sourceId: 'r0', targetId: 'r2', time: 100 })],
      fullBand,
    );
    const r = buildArrows(ctx);
    const x = ctx.camera.timeToScreenX(100);
    // Two dots in one batch: source on its line, target on the target line.
    expect(r.nodes[0]!.items).toEqual([
      { x, y: rowCenter(0) },
      { x, y: rowCenter(2) },
    ]);
    // Riser starts at the source line and stops at the arrowhead base (the line
    // is not pierced).
    const seg = r.lines[0]!.segments[0]!;
    expect(seg.y1).toBeCloseTo(rowCenter(0));
    const last = r.lines[0]!.segments.at(-1)!;
    expect(last.y2).toBeCloseTo(arrowheadAnchorY(2, 1));
  });

  it('hops over an intermediary element line the riser crosses (§16)', () => {
    const ctx = ctxFor(
      [ev({ sourceId: 'r0', targetId: 'r4', time: 100 })],
      fullBand,
    );
    // r2 sits between r0 and r4 and its line spans the event time -> hop.
    ctx.data.getExtent = (id) =>
      id === 'r2' ? { minTime: 0, maxTime: 200 } : undefined;
    const r = buildArrows(ctx);
    const segs = r.lines[0]!.segments;
    // A straight riser is a single segment; a hop adds an arc polyline.
    expect(segs.length).toBeGreaterThan(1);
    const x = ctx.camera.timeToScreenX(100);
    const bulged = segs.some(
      (s) => s.x2 > x + 0.5 && Math.abs(s.y2 - rowCenter(2)) < 6,
    );
    expect(bulged).toBe(true);
  });

  it('hops over a VISIBLE intermediary line even when the riser spans far more rows than fit on screen (§16)', () => {
    // Regression: a tall riser (source/target tens of rows apart, both far off
    // screen) still crosses element lines *within the visible band* and must hop
    // over them. The perf guard must key on the visible span, not the full one.
    const manyRows = Array.from({ length: 60 }, (_, i) => `r${i}`);
    // Only rows r28..r32 are on screen; the riser runs r0 -> r58 (span 58).
    const band: RowBand = { firstRow: 28, lastRow: 32 };
    const ctx = ctxFor(
      [ev({ sourceId: 'r0', targetId: 'r58', time: 100 })],
      band,
      {
        rowIds: manyRows,
      },
    );
    // r30 sits inside the visible band and its line spans the event time -> hop.
    ctx.data.getExtent = (id) =>
      id === 'r30' ? { minTime: 0, maxTime: 200 } : undefined;
    const r = buildArrows(ctx);
    const segs = r.lines[0]!.segments;
    expect(segs.length).toBeGreaterThan(1);
    const x = ctx.camera.timeToScreenX(100);
    const bulged = segs.some(
      (s) => s.x2 > x + 0.5 && Math.abs(s.y2 - rowCenter(30)) < 6,
    );
    expect(bulged).toBe(true);
  });

  it('keeps the riser straight when no intermediary line is crossed', () => {
    const ctx = ctxFor(
      [ev({ sourceId: 'r0', targetId: 'r4', time: 100 })],
      fullBand,
    );
    // r2's line does not span the event time -> no crossing, no hop.
    ctx.data.getExtent = (id) =>
      id === 'r2' ? { minTime: 500, maxTime: 600 } : undefined;
    const r = buildArrows(ctx);
    expect(r.lines[0]!.segments).toHaveLength(1);
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

describe('buildArrows styling & formatting (§11)', () => {
  it('applies a style resolver to the arrow colour', () => {
    const r = buildArrows(
      ctxFor([ev({ sourceId: 'r0', targetId: 'r1', time: 100 })], fullBand, {
        styleResolver: () => ({ arrowColor: '#abcdef' }),
      }),
    );
    expect(r.lines[0]!.color).toBe('#abcdef');
  });

  it('lets per-event .style win over the resolver (most specific, §11)', () => {
    const r = buildArrows(
      ctxFor(
        [
          ev({
            sourceId: 'r0',
            targetId: 'r1',
            time: 100,
            style: { arrowColor: '#0f0' },
          }),
        ],
        fullBand,
        { styleResolver: () => ({ arrowColor: '#f00' }) },
      ),
    );
    expect(r.lines[0]!.color).toBe('#0f0');
  });

  it('formats the event label through the formatter, even with no raw label', () => {
    const r = buildArrows(
      ctxFor([ev({ sourceId: 'r0', targetId: 'r2', time: 100 })], fullBand, {
        formatEventLabel: () => 'custom',
      }),
    );
    expect(r.labels[0]?.items[0]?.text).toBe('custom');
  });

  it('skips an empty formatted label', () => {
    const r = buildArrows(
      ctxFor(
        [ev({ sourceId: 'r0', targetId: 'r2', time: 100, label: '$5' })],
        fullBand,
        { formatEventLabel: () => '' },
      ),
    );
    expect(r.labels).toHaveLength(0);
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

  it('uses the temporal range query: only in-window events are considered', () => {
    // The window is [-48, 848] at pxPerMs 1 / origin 0; 500 is in, 100_000 out.
    const r = buildArrows(
      ctxFor(
        [
          ev({ id: 'in', sourceId: 'r0', targetId: 'r2', time: 500 }),
          ev({ id: 'out', sourceId: 'r0', targetId: 'r2', time: 100_000 }),
        ],
        fullBand,
      ),
    );
    expect(r.lines[0]!.segments).toHaveLength(1);
  });
});

describe('buildArrows label LOD (§6)', () => {
  const labelled = ev({
    sourceId: 'r0',
    targetId: 'r2',
    time: 100,
    label: '$5',
  });

  it('draws the event label at/above the zoom threshold', () => {
    const r = buildArrows(
      ctxFor([labelled], fullBand, { lod: { eventLabelMinPxPerMs: 1 } }),
    );
    expect(r.labels[0]?.items[0]?.text).toBe('$5');
  });

  it('suppresses the event label below the zoom threshold', () => {
    // Camera pxPerMs is 1; a threshold above it hides the label.
    const r = buildArrows(
      ctxFor([labelled], fullBand, { lod: { eventLabelMinPxPerMs: 2 } }),
    );
    expect(r.labels).toHaveLength(0);
    // Geometry is still drawn — only the label is suppressed.
    expect(r.lines[0]!.segments).toHaveLength(1);
  });
});

describe('buildArrows clustering (§6)', () => {
  const clusterOn = { clustering: { enabled: true } };

  it('collapses dense same-pair events into one count marker', () => {
    // Three r0→r2 events 3px apart (< minSeparationPx 12) collapse to one.
    const events = [
      ev({ id: 'a', sourceId: 'r0', targetId: 'r2', time: 100 }),
      ev({ id: 'b', sourceId: 'r0', targetId: 'r2', time: 103 }),
      ev({ id: 'c', sourceId: 'r0', targetId: 'r2', time: 106 }),
    ];
    const r = buildArrows(ctxFor(events, fullBand, clusterOn));
    // No per-event arrowheads; one cluster marker labelled ×3.
    expect(r.arrowheads).toHaveLength(0);
    expect(r.labels[0]?.items[0]?.text).toBe('×3');
    const target = r.targets[0]!;
    expect(target.kind).toBe('cluster');
    if (target.kind === 'cluster') expect(target.events).toHaveLength(3);
  });

  it('leaves well-separated events as ordinary arrows', () => {
    const events = [
      ev({ id: 'a', sourceId: 'r0', targetId: 'r2', time: 100 }),
      ev({ id: 'b', sourceId: 'r0', targetId: 'r2', time: 400 }),
    ];
    const r = buildArrows(ctxFor(events, fullBand, clusterOn));
    expect(r.arrowheads[0]!.items).toHaveLength(2);
    expect(r.targets.every((t) => t.kind === 'event')).toBe(true);
  });
});
