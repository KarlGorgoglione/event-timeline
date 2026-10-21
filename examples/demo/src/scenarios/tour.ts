import { demoData } from '../fixture';
import { withAlpha } from '../ui/color';
import { MS_PER_DAY } from '../app/options';
import { describeEventDefault, formatDate, slotColor, usd } from './common';
import type { Scenario } from './types';

/** `$12,400` → `$12.4k`: the compact-amounts formatter. */
function compactAmount(label: string): string {
  const n = Number(label.replace(/[^0-9.]/g, ''));
  if (!label.startsWith('$') || !Number.isFinite(n)) return label;
  return n >= 1000 ? `$${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k` : usd(n);
}

export const tour: Scenario = {
  id: 'tour',
  short: 'Tour',
  title: 'Money-flow tour',
  tagline: '10 accounts · 24 transfers · Jan–Jun 2026',
  summary:
    'A hand-built network that touches every drawing feature: lanes with icon ' +
    'start markers, direction-aware arrows, a self-transfer loop, long ' +
    'crossings that hop over the lines in between, and labelled transfers.',
  tryThis: [
    'Hover an arrow to see the transfer; hover a lane to light up every transfer it touches.',
    'Click a lane to select it, then Ctrl/⌘-click another to add it.',
    'Drag the canvas: start markers stick to the left edge as their lanes scroll off.',
    'Ctrl/⌘ + scroll zooms about the cursor; Shift + scroll pans.',
    'Find the loop on Cash: a self-transfer (the fee).',
  ],
  load: () => demoData,
  options: { multiSelect: true, 'lod.eventLabelPxPerDay': 3 },
  focus: () => null,
  nudgeMs: MS_PER_DAY,
  formatTime: formatDate,
  resolvers: (preset) => ({
    element: (e) => ({
      lineColor: slotColor(preset, (e.data?.category ?? 0) + 1),
    }),
    event: (e) => {
      const colour = slotColor(preset, (e.data?.category ?? 0) + 1);
      return {
        arrowColor: colour,
        labelBoxBorderColor: withAlpha(colour, 0.6),
      };
    },
  }),
  formatters: () => ({
    eventLabel: (e) =>
      e.label === undefined ? undefined : compactAmount(e.label),
  }),
  describeEvent: (event, ctx) => ({
    ...describeEventDefault(event, ctx, formatDate),
    subtitle: event.sourceId === event.targetId ? 'Self-transfer' : 'Transfer',
    swatch: slotColor(ctx.preset, (event.data?.category ?? 0) + 1),
  }),
  describeElement: (element, ctx) => ({
    title: element.label ?? element.id,
    subtitle: element.id === 'cash' ? 'Bank' : 'Account',
    swatch: slotColor(ctx.preset, (element.data?.category ?? 0) + 1),
    rows: [['id', element.id]],
  }),
  legend: (preset) => [
    { label: 'Account (lane)', mark: 'line', color: slotColor(preset, 1) },
    {
      label: 'Transfer',
      mark: 'arrow',
      color: slotColor(preset, 2),
      detail: 'dot = sender, head = receiver',
    },
    {
      label: 'Self-transfer',
      mark: 'loop',
      color: slotColor(preset, 3),
    },
    {
      label: 'Crossing',
      mark: 'hop',
      color: preset.theme.event.arrowColor,
      detail: 'arrows hop over the lanes they cross',
    },
  ],
  accessibility: {
    label: 'Money-flow timeline',
    description:
      'Ten accounts exchanging 24 transfers between January and June 2026.',
  },
};
