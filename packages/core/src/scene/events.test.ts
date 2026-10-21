import { describe, expect, it } from 'vitest';
import { defaultTheme } from '../engine/theme';
import type { TimelineData, TimelineEvent } from '../model/types';
import { heads, points, segments, testFrame, texts } from '../testing/frame';
import { TargetKind } from './targets';
import { SPREAD_PX } from './events';
import { byElementPair } from '../cluster/strategies';

// Default theme: header 44, row 28, gap 6 → row r centre = 58 + 34r. At dpr 1
// and pxPerMs 1 from origin 0, an event at time t sits at x = t. A 1px arrow
// stroke is offset by 0.5 (hairline) after snapping.
const rowCenter = (row: number) => 58 + 34 * row;
const rows = Array.from({ length: 10 }, (_, i) => ({
  id: `r${i}`,
  label: `R${i}`,
}));
const { arrowheadSize, nodeRadius } = defaultTheme.event;
const lineWidth = defaultTheme.element.lineWidth;

function data(events: Partial<TimelineEvent>[]): TimelineData {
  return {
    elements: rows,
    events: events.map((e, i) => ({
      id: `e${i}`,
      sourceId: 'r0',
      targetId: 'r2',
      time: 100,
      ...e,
    })),
  };
}

/** The first event-line batch (risers and loops). */
const risers = (out: ReturnType<typeof testFrame>['out']) =>
  out.eventLines.used.flatMap(segments);

describe('event arrows (§1)', () => {
  // The arrowhead anchor sits one arrowhead-size and half the target line
  // width before the target row centre, so the tip stops on the line edge.
  const anchorY = (row: number, dir: number) =>
    rowCenter(row) - dir * (lineWidth / 2) - dir * arrowheadSize;

  it('draws a downward arrowhead landing at the target line edge', () => {
    const { out } = testFrame(data([{}]));
    const [head] = heads(out.heads.used[0]!);
    expect(head!.angle).toBeCloseTo(Math.PI / 2);
    expect(head!.y).toBe(Math.round(anchorY(2, 1)));
  });

  it('draws an upward arrowhead when the target is above the source', () => {
    const { out } = testFrame(data([{ sourceId: 'r2', targetId: 'r0' }]));
    expect(heads(out.heads.used[0]!)[0]!.angle).toBeCloseTo(-Math.PI / 2);
  });

  it('draws source and target dots and ends the riser at the arrowhead base', () => {
    const { out } = testFrame(data([{}]));
    expect(points(out.nodes.used[0]!)).toEqual([
      { x: 100, y: rowCenter(0) },
      { x: 100, y: rowCenter(2) },
    ]);
    const segs = risers(out);
    expect(segs[0]!.y1).toBe(rowCenter(0) + 0.5);
    expect(segs.at(-1)!.y2).toBe(Math.round(anchorY(2, 1)) + 0.5);
  });

  it('omits the landing dot when arrows.targetDot is off', () => {
    const { out } = testFrame(data([{}]), { arrows: { targetDot: false } });
    expect(points(out.nodes.used[0]!)).toEqual([{ x: 100, y: rowCenter(0) }]);
  });

  it('carries per-event sizes on the hit target (§11)', () => {
    const { out } = testFrame(
      data([{ style: { nodeRadius: 7, arrowheadSize: 9, arrowWidth: 3 } }]),
    );
    const t = out.targets.at(out.targets.count - 1);
    expect(t.kind).toBe(TargetKind.Event);
    expect([t.radius, t.headSize, t.width]).toEqual([7, 9, 3]);
    expect(t.angle).toBeCloseTo(Math.PI / 2);
  });

  it('lets per-event style and resolvers set the stroke, most specific winning', () => {
    const { out } = testFrame(
      data([{ style: { arrowColor: '#0f0' } }, { time: 300 }]),
      {
        styleResolvers: { event: () => ({ arrowColor: '#f00' }) },
      },
    );
    expect(out.eventLines.used.map((b) => b.color).sort()).toEqual([
      '#0f0',
      '#f00',
    ]);
  });

  it('carries a resolved arrow dash into the riser batch', () => {
    const { out } = testFrame(data([{ style: { arrowDash: [3, 3] } }]));
    expect(out.eventLines.used[0]!.dash).toEqual([3, 3]);
  });

  it('places a midpoint label beside the riser', () => {
    const { out } = testFrame(data([{ label: '$5' }]));
    const label = texts(out.eventText.used[0]!)[0]!;
    expect(label.text).toBe('$5');
    expect(label.y).toBe(Math.round((rowCenter(0) + rowCenter(2)) / 2));
    expect(out.eventText.used[0]!.align).toBe('left');
  });

  it('formats labels and skips an empty formatted label', () => {
    const custom = testFrame(data([{}]), {
      formatters: { eventLabel: () => 'custom' },
    });
    expect(texts(custom.out.eventText.used[0]!)[0]!.text).toBe('custom');
    const empty = testFrame(data([{ label: '$5' }]), {
      formatters: { eventLabel: () => '' },
    });
    expect(empty.out.eventText.used).toHaveLength(0);
  });

  it('suppresses labels below the label LOD zoom but keeps the geometry', () => {
    const { out } = testFrame(data([{ label: '$5' }]), {
      lod: { eventLabelMinPxPerMs: 2 },
    });
    expect(out.eventText.used).toHaveLength(0);
    expect(risers(out)).toHaveLength(1);
  });
});

