// A three-hour production incident across a microservice estate: steady
// request traffic, a bad deploy, failing payment calls with retries, a page to
// the on-call engineer, a rollback and the recovery. Minute-scale data with
// glyph icons, so it exercises the fine end of the time header.

import { mulberry32 } from '../../synthetic';
import type { DemoData, DemoElement, DemoEvent } from '../types';

export const INCIDENT_START = Date.UTC(2026, 2, 14, 13, 30);
export const INCIDENT_END = Date.UTC(2026, 2, 14, 16, 30);
/** T+0: the bad deploy. Ticks are labelled relative to it. */
export const DEPLOY_AT = Date.UTC(2026, 2, 14, 14, 12);

const SECOND = 1000;
const MINUTE = 60 * SECOND;
/** When failures start and stop (the rollback lands at +26 min). */
const FAILING_FROM = DEPLOY_AT + 3 * MINUTE;
const FAILING_UNTIL = DEPLOY_AT + 27 * MINUTE;

export type Tier = 'edge' | 'service' | 'data' | 'ops';

export type IncidentKind =
  | 'call'
  | 'async'
  | 'error'
  | 'retry'
  | 'alert'
  | 'ack'
  | 'deploy'
  | 'rollback';

const SERVICES: ReadonlyArray<{
  id: string;
  label: string;
  icon: string;
  tier: Tier;
}> = [
  { id: 'edge', label: 'Edge CDN', icon: '🌐', tier: 'edge' },
  { id: 'gateway', label: 'API gateway', icon: '🚪', tier: 'edge' },
  { id: 'auth', label: 'Auth', icon: '🔐', tier: 'service' },
  { id: 'search', label: 'Search', icon: '🔎', tier: 'service' },
  { id: 'checkout', label: 'Checkout', icon: '🛒', tier: 'service' },
  { id: 'payments', label: 'Payments', icon: '💳', tier: 'service' },
  { id: 'orders', label: 'Orders', icon: '📦', tier: 'service' },
  { id: 'inventory', label: 'Inventory', icon: '🏷️', tier: 'service' },
  { id: 'postgres', label: 'Postgres', icon: '🐘', tier: 'data' },
  { id: 'redis', label: 'Redis', icon: '⚡', tier: 'data' },
  { id: 'kafka', label: 'Kafka', icon: '📨', tier: 'data' },
  { id: 'alerts', label: 'Alertmanager', icon: '🔔', tier: 'ops' },
  { id: 'oncall', label: 'On-call: Sam', icon: '📟', tier: 'ops' },
  { id: 'deploybot', label: 'Deploy bot', icon: '🤖', tier: 'ops' },
];

export const TIER_SLOT: Record<Tier, number> = {
  edge: 1,
  service: 3,
  data: 4,
  ops: 5,
};

/** Request flows, as hops `[from, to, kind]`. */
const FLOWS: ReadonlyArray<{
  weight: number;
  hops: ReadonlyArray<readonly [string, string, IncidentKind]>;
}> = [
  {
    weight: 0.4,
    hops: [
      ['edge', 'gateway', 'call'],
      ['gateway', 'checkout', 'call'],
      ['checkout', 'payments', 'call'],
      ['payments', 'postgres', 'call'],
      ['checkout', 'orders', 'call'],
      ['orders', 'kafka', 'async'],
      ['kafka', 'inventory', 'async'],
    ],
  },
  {
    weight: 0.35,
    hops: [
      ['edge', 'gateway', 'call'],
      ['gateway', 'search', 'call'],
      ['search', 'redis', 'call'],
    ],
  },
  {
    weight: 0.25,
    hops: [
      ['gateway', 'auth', 'call'],
      ['auth', 'redis', 'call'],
    ],
  },
];

function pickFlow(x: number): (typeof FLOWS)[number] {
  for (const flow of FLOWS) if ((x -= flow.weight) <= 0) return flow;
  return FLOWS[0]!;
}

export function makeIncident(seed = 7): DemoData {
  const rand = mulberry32(seed);
  const elements: DemoElement[] = SERVICES.map((s) => ({
    id: s.id,
    label: s.label,
    icon: s.icon,
    data: { tier: s.tier, category: TIER_SLOT[s.tier] },
  }));

  const events: DemoEvent[] = [];
  let n = 0;
  const push = (
    sourceId: string,
    targetId: string,
    time: number,
    kind: IncidentKind,
    extra: Partial<DemoEvent> = {},
  ) => {
    events.push({
      id: `${kind}-${n++}`,
      sourceId,
      targetId,
      time: Math.round(time),
      ...extra,
      data: {
        kind,
        latencyMs: Math.round(20 + rand() * (kind === 'error' ? 4000 : 180)),
        ...extra.data,
      },
    });
  };

  // Steady traffic: a flow every 40–80 s, its hops 1–4 s apart (a flow
  // lasts under 40 s, so the last one still ends inside the window).
  for (let t = INCIDENT_START + 20 * SECOND; t < INCIDENT_END - 40 * SECOND; ) {
    const flow = pickFlow(rand());
    let at = t;
    for (const [from, to, kind] of flow.hops) {
      at += SECOND + rand() * 3 * SECOND;
      const failing =
        at >= FAILING_FROM &&
        at < FAILING_UNTIL &&
        from === 'checkout' &&
        to === 'payments';
      if (failing && rand() < 0.7) {
        push(from, to, at, 'error', {
          label: rand() < 0.5 ? 'HTTP 502' : 'timeout',
          data: { status: '502' },
        });
        // The client retries, sometimes twice; payments' circuit breaker
        // probes itself (a self-event, drawn as a loop).
        at += 2 * SECOND;
        push(from, to, at, 'retry', { label: 'retry #1' });
        if (rand() < 0.4) {
          at += 3 * SECOND;
          push(from, to, at, 'retry', { label: 'retry #2' });
        }
        if (rand() < 0.3) {
          push('payments', 'payments', at + SECOND, 'retry', {
            label: 'breaker probe',
          });
        }
        break;
      }
      push(from, to, at, kind);
    }
    t += 40 * SECOND + rand() * 40 * SECOND;
  }

  // The incident's milestones, labelled.
  push('deploybot', 'checkout', DEPLOY_AT, 'deploy', {
    label: 'deploy v2.14.0',
  });
  push('alerts', 'oncall', DEPLOY_AT + 9.5 * MINUTE, 'alert', {
    label: 'PAGE checkout 5xx > 5%',
  });
  push('oncall', 'alerts', DEPLOY_AT + 11 * MINUTE, 'ack', { label: 'ack' });
  push('oncall', 'checkout', DEPLOY_AT + 15 * MINUTE, 'ack', {
    label: 'flag new-pricing off',
  });
  // A per-item style override (§11): the rollback is drawn heavier than any
  // resolver or theme would draw it.
  push('deploybot', 'checkout', DEPLOY_AT + 26 * MINUTE, 'rollback', {
    label: 'rollback → v2.13.2',
    style: { arrowWidth: 3, arrowheadSize: 9, labelBoxBorderWidth: 2 },
  });
  push('alerts', 'oncall', DEPLOY_AT + 33 * MINUTE, 'ack', {
    label: 'resolved',
  });

  return { elements, events };
}
