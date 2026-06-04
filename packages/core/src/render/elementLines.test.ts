import { describe, expect, it } from 'vitest';
import { defaultTheme } from '../engine/theme';
import { computeRowLayout } from '../layout/positions';
import type { Extent } from '../model/extent';
import type { TimelineElement } from '../model/types';
import { Camera, type RowMetrics, type Viewport } from '../scale/camera';
import { buildElementLines } from './elementLines';
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
  } = {},
): BuildContext {
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
    theme: defaultTheme,
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
      overlayStyle(
        defaultTheme.element,
        opts.styleResolver?.(element),
        element.style,
      ),
    resolveEventStyle: (event) =>
      overlayStyle(defaultTheme.event, undefined, event.style),
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
  it('anchors the label just before the line start when on-screen', () => {
    const r = buildElementLines(
      ctxFor(
        [{ id: 'a', label: 'A' }],
        new Map([['a', { minTime: 100, maxTime: 500 }]]),
      ),
    );
    // lineStart 100, lead pad 6 -> anchor 94 (>= labelPadding, not stuck).
    expect(elementLabel(r)?.x).toBeCloseTo(94);
  });

  it('sticks the label to the left edge when the line start scrolled off-screen', () => {
    const r = buildElementLines(
      ctxFor(
        [{ id: 'a', label: 'A' }],
        new Map([['a', { minTime: -1000, maxTime: 1000 }]]),
      ),
    );
    // desiredX (-1006) < labelPadding and the line still reaches the viewport.
    expect(elementLabel(r)?.x).toBeCloseTo(defaultTheme.labelPadding);
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

  it('emits an image icon and shifts the label past the icon slot', () => {
    const image = {} as HTMLImageElement;
    const r = buildElementLines(
      ctxFor([{ id: 'a', label: 'A', icon: image }], extents, {
        resolveIcon: () => ({ kind: 'image', image }),
      }),
    );
    expect(r.icons.items).toHaveLength(1);
    expect(r.icons.items[0]!.image).toBe(image);
    // anchor 94 + iconSize 16 + gap 4 = 114.
    expect(elementLabel(r)?.x).toBeCloseTo(94 + iconSize + 4);
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
    // Label still shifted so it will not jump when the image loads.
    expect(elementLabel(r)?.x).toBeCloseTo(94 + iconSize + 4);
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
});