describe('event label box (§11)', () => {
  const pad = defaultTheme.event.labelBoxPadding;
  const fontPx = 11;
  const boxH = fontPx + 2 * pad;
  const gap = nodeRadius + defaultTheme.layout.eventLabelGap;
  const filled = { event: () => ({ labelBoxBackground: '#123456' }) };
  const box = (out: ReturnType<typeof testFrame>['out']) => {
    const c = out.boxFills.used[0]!.coords;
    return { x: c[0]!, y: c[1]!, w: c[2]!, h: c[3]! };
  };

  it('draws no box by default', () => {
    const { out } = testFrame(data([{ label: '$5' }]));
    expect(out.boxFills.used).toHaveLength(0);
    expect(out.boxBorders.used).toHaveLength(0);
  });

  it('places the box above the source node for a downward arrow', () => {
    const { out } = testFrame(data([{ label: '$5' }]), {
      eventLabel: { placement: 'sourceNode' },
      styleResolvers: filled,
    });
    const b = box(out);
    expect(b.y + boxH).toBe(Math.round(rowCenter(0) - gap));
    expect(out.eventText.used[0]!.align).toBe('center');
  });

  it('places the box below the source node for an upward arrow', () => {
    const { out } = testFrame(
      data([{ sourceId: 'r2', targetId: 'r0', label: '$5' }]),
      {
        eventLabel: { placement: 'sourceNode' },
        styleResolvers: filled,
      },
    );
    expect(box(out).y).toBe(Math.round(rowCenter(2) + gap));
  });

  it('sizes the box from the measured text plus padding, in every placement', () => {
    for (const placement of ['midpoint', 'sourceNode'] as const) {
      const { out } = testFrame(data([{ label: 'abcd' }]), {
        eventLabel: { placement },
        styleResolvers: filled,
      });
      expect(box(out).w).toBe(4 * 6 + 2 * pad);
      expect(box(out).h).toBe(boxH);
    }
  });

  it('draws a joined 4-segment border with the resolved dash', () => {
    const { out } = testFrame(data([{ label: '$5' }]), {
      styleResolvers: {
        event: () => ({
          labelBoxBorderColor: '#abc',
          labelBoxBorderWidth: 1,
          labelBoxBorderDash: [2, 2],
        }),
      },
    });
    const border = out.boxBorders.used[0]!;
    expect(border.color).toBe('#abc');
    expect(border.dash).toEqual([2, 2]);
    expect(segments(border).map((s) => s.join)).toEqual([
      false,
      true,
      true,
      true,
    ]);
  });

  it('lets per-item style override the resolver for the box fill', () => {
    const { out } = testFrame(
      data([{ label: '$5', style: { labelBoxBackground: '#fff' } }]),
      {
        styleResolvers: filled,
      },
    );
    expect(out.boxFills.used[0]!.color).toBe('#fff');
  });

  it('places a self-event box below the line, clearing the loop', () => {
    const { out } = testFrame(
      data([{ sourceId: 'r3', targetId: 'r3', label: '$5' }]),
      {
        eventLabel: { placement: 'sourceNode' },
        styleResolvers: filled,
      },
    );
    expect(box(out).y).toBe(Math.round(rowCenter(3) + gap));
  });
});

describe('self-events (§1)', () => {
  it('renders a joined half-loop glyph with no inter-row riser', () => {
    const { out } = testFrame(data([{ sourceId: 'r3', targetId: 'r3' }]));
    const segs = risers(out);
    expect(segs).toHaveLength(3);
    expect(segs.map((s) => s.join)).toEqual([false, true, true]);
    expect(points(out.nodes.used[0]!)).toHaveLength(1);
    const [head] = heads(out.heads.used[0]!);
    expect(head!.x).toBe(100 + arrowheadSize * 2);
    expect(head!.y).toBe(rowCenter(3));
  });
});

