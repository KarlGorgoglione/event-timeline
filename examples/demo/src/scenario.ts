import type {
  TimelineData,
  TimelineElement,
  TimelineEvent,
} from '@timeline/react';
import type { DemoDatum } from './synthetic';

// A deterministic client/counterparty transaction-monitoring dataset (~100
// entities, ~500 payments) with four labelled AML patterns embedded in it
// (DESIGN.md §11/§12 customisation surfaces; spec
// docs/superpowers/specs/2026-06-05-aml-scenario-design.md). A seeded PRNG keeps
// it reproducible across the demo and the unit tests.

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

export function makeAmlScenario(_seed = 1): TimelineData<DemoDatum> {
  // `_seed` is unused until Task 2 wires in the seeded PRNG (underscore prefix
  // satisfies the repo's no-unused-vars rule). `pools` is intentionally not
  // destructured yet — the pattern layers in later tasks consume it.
  const { elements } = makeEntities();
  const events: TimelineEvent<DemoDatum>[] = [];
  return { elements, events };
}
