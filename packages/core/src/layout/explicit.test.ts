import { describe, expect, it } from 'vitest';
import { explicit } from './explicit';
import { byFirstEvent } from './byFirstEvent';
import type { TimelineElement, TimelineEvent } from '../model/types';

const el = (id: string, order?: number): TimelineElement => ({
  id,
  label: id,
  ...(order !== undefined ? { order } : {}),
});
const ev = (
  id: string,
  sourceId: string,
  targetId: string,
  time: number,
): TimelineEvent => ({ id, sourceId, targetId, time });

describe('explicit', () => {
  it('orders pinned elements by ascending `order`', () => {
    const elements = [el('a', 2), el('b', 0), el('c', 1)];
    expect(explicit.order(elements, [])).toEqual(['b', 'c', 'a']);
  });

  it('breaks `order` ties by stable input position', () => {
    const elements = [el('x', 5), el('y', 5), el('z', 5)];
    expect(explicit.order(elements, [])).toEqual(['x', 'y', 'z']);
  });

  it('places pinned elements before unpinned ones', () => {
    const elements = [el('free'), el('pinned', 0)];
    const events = [ev('e1', 'free', 'free', 10)];
    expect(explicit.order(elements, events)).toEqual(['pinned', 'free']);
  });

  it('orders the unpinned remainder by byFirstEvent', () => {
    const elements = [el('late'), el('early'), el('pinned', 0)];
    const events = [
      ev('e1', 'late', 'late', 200),
      ev('e2', 'early', 'early', 100),
    ];
    // pinned first; remainder follows chronological introduction (early < late).
    expect(explicit.order(elements, events)).toEqual([
      'pinned',
      'early',
      'late',
    ]);
  });

  it('equals byFirstEvent when no element is pinned', () => {
    const elements = [el('a'), el('b'), el('c')];
    const events = [ev('e1', 'b', 'a', 50), ev('e2', 'c', 'c', 10)];
    expect(explicit.order(elements, events)).toEqual(
      byFirstEvent.order(elements, events),
    );
  });

  it('honours order 0 and negative order as pins', () => {
    // `Number.isFinite` gates pinning, so 0 and negatives are real pins (not
    // mistaken for "unset"); ascending order puts the most-negative first.
    const elements = [el('a', 0), el('b', -5), el('c', 3)];
    expect(explicit.order(elements, [])).toEqual(['b', 'a', 'c']);
  });

  it('treats NaN and non-finite order as unpinned', () => {
    // NaN is not finite, so it must not pin; the element falls back to the
    // chronological remainder behind the genuine pin.
    const elements = [el('nan', Number.NaN), el('pinned', 1)];
    const events = [ev('e1', 'nan', 'nan', 10)];
    expect(explicit.order(elements, events)).toEqual(['pinned', 'nan']);
  });
});
