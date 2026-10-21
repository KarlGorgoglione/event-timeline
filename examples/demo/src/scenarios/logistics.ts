import { withAlpha, readableOn } from '../ui/color';
import { MS_PER_DAY } from '../app/options';
import type { ThemePreset } from '../themes/presets';
import { REGIONS, UNOPENED_PORT, makeLogistics } from './data/logistics';
import { formatDate, slotColor } from './common';
import type { Scenario } from './types';

const MODES = {
  sea: { label: 'Sea freight', dash: [] as number[] },
  air: { label: 'Air freight', dash: [6, 4] },
  rail: { label: 'Rail', dash: [1, 3] },
} as const;

/**
 * Region badges drawn on a canvas: element icons may be any
 * `CanvasImageSource`, not just URLs or glyphs (§1). Drawn at 3× so they stay
 * crisp on high-density screens.
 */
function drawBadge(color: string, letter: string): HTMLCanvasElement {
  const size = 54;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx === null) return canvas;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(3, 3, size - 6, size - 6, 14);
  ctx.fill();
  ctx.fillStyle = readableOn(color);
  ctx.font = `700 28px 'Inter Variable', system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(letter, size / 2, size / 2 + 2);
  return canvas;
}

function icons(preset: ThemePreset): ReadonlyMap<string, CanvasImageSource> {
  const map = new Map<string, CanvasImageSource>();
  if (typeof document === 'undefined') return map;
  REGIONS.forEach((region, r) => {
    const badge = drawBadge(slotColor(preset, r + 1), region.name.charAt(0));
    for (const [code] of region.ports) map.set(`port-${code}`, badge);
  });
  return map;
}

export const logistics: Scenario = {
  id: 'logistics',
  short: 'Logistics',
  title: 'Global shipping network',
  tagline: '22 ports · 5 regions · 2024–2026',
  summary:
    'Three years of container, air and rail shipments. Ports are ordered by ' +
    'region with the explicit layout, the transport mode sets the dash, and ' +
    'region badges are drawn on a canvas. Panning stops at the data, dates ' +
    'are British, and one port with no traffic yet still gets its row.',
  tryThis: [
    'Scroll down to Nouméa: an element with no events, shown by emptyElements: "show".',
    'Air freight is dashed, rail dotted: a resolver maps the payload to a dash.',
    'Try to pan past 2024 or 2026: pan.bounds = "data" holds the window on the data.',
    'Zoom out to the full three years: watch the peak seasons cluster.',
  ],
  load: () => makeLogistics(),
  options: {
    layout: 'explicit',
    emptyElements: 'show',
    multiSelect: true,
    locale: 'en-GB',
    'navigation.panBounds': 'data',
    'lod.eventLabelPxPerDay': 14,
  },
  focus: () => [Date.UTC(2026, 7, 1), Date.UTC(2026, 9, 1)],
  nudgeMs: MS_PER_DAY,
  formatTime: formatDate,
  icons,
  resolvers: (preset) => ({
    element: (e) => ({ lineColor: slotColor(preset, e.data?.category) }),
    event: (e) => {
      const colour = slotColor(preset, e.data?.category);
      return {
        arrowColor: colour,
        arrowDash: [...MODES[e.data?.mode ?? 'sea'].dash],
        labelBoxBorderColor: withAlpha(colour, 0.6),
      };
    },
  }),
  formatters: () => ({
    elementLabel: (e) =>
      e.data?.code ? `${e.label ?? e.id} · ${e.data.code}` : (e.label ?? e.id),
  }),
  describeEvent: (event, ctx) => {
    const mode = MODES[event.data?.mode ?? 'sea'];
    return {
      title: `${ctx.labelOf(event.sourceId)} → ${ctx.labelOf(event.targetId)}`,
      subtitle: mode.label,
      swatch: slotColor(ctx.preset, event.data?.category),
      rows: [
        ['Cargo', event.data?.cargo ?? '—'],
        ['Volume', event.label ?? '—'],
        ['Departs', formatDate(event.time)],
      ],
    };
  },
  describeElement: (element, ctx) => {
    const region = REGIONS.find((r) => r.id === element.data?.region);
    return {
      title: element.label ?? element.id,
      subtitle: region ? `${region.name} · ${element.data?.country}` : 'Port',
      swatch: slotColor(ctx.preset, element.data?.category),
      rows: [
        ['Code', element.data?.code ?? '—'],
        ...(element.id === UNOPENED_PORT
          ? [['Status', 'Opens in 2027'] as const]
          : []),
      ],
    };
  },
  legend: (preset) => [
    ...REGIONS.map((r, i) => ({
      label: r.name,
      mark: 'line' as const,
      color: slotColor(preset, i + 1),
    })),
    { label: 'Sea', mark: 'arrow', color: preset.theme.event.arrowColor },
    { label: 'Air', mark: 'dashed', color: preset.theme.event.arrowColor },
    { label: 'Rail', mark: 'dotted', color: preset.theme.event.arrowColor },
  ],
  accessibility: {
    label: 'Shipping timeline',
    description:
      'Container, air and rail shipments between 22 ports from 2024 to 2026.',
  },
};
