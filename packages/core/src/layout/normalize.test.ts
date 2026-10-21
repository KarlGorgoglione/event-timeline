import { describe, expect, it } from 'vitest';
import { normalizeOrder } from './normalize';

describe('normalizeOrder (§7)', () => {
  it('passes a valid order through unchanged', () => {
    expect(normalizeOrder(['b', 'a'], ['a', 'b'])).toEqual({
      ids: ['b', 'a'],
      unknown: 0,
      duplicate: 0,
      missing: 0,
    });
  });

  it('drops unknown ids and repeated ids', () => {
    expect(normalizeOrder(['a', 'x', 'a', 'b'], ['a', 'b'])).toEqual({
      ids: ['a', 'b'],
      unknown: 1,
      duplicate: 1,
      missing: 0,
    });
  });

  it('appends omitted ids in input order', () => {
    expect(normalizeOrder(['c'], ['a', 'b', 'c'])).toEqual({
      ids: ['c', 'a', 'b'],
      unknown: 0,
      duplicate: 0,
      missing: 2,
    });
  });
});
