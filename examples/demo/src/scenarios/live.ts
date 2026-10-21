import { withAlpha } from '../ui/color';
import { formatClock, slotColor, usd } from './common';
import { makeLiveHistory, makePaymentSource } from './data/live';
import type { Scenario } from './types';

const SECOND = 1000;

export const live: Scenario = {
  id: 'live',
  short: 'Live',
  title: 'Live payments',
  tagline: '9 rails · streaming in real time',
  summary:
    'Payments arrive as they happen: the page appends a batch with ' +
    'addEvents() several times a second, trims the oldest with ' +
    'removeEvents(), and keeps the view on "now". Rows stay put as new ' +
    'events land (stable-append streaming layout).',
  tryThis: [
    'Raise the rate in the Live card; the engine still draws only what changed.',
    'Turn "Follow now" off and scroll back in time while the stream keeps running.',
    'Switch the streaming layout to "full" to re-sort rows as traffic shifts.',
    'Blocked card payments are flagged red by the fraud screen.',
  ],
  load: () => makeLiveHistory(Date.now(), makePaymentSource(5, 'h'), 2),
  options: {
    multiSelect: true,
    'navigation.zoomMaxPxPerMinute': 900,
  },
  focus: (data) => {
    const end = data.events.at(-1)?.time ?? Date.now();
    return [end - 2 * 60 * SECOND, end + 8 * SECOND];
  },
  nudgeMs: 10 * SECOND,
  formatTime: formatClock,
  resolvers: (preset) => ({
    element: (e) => ({ lineColor: slotColor(preset, e.data?.category) }),
    event: (e) => {
      if (e.data?.kind === 'blocked') {
        return {
          arrowColor: preset.status.critical,
          arrowWidth: 2,
          labelBoxBorderColor: preset.status.critical,
        };
      }
      const colour = slotColor(preset, e.data?.category);
      return {
        arrowColor: colour,
        labelBoxBorderColor: withAlpha(colour, 0.6),
        ...((e.data?.amount ?? 0) >= 5000 && { arrowWidth: 2 }),
      };
    },
  }),
  describeEvent: (event, ctx) => ({
    title: usd(event.data?.amount ?? 0),
    subtitle: `${ctx.labelOf(event.sourceId)} → ${ctx.labelOf(event.targetId)}`,
    ...(event.data?.kind === 'blocked' && {
      badge: { text: 'Blocked', color: ctx.preset.status.critical },
    }),
    swatch: slotColor(ctx.preset, event.data?.category),
    rows: [['When', formatClock(event.time)]],
  }),
  describeElement: (element, ctx) => ({
    title: element.label ?? element.id,
    subtitle: 'Payment rail',
    swatch: slotColor(ctx.preset, element.data?.category),
    rows: [['id', element.id]],
  }),
  legend: (preset) => [
    { label: 'Payment', mark: 'arrow', color: slotColor(preset, 1) },
    {
      label: '≥ $5,000',
      mark: 'heavy',
      color: slotColor(preset, 2),
      detail: 'drawn heavier',
    },
    { label: 'Blocked', mark: 'heavy', color: preset.status.critical },
  ],
  accessibility: {
    label: 'Live payments timeline',
    description: 'Payments between nine rails, streamed in real time.',
  },
};
