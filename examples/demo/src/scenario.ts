import type {
  TimelineData,
  TimelineElement,
  TimelineEvent,
} from '@timeline/react';
import type { AmlPattern, DemoDatum } from './synthetic';

// A deterministic client/counterparty transaction-monitoring dataset (~100
// entities, ~500 payments) with four labelled AML patterns embedded in it
// (DESIGN.md §11/§12 customisation surfaces; spec
// docs/superpowers/specs/2026-06-05-aml-scenario-design.md). A seeded PRNG keeps
// it reproducible across the demo and the unit tests.

const DAY_MS = 86_400_000;
const START = Date.UTC(2026, 0, 1);
/** The structuring threshold the smurfing pattern deliberately stays under. */
const THRESHOLD = 10_000;

/** Colour bucket per pattern; 0 = background. Drives the demo's paletteColor (§11). */
const PATTERN_CATEGORY: Record<AmlPattern, number> = {
  structuring: 1,
  circular: 2,
  passthrough: 3,
  fanout: 4,
};

/** Mulberry32 — a tiny deterministic 32-bit PRNG (mirrors synthetic.ts). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** USD label with thousands separators (locale-independent → test-stable). */
function usd(n: number): string {
  return '$' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

const EXTERNAL_NAMES = [
  'Globex', 'Initech', 'Umbrella', 'Soylent', 'Hooli',
  'Vehement', 'Massive Dynamic', 'Wonka', 'Stark Industries',
  'Wayne Enterprises', 'Cyberdyne', 'Tyrell Corp', 'Acme',
  'Gekko Capital', 'Oceanic', 'Nakatomi', 'Bluth Co', 'Pied Piper',
  'Vandelay', 'Prestige WW', 'Sterling Cooper', 'Dunder Mifflin',
  'Los Pollos', 'Genco', 'Oscorp',
];

const CASH_NAMES = [
  'ATM Downtown', 'ATM Airport', 'ATM Mall', 'Cash Desk B1',
  'Cash Desk B2', 'Cash Desk B3', 'FX Kiosk', 'Casino Royale',
  'Money Service A', 'Money Service B', 'ATM Station', 'ATM Harbour',
  'Cash Desk B4', 'Bureau de Change', 'ATM Uptown',
];

/** Element-id pools by kind, used to wire up payments. */
interface Pools {
  clients: string[];
  external: string[];
  cash: string[];
}

function makeEntities(): {
  elements: TimelineElement<DemoDatum>[];
  pools: Pools;
} {
  const elements: TimelineElement<DemoDatum>[] = [];
  const clients: string[] = [];
  const external: string[] = [];
  const cash: string[] = [];

  for (let i = 0; i < 60; i++) {
    const id = `cl-${i}`;
    clients.push(id);
    elements.push({
      id,
      label: `Client ${i.toString().padStart(2, '0')}`,
      data: { category: 0, kind: 'client' },
    });
  }
  for (let i = 0; i < EXTERNAL_NAMES.length; i++) {
    const id = `ext-${i}`;
    external.push(id);
    elements.push({
      id,
      label: `Ext: ${EXTERNAL_NAMES[i]!}`,
      data: { category: 0, kind: 'external' },
    });
  }
  for (let i = 0; i < CASH_NAMES.length; i++) {
    const id = `cash-${i}`;
    cash.push(id);
    elements.push({
      id,
      label: `Cash: ${CASH_NAMES[i]!}`,
      data: { category: 0, kind: 'cash' },
    });
  }

  return { elements, pools: { clients, external, cash } };
}

/** Flag an actor element: vivid label + pattern colour bucket + tag. */
function flagActor(
  elements: TimelineElement<DemoDatum>[],
  id: string,
  label: string,
  pattern: AmlPattern,
): void {
  const el = elements.find((e) => e.id === id);
  if (el === undefined) return;
  el.label = label;
  el.data = {
    category: PATTERN_CATEGORY[pattern],
    kind: el.data?.kind,
    pattern,
  };
}

/**
 * Structuring / smurfing: one client receives ~10 sub-threshold payments from
 * many distinct counterparties inside a 5-day window (a fan-in burst).
 */
function addStructuring(
  elements: TimelineElement<DemoDatum>[],
  events: TimelineEvent<DemoDatum>[],
  pools: Pools,
  rand: () => number,
): void {
  const target = pools.clients[0]!;
  flagActor(elements, target, '⚠ Smurf-Target', 'structuring');
  const windowStart = START + 100 * DAY_MS;
  for (let i = 0; i < 10; i++) {
    const amount = THRESHOLD - 1000 + Math.floor(rand() * 900); // 9000–9899
    events.push({
      id: `struct-${i}`,
      sourceId: pools.external[i]!, // ext-0 … ext-9, distinct
      targetId: target,
      time: windowStart + Math.floor(rand() * 5 * DAY_MS),
      label: usd(amount),
      data: { category: PATTERN_CATEGORY.structuring, pattern: 'structuring' },
    });
  }
}

/**
 * Circular / round-tripping: a 4-hop loop A→B→C→D→A of large transfers over
 * ~2 weeks, funds returning to the origin (layering).
 */
function addCircular(
  elements: TimelineElement<DemoDatum>[],
  events: TimelineEvent<DemoDatum>[],
  pools: Pools,
  rand: () => number,
): void {
  const ring = [
    pools.clients[1]!,
    pools.clients[2]!,
    pools.clients[3]!,
    pools.clients[4]!,
  ];
  ring.forEach((id, i) => flagActor(elements, id, `⚠ Ring-${i + 1}`, 'circular'));
  const base = START + 150 * DAY_MS;
  for (let i = 0; i < ring.length; i++) {
    const amount = 80_000 + Math.floor(rand() * 40_000);
    events.push({
      id: `circ-${i}`,
      sourceId: ring[i]!,
      targetId: ring[(i + 1) % ring.length]!, // last hop → back to ring[0]
      time: base + i * 4 * DAY_MS + Math.floor(rand() * DAY_MS),
      label: usd(amount),
      data: { category: PATTERN_CATEGORY.circular, pattern: 'circular' },
    });
  }
}

/**
 * Rapid pass-through: a mule receives one large sum then moves ~95% of it out
 * to a few destinations within days (in-then-out layering).
 */
function addPassthrough(
  elements: TimelineElement<DemoDatum>[],
  events: TimelineEvent<DemoDatum>[],
  pools: Pools,
  rand: () => number,
): void {
  const mule = pools.clients[5]!;
  flagActor(elements, mule, '⚠ Mule-A', 'passthrough');
  const inflow = 250_000;
  const inTime = START + 200 * DAY_MS;
  events.push({
    id: 'pass-in',
    sourceId: pools.external[10]!,
    targetId: mule,
    time: inTime,
    label: usd(inflow),
    data: { category: PATTERN_CATEGORY.passthrough, pattern: 'passthrough' },
  });
  const outs = [pools.external[11]!, pools.external[12]!, pools.external[13]!];
  const split = [0.4, 0.35, 0.2]; // 95% dispersed
  for (let i = 0; i < outs.length; i++) {
    events.push({
      id: `pass-out-${i}`,
      sourceId: mule,
      targetId: outs[i]!,
      time: inTime + (1 + i) * DAY_MS + Math.floor(rand() * DAY_MS),
      label: usd(inflow * split[i]!),
      data: { category: PATTERN_CATEGORY.passthrough, pattern: 'passthrough' },
    });
  }
}

/**
 * Fan-out / dispersal: one entity sends to ~10 counterparties within a day or
 * two (one-to-many dispersal).
 */
function addFanout(
  elements: TimelineElement<DemoDatum>[],
  events: TimelineEvent<DemoDatum>[],
  pools: Pools,
  rand: () => number,
): void {
  const disperser = pools.clients[6]!;
  flagActor(elements, disperser, '⚠ Disperser', 'fanout');
  const targets = [...pools.cash.slice(0, 5), ...pools.external.slice(14, 19)];
  const base = START + 250 * DAY_MS;
  for (let i = 0; i < targets.length; i++) {
    const amount = 5_000 + Math.floor(rand() * 20_000);
    events.push({
      id: `fan-${i}`,
      sourceId: disperser,
      targetId: targets[i]!,
      time: base + Math.floor(rand() * 2 * DAY_MS),
      label: usd(amount),
      data: { category: PATTERN_CATEGORY.fanout, pattern: 'fanout' },
    });
  }
}

export function makeAmlScenario(seed = 1): TimelineData<DemoDatum> {
  const rand = mulberry32(seed);
  const { elements, pools } = makeEntities();
  const events: TimelineEvent<DemoDatum>[] = [];
  addStructuring(elements, events, pools, rand);
  addCircular(elements, events, pools, rand);
  addPassthrough(elements, events, pools, rand);
  addFanout(elements, events, pools, rand);
  return { elements, events };
}
