import { describe, expect, it } from 'vitest';
import { byFirstEvent } from './byFirstEvent';
import type { TimelineElement, TimelineEvent } from '../model/types';

const el = (id: string): TimelineElement => ({ id, label: id });
const ev = (
  id: string,
  sourceId: string,
  targetId: string,
  time: number,
): TimelineEvent => ({ id, sourceId, targetId, time });

describe('byFirstEvent', () => {
  it('orders elements by their first-event time ascending', () => {
    const elements = [el('a'), el('b'), el('c')];
    const events = [
      ev('e1', 'a', 'b', 300),
      ev('e2', 'b', 'c', 200),
      ev('e3', 'c', 'a', 100),
    ];
    // first events: a@100 (c→a), b@200, c@100 (b→c) → a & c tie @100,
    // a precedes c by input order; b last.
    expect(byFirstEvent.order(elements, events)).toEqual(['a', 'c', 'b']);
  });

  it('keys an element that appears only as a target', () => {
    const elements = [el('src'), el('dst')];
    const events = [ev('e1', 'src', 'dst', 10)];
    // both keyed at 10 → stable input order
    expect(byFirstEvent.order(elements, events)).toEqual(['src', 'dst']);
  });

  it('sorts event-less elements last in stable input order', () => {
    const elements = [el('lonely1'), el('connected'), el('lonely2')];
    const events = [ev('e1', 'connected', 'connected', 5)];
    expect(byFirstEvent.order(elements, events)).toEqual([
      'connected',
      'lonely1',
      'lonely2',
    ]);
  });

  it('breaks ties by stable input order', () => {
    const elements = [el('x'), el('y'), el('z')];
    const events = [
      ev('e1', 'z', 'z', 100),
      ev('e2', 'y', 'y', 100),
      ev('e3', 'x', 'x', 100),
    ];
    expect(byFirstEvent.order(elements, events)).toEqual(['x', 'y', 'z']);
  });
});
