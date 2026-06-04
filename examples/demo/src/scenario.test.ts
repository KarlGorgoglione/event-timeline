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
