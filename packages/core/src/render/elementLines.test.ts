import { describe, expect, it } from 'vitest';
import { defaultTheme } from '../engine/theme';
import { computeRowLayout } from '../layout/positions';
import type { Extent } from '../model/extent';
import type { TimelineElement, Theme } from '../model/types';
import { Camera, type RowMetrics, type Viewport } from '../scale/camera';
import { buildElementLines, markerReserveLeftPx } from './elementLines';
import { bySourceTargetColumn } from '../cluster/strategies';
import { overlayStyle, type ElementStyleResolver } from './resolveStyle';
import type { BuildContext, DataAccess, RowBand, ResolveIcon } from './specs';

const metrics: RowMetrics = {
  headerHeight: defaultTheme.headerHeight,
  rowHeight: defaultTheme.rowHeight,
  rowGap: defaultTheme.rowGap,
};
const viewport: Viewport = { cssWidth: 800, cssHeight: 400 };

function ctxFor(
  elements: TimelineElement[],
  extents: Map<string, Extent>,
  opts: {
    band?: RowBand;
    resolveIcon?: ResolveIcon;
    styleResolver?: ElementStyleResolver;
    formatElementLabel?: (element: TimelineElement) => string;
    theme?: Theme;
  } = {},
): BuildContext {
  const theme = opts.theme ?? defaultTheme;
  const byId = new Map(elements.map((e) => [e.id, e]));
  const data: DataAccess = {
    getEvents: () => [],
    getEventsInRange: () => [],
    getElements: () => elements,
    getElementById: (id) => byId.get(id),
    getExtent: (id) => extents.get(id),
  };
  return {
    camera: new Camera(metrics, { originTime: 0, pxPerMs: 1, scrollY: 0 }),
    rowLayout: computeRowLayout(
      elements.map((e) => e.id),
      metrics,
    ),
    data,
    viewport,
    theme,
    band: opts.band ?? { firstRow: 0, lastRow: elements.length - 1 },
    resolveIcon: opts.resolveIcon ?? (() => ({ kind: 'none' })),
    lod: { eventLabelMinPxPerMs: 0 },
    clustering: {
      enabled: false,
      strategy: bySourceTargetColumn,
      minSeparationPx: 12,
    },
    // §11 resolution mirrors the engine's binding (theme → resolver → .style).
    resolveElementStyle: (element) =>
      overlayStyle(theme.element, opts.styleResolver?.(element), element.style),
    resolveEventStyle: (event) =>
      overlayStyle(theme.event, undefined, event.style),
    formatElementLabel:
      opts.formatElementLabel ?? ((element) => element.label ?? element.id),
    formatEventLabel: (event) => event.label,
  };
}

/** The element-label batch (the one drawn in the theme's element label font). */
const elementLabel = (
  r: ReturnType<typeof buildElementLines>,
  font = defaultTheme.element.labelFont,
) => r.labels.find((b) => b.font === font)?.items[0];

