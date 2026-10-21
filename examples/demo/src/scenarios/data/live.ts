// Real-time payment traffic: a few minutes of history ending at `now`, then
// batches streamed in by the Live scenario (DESIGN.md §10).

import { mulberry32 } from '../../synthetic';
import type { DemoData, DemoElement, DemoEvent } from '../types';

const RAILS: ReadonlyArray<readonly [id: string, label: string, icon: string]> =
  [
    ['card', 'Card network', '💳'],
    ['wallet', 'Wallets', '👛'],
    ['merchants', 'Merchants', '🛍️'],
    ['ach', 'ACH', '🏦'],
    ['swift', 'SWIFT', '🌍'],
    ['fx', 'FX desk', '💱'],
    ['fraud', 'Fraud screen', '🛡️'],
    ['treasury', 'Treasury', '🏛️'],
    ['ledger', 'Ledger', '📒'],
  ];

/** Common routes and their relative weights. */
const ROUTES: ReadonlyArray<readonly [string, string, number]> = [
  ['card', 'merchants', 5],
  ['wallet', 'merchants', 3],
  ['merchants', 'ledger', 3],
  ['card', 'fraud', 2],
  ['fraud', 'card', 1],
  ['merchants', 'ach', 1.5],
  ['ach', 'treasury', 1],
  ['swift', 'fx', 1],
  ['fx', 'treasury', 1],
  ['treasury', 'ledger', 1],
  ['ledger', 'ledger', 0.3],
];
const ROUTE_TOTAL = ROUTES.reduce((s, r) => s + r[2], 0);

export const LIVE_HISTORY_MS = 6 * 60_000;

export function liveElements(): DemoElement[] {
  return RAILS.map(([id, label, icon], i) => ({
    id,
    label,
    icon,
    data: { category: (i % 5) + 1 },
  }));
}

/** A seeded generator of payment events; ids (`<prefix>-n`) continue across calls. */
export function makePaymentSource(seed = 5, prefix = 'pay') {
  const rand = mulberry32(seed);
  let next = 0;
  const pickRoute = () => {
    let x = rand() * ROUTE_TOTAL;
    for (const route of ROUTES) if ((x -= route[2]) <= 0) return route;
    return ROUTES[0]!;
  };
  const one = (time: number): DemoEvent => {
    const [sourceId, targetId] = pickRoute();
    const blocked = sourceId === 'card' && targetId === 'fraud' && rand() < 0.3;
    // Log-normal-ish amounts: mostly small, the occasional large one.
    const amount = Math.round(Math.exp(2 + rand() * 6.5));
    const big = amount >= 5000;
    return {
      id: `${prefix}-${next++}`,
      sourceId,
      targetId,
      time: Math.round(time),
      label: blocked
        ? 'blocked'
        : big
          ? `$${amount.toLocaleString('en-US')}`
          : undefined,
      data: {
        kind: blocked ? 'blocked' : 'payment',
        amount,
        category: (RAILS.findIndex(([id]) => id === sourceId) % 5) + 1,
      },
    };
  };
  return {
    /** `count` events spread over `[from, to)`, in time order. */
    batch(count: number, from: number, to: number): DemoEvent[] {
      const times = Array.from(
        { length: count },
        () => from + rand() * (to - from),
      ).sort((a, b) => a - b);
      return times.map(one);
    },
  };
}

export type PaymentSource = ReturnType<typeof makePaymentSource>;

/** History ending at `now`, about `perSecond` payments a second. */
export function makeLiveHistory(
  now: number,
  source: PaymentSource,
  perSecond = 3,
): DemoData {
  const from = now - LIVE_HISTORY_MS;
  return {
    elements: liveElements(),
    events: source.batch(
      Math.round((LIVE_HISTORY_MS / 1000) * perSecond),
      from,
      now,
    ),
  };
}