describe('hops over crossed lines (§1, A-06)', () => {
  // r2 has an event spanning time 100, so its line crosses r0 → r4 risers.
  const crossing = data([
    { sourceId: 'r0', targetId: 'r4', time: 100 },
    { sourceId: 'r2', targetId: 'r2', time: 50 },
    { id: 'x', sourceId: 'r2', targetId: 'r2', time: 150 },
  ]);

  it('bulges the riser over an intermediary line as a joined polyline', () => {
    const { out } = testFrame(crossing);
    // The riser and its hop stay within a few px of x = 100.
    const segs = risers(out).filter((s) => s.x1 >= 100 && s.x1 <= 106);
    expect(segs.length).toBeGreaterThan(2);
    expect(segs.slice(1).every((s) => s.join)).toBe(true);
    expect(
      segs.some((s) => s.x2 > 101 && Math.abs(s.y2 - rowCenter(2)) < 6),
    ).toBe(true);
  });

  it('keeps risers straight with hops off', () => {
    const { out } = testFrame(crossing, { arrows: { hops: false } });
    const riser = risers(out).filter((s) => s.x1 === 100.5);
    expect(riser).toHaveLength(1);
  });

  it("drops hops under 'auto' once a frame would draw more than the budget", () => {
    const { out } = testFrame(crossing, { arrows: { hopBudget: 1 } });
    expect(risers(out).filter((s) => s.x1 === 100.5)).toHaveLength(1);
  });

  it('only scans rows inside the visible band', () => {
    const many = Array.from({ length: 60 }, (_, i) => ({
      id: `r${i}`,
      label: '',
    }));
    const { out } = testFrame(
      {
        elements: many,
        events: [
          { id: 'tall', sourceId: 'r0', targetId: 'r58', time: 100 },
          { id: 'a', sourceId: 'r30', targetId: 'r30', time: 50 },
          { id: 'b', sourceId: 'r30', targetId: 'r30', time: 150 },
        ],
      },
      { camera: { scrollY: 30 * 34 - 100 } },
    );
    const tall = risers(out).filter((s) => s.x1 >= 100 && s.x1 <= 106);
    expect(tall.length).toBeGreaterThan(1);
  });
});

describe('sub-lanes (§1)', () => {
  it('nudges arrows sharing a pixel column by the configured step, capped', () => {
    const many = data(
      Array.from({ length: 7 }, (_, i) => ({
        sourceId: 'r0',
        targetId: `r${(i % 3) + 1}`,
      })),
    );
    const { out } = testFrame(many);
    const xs = points(out.nodes.used[0]!)
      .filter((p) => p.y === rowCenter(0))
      .map((p) => p.x);
    expect(xs).toEqual([100, 102, 104, 106, 108, 108, 108]);
  });

  it('does not nudge arrows in different columns', () => {
    const { out } = testFrame(data([{ time: 100 }, { time: 200 }]));
    const xs = points(out.nodes.used[0]!)
      .filter((p) => p.y === rowCenter(0))
      .map((p) => p.x);
    expect(xs).toEqual([100, 200]);
  });
});

describe('culling (§5 row-interval test)', () => {
  const band = (scrollY: number) => ({
    camera: { scrollY },
    height: 44 + 2 * 34,
  });

  it('keeps an arrow crossing the band with both endpoints off-screen', () => {
    const { out } = testFrame(
      data([{ sourceId: 'r0', targetId: 'r9' }]),
      band(4 * 34),
    );
    expect(risers(out)).toHaveLength(1);
  });

  it('culls arrows whose rows are entirely above or below the band', () => {
    const above = testFrame(
      data([{ sourceId: 'r0', targetId: 'r1' }]),
      band(6 * 34),
    );
    expect(above.out.eventLines.used).toHaveLength(0);
    const below = testFrame(
      data([{ sourceId: 'r8', targetId: 'r9' }]),
      band(0),
    );
    expect(below.out.eventLines.used).toHaveLength(0);
  });

  it('culls an event far off-screen horizontally', () => {
    const { out } = testFrame(data([{ time: 100_000 }]));
    expect(out.eventLines.used).toHaveLength(0);
  });

  it('skips events whose element has no row', () => {
    const { out } = testFrame(data([{}]), { rowIds: ['r0', 'r1'] });
    expect(out.eventLines.used).toHaveLength(0);
  });
});

