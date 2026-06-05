// Stable-append ordering for streaming updates (DESIGN.md §7, §10).
//
// During streaming the default is *stable append*: existing rows keep their
// position (no jarring reshuffle) and newly-arrived elements slot in at the end.
// Unlike a `LayoutStrategy`, this needs the *prior* order, so it lives beside the
// strategies as an engine helper rather than implementing the pure
// `order(elements, events)` seam (§7 SRP).

import type { TimelineElement } from '../model/types';

/**
 * Merge `elements` onto a `priorOrder`: keep the prior ids that still exist in
 * their existing order, then append current ids not already placed, in element
 * input order. Pure — ids vanished from `elements` are dropped. A full re-layout
 * is the opt-in alternative (re-run the configured `LayoutStrategy`).
 */
export function stableAppend(
  priorOrder: readonly string[],
  elements: readonly TimelineElement[],
): string[] {
  const current = new Set(elements.map((element) => element.id));
  const placed = new Set<string>();
  const order: string[] = [];
  for (const id of priorOrder) {
    if (current.has(id) && !placed.has(id)) {
      order.push(id);
      placed.add(id);
    }
  }
  for (const element of elements) {
    if (!placed.has(element.id)) {
      order.push(element.id);
      placed.add(element.id);
    }
  }
  return order;
}
