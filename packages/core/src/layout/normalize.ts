// Guard a layout strategy's output (DESIGN.md §7).
//
// `LayoutStrategy.order` is host-pluggable, so its result is untrusted: an id it
// forgets would make that element (and its arrows) vanish, and a duplicated id
// would draw one element on two rows. Normalising here keeps the row model
// valid whatever a strategy returns.

export interface NormalizedOrder {
  ids: string[];
  /** Ids returned that aren't in the dataset (dropped). */
  unknown: number;
  /** Repeated ids (only the first occurrence kept). */
  duplicate: number;
  /** Dataset ids the strategy omitted (appended in input order). */
  missing: number;
}

/**
 * Keep the first occurrence of each known id in `order`, then append every id
 * of `expected` the strategy left out, in `expected` order.
 */
export function normalizeOrder(
  order: readonly string[],
  expected: readonly string[],
): NormalizedOrder {
  const known = new Set(expected);
  const placed = new Set<string>();
  const ids: string[] = [];
  let unknown = 0;
  let duplicate = 0;
  for (const id of order) {
    if (!known.has(id)) {
      unknown++;
    } else if (placed.has(id)) {
      duplicate++;
    } else {
      placed.add(id);
      ids.push(id);
    }
  }
  let missing = 0;
  for (const id of expected) {
    if (!placed.has(id)) {
      ids.push(id);
      missing++;
    }
  }
  return { ids, unknown, duplicate, missing };
}
