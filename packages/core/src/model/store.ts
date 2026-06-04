// The dataset store: owns the elements, events, and per-element extents, and is
// the single owner of dataset validation (DESIGN.md §1, §5).
//
// The full-rebuild path (`setData`) and any future incremental path share one
// insert routine: rebuild is "clear, then apply the whole dataset through the
// incremental insert routine." There is no second, parallel index builder.

import { createDefaultDiagnosticSink, type OnDiagnostic } from './diagnostics';
import { type Extent, dataExtent, widenExtent } from './extent';
import type { TimelineData, TimelineElement, TimelineEvent } from './types';

export interface DataStoreOptions {
  onDiagnostic?: OnDiagnostic;
}

/** Counts reported after a mutation (DESIGN.md §9 `dataChange`). */
export interface DataChangeCounts {
  added: number;
  removed: number;
  updated: number;
}

export class DataStore<TData = unknown> {
  private readonly onDiagnostic: OnDiagnostic;

  private elements: TimelineElement<TData>[] = [];
  private elementById = new Map<string, TimelineElement<TData>>();
  private events: TimelineEvent<TData>[] = [];
  private eventById = new Map<string, TimelineEvent<TData>>();
  private extents = new Map<string, Extent>();

  constructor(options: DataStoreOptions = {}) {
    this.onDiagnostic = options.onDiagnostic ?? createDefaultDiagnosticSink();
  }

  /**
   * Full replace: clear, then apply the whole dataset through the same insert
   * routines used by (future) incremental updates (§5). Elements are inserted
   * before events so edges can reference any element in the batch.
   */
  setData(data: TimelineData<TData>): DataChangeCounts {
    this.clear();
    let added = 0;
    for (const element of data.elements) {
      if (this.insertElement(element)) added++;
    }
    for (const event of data.events) {
      if (this.insertEvent(event)) added++;
    }
    return { added, removed: 0, updated: 0 };
  }

  private clear(): void {
    this.elements = [];
    this.elementById.clear();
    this.events = [];
    this.eventById.clear();
    this.extents.clear();
  }

  private insertElement(element: TimelineElement<TData>): boolean {
    if (this.elementById.has(element.id)) {
      this.onDiagnostic({
        code: 'duplicate-id',
        kind: 'element',
        id: element.id,
        reason: 'duplicate element id',
      });
      return false;
    }
    this.elements.push(element);
    this.elementById.set(element.id, element);
    return true;
  }

  private insertEvent(event: TimelineEvent<TData>): boolean {
    if (!Number.isFinite(event.time)) {
      this.onDiagnostic({
        code: 'invalid-time',
        kind: 'event',
        id: event.id,
        reason: 'time is not a finite number',
      });
      return false;
    }
    if (this.eventById.has(event.id)) {
      this.onDiagnostic({
        code: 'duplicate-id',
        kind: 'event',
        id: event.id,
        reason: 'duplicate event id',
      });
      return false;
    }
    if (
      !this.elementById.has(event.sourceId) ||
      !this.elementById.has(event.targetId)
    ) {
      this.onDiagnostic({
        code: 'dangling-edge',
        kind: 'event',
        id: event.id,
        reason: 'sourceId or targetId references an unknown element',
      });
      return false;
    }

    this.events.push(event);
    this.eventById.set(event.id, event);
    // An event widens both endpoints' extents; a self-event (source === target)
    // widens its single element's extent once.
    this.extents.set(
      event.sourceId,
      widenExtent(this.extents.get(event.sourceId), event.time),
    );
    if (event.targetId !== event.sourceId) {
      this.extents.set(
        event.targetId,
        widenExtent(this.extents.get(event.targetId), event.time),
      );
    }
    return true;
  }

  getElements(): readonly TimelineElement<TData>[] {
    return this.elements;
  }

  getEvents(): readonly TimelineEvent<TData>[] {
    return this.events;
  }

  getElementById(id: string): TimelineElement<TData> | undefined {
    return this.elementById.get(id);
  }

  getExtent(id: string): Extent | undefined {
    return this.extents.get(id);
  }

  getExtents(): ReadonlyMap<string, Extent> {
    return this.extents;
  }

  /** Overall extent across all elements, or `null` when empty (§3.1). */
  getDataExtent(): Extent | null {
    return dataExtent(this.extents);
  }
}
