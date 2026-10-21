import type { EventStyle, TickLevel } from '@event-timeline/react';
import { withAlpha } from '../ui/color';
import type { ThemePreset } from '../themes/presets';
import {
  DEPLOY_AT,
  TIER_SLOT,
  makeIncident,
  type IncidentKind,
  type Tier,
} from './data/incident';
import { formatClock, slotColor } from './common';
import type { Scenario } from './types';

const MINUTE = 60_000;

const KINDS: Record<IncidentKind, string> = {
  call: 'Request',
  async: 'Async message',
  error: 'Failed request',
  retry: 'Retry',
  alert: 'Page',
  ack: 'Operator action',
  deploy: 'Deploy',
  rollback: 'Rollback',
};

const TIERS: Record<Tier, string> = {
  edge: 'Edge',
  service: 'Service',
  data: 'Data store',
  ops: 'Operations',
};

function kindColor(preset: ThemePreset, kind: IncidentKind | undefined) {
  const { status } = preset;
  switch (kind) {
    case 'error':
      return status.critical;
    case 'retry':
      return status.warning;
    case 'alert':
      return status.serious;
    case 'deploy':
    case 'rollback':
      return status.good;
    case 'ack':
      return slotColor(preset, 1);
    default:
      return preset.theme.event.arrowColor;
  }
}

function kindStyle(
  preset: ThemePreset,
  kind: IncidentKind | undefined,
): Partial<EventStyle> {
  if (kind === undefined || kind === 'call') return {};
  if (kind === 'async') return { arrowDash: [1, 3] };
  const colour = kindColor(preset, kind);
  return {
    arrowColor: colour,
    labelBoxBorderColor: withAlpha(colour, 0.75),
    ...(kind === 'retry' && { arrowDash: [5, 3] }),
    ...(kind === 'alert' && { arrowWidth: 2.5 }),
    ...((kind === 'deploy' || kind === 'error') && { arrowWidth: 1.75 }),
  };
}

const hhmm = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'UTC',
});
const dayFmt = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});

/** Minor ticks count from the deploy (`T+0:15`); major ticks keep the clock. */
export function incidentTick(
  date: Date,
  level: TickLevel,
  row: 'major' | 'minor',
): string {
  const t = date.getTime();
  if (row === 'minor' && (level === 'minute' || level === 'hour')) {
    const minutes = Math.round((t - DEPLOY_AT) / MINUTE);
    const abs = Math.abs(minutes);
    const sign = minutes < 0 ? '−' : '+';
    return `T${sign}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, '0')}`;
  }
  if (level === 'minute' || level === 'hour') return `${hhmm.format(t)} UTC`;
  if (level === 'day') return dayFmt.format(t);
  return String(date.getUTCFullYear());
}

export const incident: Scenario = {
  id: 'incident',
  short: 'Incident',
  title: 'Checkout incident',
  tagline: '14 services · 3 hours · minute-level detail',
  summary:
    'A production incident, request by request: a bad deploy at T+0, ' +
    'payment calls start failing and retrying, the on-call engineer is ' +
    'paged, and a rollback restores service. A custom tick formatter counts ' +
    'minutes from the deploy; labels sit at the source of each arrow.',
  tryThis: [
    'Follow T+0 → T+26: deploy (green), failures (red), retries (dashed), page, rollback.',
    'Spot the loops on Payments: the circuit breaker probing itself.',
    'The rollback is drawn heavier by a per-item style override.',
    'Zoom in past a minute per 200 px: the zoom limit is raised for this scenario.',
  ],
  load: () => makeIncident(),
  options: {
    multiSelect: true,
    'labels.placement': 'sourceNode',
    'navigation.zoomMaxPxPerMinute': 240,
  },
  focus: () => [DEPLOY_AT - 6 * MINUTE, DEPLOY_AT + 40 * MINUTE],
  nudgeMs: 30_000,
  formatTime: formatClock,
  resolvers: (preset) => ({
    element: (e) => ({
      lineColor: slotColor(preset, TIER_SLOT[e.data?.tier as Tier] ?? 0),
    }),
    event: (e) => kindStyle(preset, e.data?.kind as IncidentKind | undefined),
  }),
  formatters: () => ({ tickLabel: incidentTick }),
  describeEvent: (event, ctx) => {
    const kind = event.data?.kind as IncidentKind | undefined;
    return {
      title: event.label ?? KINDS[kind ?? 'call'],
      subtitle: `${ctx.labelOf(event.sourceId)} → ${ctx.labelOf(event.targetId)}`,
      badge: {
        text: KINDS[kind ?? 'call'],
        color: kindColor(ctx.preset, kind),
      },
      rows: [
        ['When', formatClock(event.time)],
        ['T', incidentTick(new Date(event.time), 'minute', 'minor')],
        ...(event.data?.latencyMs === undefined
          ? []
          : [['Latency', `${event.data.latencyMs} ms`] as const]),
      ],
    };
  },
  describeElement: (element, ctx) => {
    const tier = element.data?.tier as Tier | undefined;
    return {
      title: element.label ?? element.id,
      subtitle: tier ? TIERS[tier] : 'Service',
      swatch: slotColor(ctx.preset, tier ? TIER_SLOT[tier] : 0),
      rows: [['id', element.id]],
    };
  },
  legend: (preset) => [
    ...(Object.keys(TIERS) as Tier[]).map((tier) => ({
      label: TIERS[tier],
      mark: 'line' as const,
      color: slotColor(preset, TIER_SLOT[tier]),
    })),
    { label: 'Request', mark: 'arrow', color: preset.theme.event.arrowColor },
    {
      label: 'Async message',
      mark: 'dotted',
      color: preset.theme.event.arrowColor,
    },
    { label: 'Failed request', mark: 'arrow', color: preset.status.critical },
    { label: 'Retry', mark: 'dashed', color: preset.status.warning },
    { label: 'Page', mark: 'heavy', color: preset.status.serious },
    { label: 'Deploy · rollback', mark: 'heavy', color: preset.status.good },
    {
      label: 'Breaker probe',
      mark: 'loop',
      color: preset.status.warning,
      detail: 'a self-event',
    },
  ],
  accessibility: {
    label: 'Incident timeline',
    description:
      'Three hours of service-to-service calls around a failed deploy and its rollback.',
  },
};
