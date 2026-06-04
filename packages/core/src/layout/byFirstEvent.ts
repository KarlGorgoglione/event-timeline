// Default layout: order elements by the time of their first event (DESIGN.md §7).
//
// Predictable, stable, cheap. Event-less elements have no first-event key and
// sort after all elements that have events, in stable input order (§1).

import type { LayoutStrategy } from './types';

export const byFirstEvent: LayoutStrategy = {
  order(elements, events): string[] {
    const firstEventTime = new Map<string, number>();
    const note = (id: string, time: number) => {
      const current = firstEventTime.get(id);
      if (current === undefined || time < current) {
        firstEventTime.set(id, time);
      }
    };
    for (const event of events) {
      // An element's first event counts it as either endpoint.
      note(event.sourceId, event.time);
      if (event.targetId !== event.sourceId) note(event.targetId, event.time);
    }

    // Stable sort: ties and event-less elements keep input order; the explicit
    // index tiebreak documents that intent.
    return elements
      .map((element, index) => ({
        id: element.id,
        index,
        key: firstEventTime.get(element.id),
      }))
      .sort((a, b) => {
        if (a.key !== undefined && b.key !== undefined) {
          return a.key !== b.key ? a.key - b.key : a.index - b.index;
        }
        if (a.key !== undefined) return -1; // elements with events sort first
        if (b.key !== undefined) return 1;
        return a.index - b.index; // both event-less: stable input order
      })
      .map((entry) => entry.id);
  },
};