describe('buildElementLines label anchoring (§1)', () => {
  it('right-aligns the label just left of the line start when on-screen', () => {
    const r = buildElementLines(
      ctxFor(
        [{ id: 'a', label: 'A' }],
        new Map([['a', { minTime: 100, maxTime: 500 }]]),
      ),
    );
    // lineStart 100, lead pad 12 -> x1 88; no icon -> label right edge 88-8 = 80.
    // Right-aligned so the text grows leftward and never overflows onto the line.
    const batch = r.labels.find(
      (b) => b.font === defaultTheme.element.labelFont,
    );
    expect(batch?.align).toBe('right');
    expect(batch?.items[0]?.x).toBeCloseTo(80);
  });

  it('sticks the label to the left edge when the line start scrolled off-screen', () => {
    const r = buildElementLines(
      ctxFor(
        [{ id: 'a', label: 'A' }],
        new Map([['a', { minTime: -1000, maxTime: 1000 }]]),
      ),
    );
    // Line start is far off-screen but the line still reaches the viewport, so
    // the label pins left-aligned at labelPadding to stay readable.
    const batch = r.labels.find(
      (b) => b.font === defaultTheme.element.labelFont,
    );
    expect(batch?.align).toBe('left');
    expect(batch?.items[0]?.x).toBeCloseTo(defaultTheme.labelPadding);
  });

  it('culls the row (no line, no label) when the line is fully off the left edge', () => {
    const r = buildElementLines(
      ctxFor(
        [{ id: 'a', label: 'A' }],
        new Map([['a', { minTime: -2000, maxTime: -1000 }]]),
      ),
    );
    expect(r.lines).toHaveLength(0);
    expect(r.labels).toHaveLength(0);
  });

  it('culls the row when the line end sits exactly on the left edge (lineEndX === 0)', () => {
    const r = buildElementLines(
      ctxFor(
        [{ id: 'a', label: 'A' }],
        // pxPerMs 1, originTime 0 -> lineEndX = maxTime = 0: nothing visible.
        new Map([['a', { minTime: -500, maxTime: 0 }]]),
      ),
    );
    expect(r.lines).toHaveLength(0);
    expect(r.labels).toHaveLength(0);
  });

  it('clamps the drawn line and hit target to the viewport when zoomed in far (perf)', () => {
    // At high zoom an element line spans its full extent in screen-x, which can
    // be millions of px wide. Stroking that and rasterizing it into the hit grid
    // cell-by-cell makes the framerate fall *as you zoom in*. The off-screen part
    // is invisible and un-hittable, so the line/target must be clamped to the
    // viewport (the horizontal line means clamping changes nothing visible).
    const r = buildElementLines(
      // pxPerMs 1, originTime 0 -> lineStartX = -1e6, lineEndX = 1e6.
      ctxFor(
        [{ id: 'a', label: 'A' }],
        new Map([['a', { minTime: -1_000_000, maxTime: 1_000_000 }]]),
      ),
    );
    const seg = r.lines[0]!.segments[0]!;
    const bound = viewport.cssWidth + 1000; // generous: must be O(viewport), not 1e6
    expect(seg.x1).toBeGreaterThan(-1000);
    expect(seg.x2).toBeLessThan(bound);
    const target = r.targets[0]!;
    expect(target.kind).toBe('element');
    if (target.kind === 'element') {
      expect(target.x1).toBeGreaterThan(-1000);
      expect(target.x2).toBeLessThan(bound);
    }
  });

  it('does not draw event-less elements (no extent)', () => {
    const r = buildElementLines(ctxFor([{ id: 'a', label: 'A' }], new Map()));
    expect(r.lines).toHaveLength(0);
  });

  it('culls rows outside the visible band', () => {
    const r = buildElementLines(
      ctxFor(
        [
          { id: 'a', label: 'A' },
          { id: 'b', label: 'B' },
        ],
        new Map([
          ['a', { minTime: 100, maxTime: 500 }],
          ['b', { minTime: 100, maxTime: 500 }],
        ]),
        { band: { firstRow: 1, lastRow: 1 } },
      ),
    );
    // Only row 1 ('b') survives the band cull.
    expect(r.lines).toHaveLength(1);
    expect(elementLabel(r)?.text).toBe('B');
  });
});

