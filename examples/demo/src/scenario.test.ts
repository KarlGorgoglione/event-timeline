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
