import { describe, expect, it } from 'vitest';
import { makeAmlScenario } from './scenario';

describe('makeAmlScenario — entities', () => {
  it('builds 100 elements across the three kinds', () => {
    const { elements } = makeAmlScenario();
    expect(elements).toHaveLength(100);

    const kinds = elements.map((e) => e.data?.kind);
    expect(kinds.filter((k) => k === 'client')).toHaveLength(60);
    expect(kinds.filter((k) => k === 'external')).toHaveLength(25);
    expect(kinds.filter((k) => k === 'cash')).toHaveLength(15);
  });

  it('gives every element a unique id', () => {
    const { elements } = makeAmlScenario();
    const ids = new Set(elements.map((e) => e.id));
    expect(ids.size).toBe(elements.length);
  });
});

/** Parse a `usd()` label back to a number for amount assertions. */
function amountOf(label: string | undefined): number {
  return Number((label ?? '').replace(/[$,]/g, ''));
}

describe('makeAmlScenario — structuring', () => {
  it('fans many sub-threshold payments into one target', () => {
    const { events } = makeAmlScenario();
    const struct = events.filter((e) => e.id.startsWith('struct-'));
    expect(struct).toHaveLength(10);

    // All into one target, from distinct sources.
    const targets = new Set(struct.map((e) => e.targetId));
    expect(targets.size).toBe(1);
    const sources = new Set(struct.map((e) => e.sourceId));
    expect(sources.size).toBe(10);

    // Every payment is under the $10,000 reporting threshold, and tagged.
    for (const e of struct) {
      expect(amountOf(e.label)).toBeLessThan(10_000);
      expect(e.data?.pattern).toBe('structuring');
    }
  });
});

describe('makeAmlScenario — circular', () => {
  it('forms a loop that returns to the origin', () => {
    const { events } = makeAmlScenario();
    const ring = events.filter((e) => e.id.startsWith('circ-'));
    expect(ring).toHaveLength(4);

    // circ-0 … circ-3 in push order; the last hop targets the first source.
    const first = ring[0]!;
    const last = ring[ring.length - 1]!;
    expect(last.targetId).toBe(first.sourceId);

    for (const e of ring) expect(e.data?.pattern).toBe('circular');
  });
});

describe('makeAmlScenario — pass-through', () => {
  it('moves most of a large inflow straight back out', () => {
    const { events } = makeAmlScenario();
    const inflow = events.find((e) => e.id === 'pass-in');
    const outflows = events.filter((e) => e.id.startsWith('pass-out-'));
    expect(inflow).toBeDefined();
    expect(outflows).toHaveLength(3);

    const mule = inflow!.targetId;
    // All outflows leave the same mule, soon after the inflow.
    for (const e of outflows) {
      expect(e.sourceId).toBe(mule);
      expect(e.time).toBeGreaterThan(inflow!.time);
      expect(e.data?.pattern).toBe('passthrough');
    }

    // ~95% of the inflow is dispersed.
    const inAmt = amountOf(inflow!.label);
    const outAmt = outflows.reduce((s, e) => s + amountOf(e.label), 0);
    expect(outAmt / inAmt).toBeGreaterThan(0.9);
    expect(outAmt / inAmt).toBeLessThanOrEqual(1);
  });
});

describe('makeAmlScenario — fan-out', () => {
  it('sends from one source to many distinct targets', () => {
    const { events } = makeAmlScenario();
    const fan = events.filter((e) => e.id.startsWith('fan-'));
    expect(fan).toHaveLength(10);

    const sources = new Set(fan.map((e) => e.sourceId));
    expect(sources.size).toBe(1);
    const targets = new Set(fan.map((e) => e.targetId));
    expect(targets.size).toBe(10);

    for (const e of fan) expect(e.data?.pattern).toBe('fanout');
  });
});

describe('makeAmlScenario — dataset', () => {
  it('produces ~500 events and all four patterns', () => {
    const { events } = makeAmlScenario();
    expect(events).toHaveLength(500);

    const patterns = new Set(
      events.flatMap((e) => (e.data?.pattern ? [e.data.pattern] : [])),
    );
    expect(patterns).toEqual(
      new Set(['structuring', 'circular', 'passthrough', 'fanout']),
    );
  });

  it('references only real element ids', () => {
    const { elements, events } = makeAmlScenario();
    const ids = new Set(elements.map((e) => e.id));
    for (const e of events) {
      expect(ids.has(e.sourceId)).toBe(true);
      expect(ids.has(e.targetId)).toBe(true);
    }
  });

  it('gives every event a unique id', () => {
    const { events } = makeAmlScenario();
    expect(new Set(events.map((e) => e.id)).size).toBe(events.length);
  });

  it('is deterministic for a given seed', () => {
    expect(makeAmlScenario(7)).toEqual(makeAmlScenario(7));
  });
});
