// Selection state and its click transitions (DESIGN.md §9).
//
// Selection is keyed by entity — element ids and event ids are separate sets —
// so an element and an event sharing a raw id never collide, and hosts never
// see an internal id encoding. The click rules are pure over the current state,
// which keeps them unit-testable without any DOM or canvas.

/** The selected elements and events, as plain id lists. */
export interface Selection {
  elements: string[];
  events: string[];
}

/** A partial selection: omitted lists are treated as empty. */
export interface SelectionInput {
  elements?: readonly string[];
  events?: readonly string[];
}

/** One selectable entity. A cluster click contributes all of its member events. */
export interface SelectionItem {
  kind: 'element' | 'event';
  id: string;
}

export interface SelectionMods {
  /** `ctrl` on Windows/Linux or `⌘` on macOS — the multi-select modifier. */
  ctrlOrMeta: boolean;
}

export class SelectionModel {
  private readonly elements = new Set<string>();
  private readonly events = new Set<string>();

  get isEmpty(): boolean {
    return this.elements.size === 0 && this.events.size === 0;
  }

  hasElement(id: string): boolean {
    return this.elements.has(id);
  }

  hasEvent(id: string): boolean {
    return this.events.has(id);
  }

  get elementIds(): ReadonlySet<string> {
    return this.elements;
  }

  get eventIds(): ReadonlySet<string> {
    return this.events;
  }

  snapshot(): Selection {
    return { elements: [...this.elements], events: [...this.events] };
  }

  /** Replace the selection; returns whether membership changed. */
  replace(input: SelectionInput): boolean {
    const elements = new Set(input.elements ?? []);
    const events = new Set(input.events ?? []);
    if (sameSet(this.elements, elements) && sameSet(this.events, events)) {
      return false;
    }
    assign(this.elements, elements);
    assign(this.events, events);
    return true;
  }

  /**
   * Apply a click (§9) on `items` (empty for a click on empty space):
   * - multi-select off, or no modifier → the clicked items replace the
   *   selection (an empty click clears it);
   * - multi-select on with `ctrl`/`⌘` → toggle: remove the items when all are
   *   already selected, otherwise add them; a modifier click on empty space
   *   keeps the selection.
   * Returns whether membership changed.
   */
  click(
    items: readonly SelectionItem[],
    mods: SelectionMods,
    multiSelect: boolean,
  ): boolean {
    if (multiSelect && mods.ctrlOrMeta) {
      if (items.length === 0) return false;
      const allSelected = items.every((item) => this.has(item));
      const elements = new Set(this.elements);
      const events = new Set(this.events);
      for (const item of items) {
        const set = item.kind === 'element' ? elements : events;
        if (allSelected) set.delete(item.id);
        else set.add(item.id);
      }
      return this.replace({ elements: [...elements], events: [...events] });
    }
    return this.replace({
      elements: items.filter((i) => i.kind === 'element').map((i) => i.id),
      events: items.filter((i) => i.kind === 'event').map((i) => i.id),
    });
  }

  /** Drop ids that no longer exist; returns whether anything was removed. */
  prune(
    elementExists: (id: string) => boolean,
    eventExists: (id: string) => boolean,
  ): boolean {
    let changed = false;
    for (const id of this.elements) {
      if (!elementExists(id)) {
        this.elements.delete(id);
        changed = true;
      }
    }
    for (const id of this.events) {
      if (!eventExists(id)) {
        this.events.delete(id);
        changed = true;
      }
    }
    return changed;
  }

  private has(item: SelectionItem): boolean {
    return item.kind === 'element'
      ? this.elements.has(item.id)
      : this.events.has(item.id);
  }
}

/** Set equality by membership. */
function sameSet(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false;
  for (const id of a) if (!b.has(id)) return false;
  return true;
}

function assign(target: Set<string>, source: ReadonlySet<string>): void {
  target.clear();
  for (const id of source) target.add(id);
}