describe('buildElementLines icons (§1, §11)', () => {
  const extents = new Map([['a', { minTime: 100, maxTime: 500 }]]);
  const iconSize = defaultTheme.element.iconSize;

  it('emits a centered image icon stacked over the label', () => {
    const image = {} as HTMLImageElement;
    const r = buildElementLines(
      ctxFor([{ id: 'a', label: 'A', icon: image }], extents, {
        resolveIcon: () => ({ kind: 'image', image }),
      }),
    );
    expect(r.icons.items).toHaveLength(1);
    expect(r.icons.items[0]!.image).toBe(image);
    // x1 88; with an icon, markerCenterX = 88 - gap 8 - iconSize/2 8 = 72.
    // Icon is centered on that x; the label sits directly beneath, also centered.
    expect(r.icons.items[0]!.x).toBeCloseTo(72 - iconSize / 2);
    expect(elementLabel(r)?.x).toBeCloseTo(72);
  });

  it('emits an emoji icon as text', () => {
    const r = buildElementLines(
      ctxFor([{ id: 'a', label: 'A', icon: '🏦' }], extents, {
        resolveIcon: () => ({ kind: 'text', text: '🏦' }),
      }),
    );
    const emoji = r.labels.find((b) => b.font === `${iconSize}px sans-serif`);
    expect(emoji?.items[0]!.text).toBe('🏦');
    expect(r.icons.items).toHaveLength(0);
  });

  it('reserves the icon slot while a URL icon is still loading', () => {
    const r = buildElementLines(
      ctxFor([{ id: 'a', label: 'A', icon: 'http://x/i.png' }], extents, {
        resolveIcon: () => ({ kind: 'none' }),
      }),
    );
    expect(r.icons.items).toHaveLength(0);
    // Marker still reserves the icon slot, so the label stays centered at 72 and
    // will not jump when the image loads.
    expect(elementLabel(r)?.x).toBeCloseTo(72);
  });
});

describe('markerReserveLeftPx (§1 fit reserve)', () => {
  it('reserves room for the padding, marker content, gap and lead pad', () => {
    // Positive, and strictly larger than the lead gap alone — it must cover the
    // whole start-marker block so `fit` does not clip it at the left edge.
    expect(markerReserveLeftPx(defaultTheme)).toBeGreaterThan(
      defaultTheme.labelPadding + defaultTheme.element.iconSize,
    );
  });
});

describe('buildElementLines styling & formatting (§11)', () => {
  const extents = new Map([['a', { minTime: 100, maxTime: 500 }]]);

  it('applies a style resolver to the line, under the theme but over .style', () => {
    const r = buildElementLines(
      ctxFor([{ id: 'a', label: 'A' }], extents, {
        styleResolver: () => ({ lineColor: '#f00', lineWidth: 5 }),
      }),
    );
    expect(r.lines[0]?.color).toBe('#f00');
    expect(r.lines[0]?.width).toBe(5);
  });

  it('lets per-element .style win over the resolver (most specific, §11)', () => {
    const r = buildElementLines(
      ctxFor([{ id: 'a', label: 'A', style: { lineColor: '#0f0' } }], extents, {
        styleResolver: () => ({ lineColor: '#f00', lineWidth: 5 }),
      }),
    );
    expect(r.lines[0]?.color).toBe('#0f0'); // .style overrides resolver
    expect(r.lines[0]?.width).toBe(5); // resolver still overrides theme
  });

  it('formats the element label through the formatter', () => {
    const r = buildElementLines(
      ctxFor([{ id: 'a', label: 'Acme' }], extents, {
        formatElementLabel: (e) => e.label!.toUpperCase(),
      }),
    );
    expect(elementLabel(r)?.text).toBe('ACME');
  });

  it('carries a resolved line dash into the line batch (§11 border style)', () => {
    const r = buildElementLines(
      ctxFor([{ id: 'a', label: 'A', style: { lineDash: [4, 2] } }], extents),
    );
    expect(r.lines[0]?.dash).toEqual([4, 2]);
  });

  it('honours custom theme spacing (lineLeadPadding shifts the line start)', () => {
    const theme: Theme = {
      ...defaultTheme,
      lineLeadPadding: 40,
      markerGap: 20,
    };
    const r = buildElementLines(
      ctxFor([{ id: 'a', label: 'A' }], extents, { theme }),
    );
    // lineStart 100 − leadPad 40 = 60 (vs the default 88 with leadPad 12).
    expect(r.lines[0]?.segments[0]?.x1).toBeCloseTo(60);
  });
});
