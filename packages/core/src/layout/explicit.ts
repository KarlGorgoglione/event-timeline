// Explicit/pinned layout: honour `element.order` exactly (DESIGN.md §7, §1).
//
// Host-controlled ordering — the hook a future drag-to-reorder feature would
// write into. Elements carrying a finite numeric `order` are placed first, in
// ascending `order` (stable on input position for ties). Elements without an
// `order` hint have no pin, so they fall back to the default chronological
// `byFirstEvent` order and follow the pinned block (reuse — DRY).

import { byFirstEvent } from './byFirstEvent';
import type { LayoutStrategy } from './types';
import type { TimelineElement } from '../model/types';

export const explicit: LayoutStrategy = {
  order(elements, events): string[] {
    const pinned: { id: string; order: number; index: number }[] = [];
    const unpinned: TimelineElement[] = [];
    for (let index = 0; index < elements.length; index++) {
      const element = elements[index]!;
      if (Number.isFinite(element.order)) {
        pinned.push({ id: element.id, order: element.order!, index });
      } else {
        unpinned.push(element);
      }
    }

    pinned.sort((a, b) =>
      a.order !== b.order ? a.order - b.order : a.index - b.index,
    );

    return [
      ...pinned.map((entry) => entry.id),
      ...byFirstEvent.order(unpinned, events),
    ];
  },
};