describe('clustering (§6)', () => {
  const on = { clustering: { enabled: true } };

  it('collapses dense same-pair events into one count marker', () => {
    const { out } = testFrame(
      data([{ time: 100 }, { time: 103 }, { time: 106 }]),
      on,
    );
    expect(out.heads.used).toHaveLength(0);
    expect(texts(out.eventText.used[0]!)[0]!.text).toBe('×3');
    const t = out.targets.at(out.targets.count - 1);
    expect(t.kind).toBe(TargetKind.Cluster);
    expect(t.memberCount).toBe(3);
  });

  it('leaves well-separated events as ordinary arrows', () => {
    const { out } = testFrame(data([{ time: 100 }, { time: 400 }]), on);
    expect(heads(out.heads.used[0]!)).toHaveLength(2);
  });

  it('measures a run from its first event, so runs never chain (B-11)', () => {
    // 11 px apart: the old pairwise sweep merged all of them into one marker.
    const chain = data(
      Array.from({ length: 6 }, (_, i) => ({ time: 100 + i * 11 })),
    );
    // byElementPair has no column in its key, so only the run bound applies.
    const { out } = testFrame(chain, {
      clustering: { enabled: true, strategy: byElementPair },
    });
    const clusters = Array.from({ length: out.targets.count }, (_, i) =>
      out.targets.at(i),
    ).filter((t) => t.kind === TargetKind.Cluster);
    expect(clusters.map((t) => t.memberCount)).toEqual([2, 2, 2]);
  });

  it('styles the marker from theme knobs and keeps its riser solid (§11)', () => {
    const { out } = testFrame(
      data([{ time: 100, style: { arrowDash: [2, 2] } }, { time: 103 }]),
      on,
    );
    expect(out.eventText.used[0]!.color).toBe(defaultTheme.cluster.textColor);
    expect(out.nodes.used[0]!.radius).toBe(
      nodeRadius + defaultTheme.cluster.markerBonus,
    );
    expect(out.eventLines.used[0]!.dash).toBeUndefined();
  });

  it('accepts a host strategy returning numbers or strings (I-04)', () => {
    const { out } = testFrame(
      data([{ time: 100 }, { time: 101, targetId: 'r3' }]),
      {
        clustering: { enabled: true, strategy: { key: () => 'all' } },
      },
    );
    expect(texts(out.eventText.used[0]!)[0]!.text).toBe('×2');
  });

  it('spreads a run out instead of collapsing it when expanded in place (B-01)', () => {
    const same = data([{ time: 100 }, { time: 100 }, { time: 100 }]);
    const { out } = testFrame(same, { ...on, spread: () => true });
    expect(heads(out.heads.used[0]!).map((h) => h.x)).toEqual([
      100 - SPREAD_PX,
      100,
      100 + SPREAD_PX,
    ]);
  });

  it('never collapses at the deepest zoom (B-01)', () => {
    const same = data([{ time: 100 }, { time: 100 }]);
    const { out } = testFrame(same, { ...on, maxPxPerMs: 1 });
    expect(heads(out.heads.used[0]!)).toHaveLength(2);
    expect(out.eventText.used).toHaveLength(0);
  });
});

describe('label culling (§4, P-08)', () => {
  it('drops a label that would overlap one already placed', () => {
    const { out } = testFrame(
      data([
        { time: 100, targetId: 'r1', label: 'first label' },
        { time: 103, targetId: 'r1', label: 'second label' },
      ]),
    );
    expect(out.eventText.used.flatMap(texts).map((t) => t.text)).toEqual([
      'first label',
    ]);
  });

  it('keeps every label when collision avoidance is off, up to the cap', () => {
    const many = data(
      Array.from({ length: 5 }, (_, i) => ({
        time: 100 + i,
        targetId: 'r1',
        label: `L${i}`,
      })),
    );
    const all = testFrame(many, { labels: { avoidCollisions: false } });
    expect(all.out.eventText.used.flatMap(texts)).toHaveLength(5);
    const capped = testFrame(many, {
      labels: { avoidCollisions: false, maxPerFrame: 2 },
    });
    expect(capped.out.eventText.used.flatMap(texts)).toHaveLength(2);
  });

  it('places cluster counts before event labels', () => {
    const { out } = testFrame(
      data([
        { time: 100, targetId: 'r1', label: 'event label' },
        { time: 102, sourceId: 'r2', targetId: 'r3' },
        { time: 104, sourceId: 'r2', targetId: 'r3' },
      ]),
      { clustering: { enabled: true }, labels: { maxPerFrame: 1 } },
    );
    expect(out.eventText.used.flatMap(texts).map((t) => t.text)).toEqual([
      '×2',
    ]);
  });
});

describe('device pixels (§3, A-08)', () => {
  it('builds directly in device px at dpr 2', () => {
    const { out } = testFrame(data([{}]), { dpr: 2 });
    expect(points(out.nodes.used[0]!)[0]).toEqual({
      x: 200,
      y: 2 * rowCenter(0),
    });
    expect(out.nodes.used[0]!.radius).toBe(2 * nodeRadius);
    expect(out.eventLines.used[0]!.width).toBe(2);
    expect(risers(out)[0]!.x1).toBe(200); // even width: no hairline offset
  });
});
