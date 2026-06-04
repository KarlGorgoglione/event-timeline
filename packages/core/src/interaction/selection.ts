// Pure selection-state transition (DESIGN.md §9).
//
// Click selection is a pure function of the current selection, the clicked id
// (or null for an empty click), the modifiers, and whether multi-select is
// enabled. Keeping it pure means the engine just applies the result and the
// rules are unit-testable without any DOM or canvas.

export interface SelectionMods {
  /** `ctrl` on Windows/Linux or `⌘` on macOS — the multi-select modifier. */
  ctrlOrMeta: boolean;
}

export interface SelectionResult {
  /** The next selection, in stable order. */
  ids: string[];
  /** Whether the selection actually changed (drives `selectionChange` emission). */
  changed: boolean;
}

/**
 * Compute the next selection after a click (§9):
 * - multi-select off → plain click selects the hit (or clears on empty click);
 * - multi-select on  → `ctrl`/`⌘`+click toggles the hit in/out, a plain click
 *   replaces the selection with the hit (or clears on empty click).
 */
export function nextSelection(
  current: ReadonlySet<string>,
  hitId: string | null,
  mods: SelectionMods,
  multiSelect: boolean,
): SelectionResult {
  const next = new Set(current);

  if (multiSelect && mods.ctrlOrMeta) {
    if (hitId === null) {
      // Modifier-click on empty space is a no-op (preserves the selection).
      return { ids: [...current], changed: false };
    }
    if (next.has(hitId)) next.delete(hitId);
    else next.add(hitId);
  } else {
    next.clear();
    if (hitId !== null) next.add(hitId);
  }

  return { ids: [...next], changed: !sameSet(current, next) };
}

/** Set equality by membership — the basis for "did the selection change?". */
export function sameSet(
  a: ReadonlySet<string>,
  b: ReadonlySet<string>,
): boolean {
  if (a.size !== b.size) return false;
  for (const id of a) if (!b.has(id)) return false;
  return true;
}
