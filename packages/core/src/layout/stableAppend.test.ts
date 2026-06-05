import { describe, expect, it } from 'vitest';
import { stableAppend } from './stableAppend';
import type { TimelineElement } from '../model/types';

const el = (id: string): TimelineElement => ({ id, label: id });

describe('stableAppend (§7, §10)', () => {
  it('keeps the prior order and appends new elements at the end', () => {
    const prior = ['a', 'b'];
    const elements = [el('a'), el('b'), el('c'), el('d')];
    expect(stableAppend(prior, elements)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('does not reshuffle existing rows even when input order differs', () => {
    const prior = ['b', 'a'];
    const elements = [el('a'), el('b'), el('c')];
    // 'b','a' is preserved; only the genuinely new 'c' appends.
    expect(stableAppend(prior, elements)).toEqual(['b', 'a', 'c']);
  });

  it('appends new elements in input order', () => {
    const elements = [el('x'), el('y'), el('z')];
    expect(stableAppend([], elements)).toEqual(['x', 'y', 'z']);
  });

  it('drops prior ids that are no longer present', () => {
    const prior = ['a', 'gone', 'b'];
    const elements = [el('a'), el('b')];
    expect(stableAppend(prior, elements)).toEqual(['a', 'b']);
  });

  it('is idempotent once every element is placed', () => {
    const elements = [el('a'), el('b'), el('c')];
    const once = stableAppend(['a', 'b'], elements);
    expect(stableAppend(once, elements)).toEqual(once);
  });
});
