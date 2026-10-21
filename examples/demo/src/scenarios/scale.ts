import { makeSynthetic } from '../synthetic';
import { MS_PER_DAY } from '../app/options';
import { describeEventDefault, formatDate, slotColor } from './common';
import type { Scenario } from './types';

export const scale: Scenario = {
  id: 'scale',
  short: 'Scale',
  title: 'Scale test',
  tagline: 'Up to 50,000 events at 60 fps',
  summary:
    'A year of synthetic transfers in bursts. Zoomed out, nearby events merge ' +
    'into ×N markers and, past the marker budget, into pre-binned aggregates, ' +
    'so a frame costs the same at 50k as at 5k. The WebGL2 renderer draws it ' +
    'all in a handful of instanced calls; Canvas2D is the fallback.',
  tryThis: [
    'Switch to 50k, then pan and zoom hard: watch fps and frame times in the Scale card.',
    'Flip the renderer between WebGL2 and Canvas2D to compare frame costs.',
    'Click a ×N marker to zoom into it; at maximum zoom, same-instant events spread apart.',
    'Lower "Max markers" to make aggregation kick in sooner.',
  ],
  variants: [
    { id: '10k', label: '10k' },
    { id: '50k', label: '50k' },
  ],
  heavy: true,
  load: (variant) =>
    variant === '50k' ? makeSynthetic(50_000, 400, 2) : makeSynthetic(),
  options: { multiSelect: true },
  focus: () => null,
  nudgeMs: MS_PER_DAY,
  formatTime: formatDate,
  resolvers: (preset) => ({
    element: (e) => ({
      lineColor: slotColor(preset, (e.data?.category ?? 0) + 1),
    }),
    event: (e) => ({
      arrowColor:
        e.data?.kind === 'streamed'
          ? preset.theme.emphasis.hoverColor
          : slotColor(preset, (e.data?.category ?? 0) + 1),
    }),
  }),
  describeEvent: (event, ctx) => ({
    ...describeEventDefault(event, ctx, formatDate),
    swatch: slotColor(ctx.preset, (event.data?.category ?? 0) + 1),
    subtitle: event.data?.kind === 'streamed' ? 'Streamed in' : 'Transfer',
  }),
  legend: (preset) => [
    ...preset.palette.series.map((color, i) => ({
      label: `Category ${i + 1}`,
      mark: 'line' as const,
      color,
    })),
    {
      label: 'Cluster / aggregate',
      mark: 'cluster' as const,
      color: preset.theme.cluster.color,
      detail: '×N nearby events of one pair',
    },
    {
      label: 'Streamed in',
      mark: 'arrow' as const,
      color: preset.theme.emphasis.hoverColor,
    },
  ],
  accessibility: {
    label: 'Synthetic scale timeline',
    description:
      'Thousands of synthetic transfers across hundreds of entities.',
  },
};
