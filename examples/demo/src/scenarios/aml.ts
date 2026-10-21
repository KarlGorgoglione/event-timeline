import { makeAmlScenario } from '../scenario';
import type { AmlPattern } from '../synthetic';
import { withAlpha } from '../ui/color';
import { MS_PER_DAY } from '../app/options';
import { formatDate, slotColor } from './common';
import type { DemoData, Scenario } from './types';

const START = Date.UTC(2026, 0, 1);

export interface PatternInfo {
  id: AmlPattern;
  label: string;
  /** Palette slot (matches `scenario.ts`). */
  category: number;
  /** Event id prefix in `makeAmlScenario`. */
  prefix: string;
  blurb: string;
}

export const PATTERNS: readonly PatternInfo[] = [
  {
    id: 'structuring',
    label: 'Structuring',
    category: 1,
    prefix: 'struct-',
    blurb: 'Ten deposits kept just under the $10,000 reporting threshold.',
  },
  {
    id: 'circular',
    label: 'Circular flow',
    category: 2,
    prefix: 'circ-',
    blurb: 'Funds cycle back to the originator through a ring of accounts.',
  },
  {
    id: 'passthrough',
    label: 'Pass-through',
    category: 3,
    prefix: 'pass-',
    blurb: 'A mule receives $250k and forwards ~95% of it within days.',
  },
  {
    id: 'fanout',
    label: 'Fan-out',
    category: 4,
    prefix: 'fan-',
    blurb: 'One account disperses funds to ten counterparties at once.',
  },
];

const KIND_LABEL: Record<string, string> = {
  client: 'Client',
  external: 'External counterparty',
  cash: 'Cash point',
};

/** The events, elements and time span of one pattern. */
export function patternSlice(data: DemoData, pattern: PatternInfo) {
  const events = data.events.filter((e) => e.id.startsWith(pattern.prefix));
  const elements = new Set<string>();
  let lo = Infinity;
  let hi = -Infinity;
  for (const e of events) {
    elements.add(e.sourceId);
    elements.add(e.targetId);
    lo = Math.min(lo, e.time);
    hi = Math.max(hi, e.time);
  }
  return {
    events: events.map((e) => e.id),
    elements: [...elements],
    range: [lo, hi] as const,
  };
}

export const aml: Scenario = {
  id: 'aml',
  short: 'AML',
  title: 'AML investigation',
  tagline: '100 entities · 500 payments · 4 hidden patterns',
  summary:
    'Transaction monitoring: a year of payments between clients, companies ' +
    'and cash points, with four money-laundering patterns hidden in the ' +
    'noise. Style resolvers colour them from the payload; a formatter keeps ' +
    'labels on the suspicious transfers only.',
  tryThis: [
    'Take the pattern tour below: each step zooms to a pattern and selects it.',
    'Flagged accounts sit on top: element.order with the explicit layout.',
    'Turn "Data colours" off in Quick controls to see the raw theme.',
    'Zoom out: nearby transfers between the same pair merge into ×N markers; click one to expand it.',
    'Ctrl/⌘-click lanes to build a multi-selection.',
  ],
  // Flagged entities get an explicit order, so the explicit layout pins them
  // to the top; everyone else follows by first event (§7).
  load: () => {
    const data = makeAmlScenario();
    let rank = 0;
    return {
      events: data.events,
      elements: data.elements.map((e) =>
        e.data?.pattern === undefined ? e : { ...e, order: rank++ },
      ),
    };
  },
  options: {
    multiSelect: true,
    layout: 'explicit',
    'lod.eventLabelPxPerDay': 10,
  },
  focus: () => [START + 95 * MS_PER_DAY, START + 262 * MS_PER_DAY],
  nudgeMs: MS_PER_DAY,
  formatTime: formatDate,
  resolvers: (preset) => ({
    element: (e) => ({
      lineColor:
        (e.data?.category ?? 0) > 0
          ? slotColor(preset, e.data?.category)
          : preset.palette.neutral,
    }),
    event: (e) => {
      const category = e.data?.category ?? 0;
      if (category === 0) {
        return { arrowColor: withAlpha(preset.palette.neutral, 0.85) };
      }
      const colour = slotColor(preset, category);
      return {
        arrowColor: colour,
        arrowWidth: preset.theme.event.arrowWidth + 0.5,
        labelBoxBorderColor: withAlpha(colour, 0.7),
      };
    },
  }),
  formatters: () => ({
    // Labels only on flagged transfers: returning undefined draws none (§11).
    eventLabel: (e) => (e.data?.pattern === undefined ? undefined : e.label),
  }),
  describeEvent: (event, ctx) => {
    const pattern = PATTERNS.find((p) => p.id === event.data?.pattern);
    return {
      title: event.label ?? event.id,
      subtitle: pattern ? 'Flagged payment' : 'Payment',
      ...(pattern && {
        badge: {
          text: pattern.label,
          color: slotColor(ctx.preset, pattern.category),
        },
      }),
      rows: [
        ['From', ctx.labelOf(event.sourceId)],
        ['To', ctx.labelOf(event.targetId)],
        ['When', formatDate(event.time)],
      ],
    };
  },
  describeElement: (element, ctx) => {
    const pattern = PATTERNS.find((p) => p.id === element.data?.pattern);
    return {
      title: element.label ?? element.id,
      subtitle: KIND_LABEL[element.data?.kind ?? ''] ?? 'Entity',
      ...(pattern && {
        badge: {
          text: pattern.label,
          color: slotColor(ctx.preset, pattern.category),
        },
      }),
      rows: [['id', element.id]],
    };
  },
  legend: (preset) => [
    {
      label: 'Background activity',
      mark: 'arrow',
      color: preset.palette.neutral,
    },
    ...PATTERNS.map((p) => ({
      label: p.label,
      mark: 'arrow' as const,
      color: slotColor(preset, p.category),
      detail: p.blurb,
    })),
    {
      label: 'Cluster',
      mark: 'cluster' as const,
      color: preset.theme.cluster.color,
      detail: 'nearby transfers, same pair; click to expand',
    },
  ],
  accessibility: {
    label: 'AML transaction timeline',
    description:
      'A year of payments between 100 entities with four flagged laundering patterns.',
  },
};
