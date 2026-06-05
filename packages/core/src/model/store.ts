// The dataset store: owns the elements, events, and per-element extents, and is
// the single owner of dataset validation (DESIGN.md §1, §5).
//
// The full-rebuild path (`setData`) and any future incremental path share one
// insert routine: rebuild is "clear, then apply the whole dataset through the
// incremental insert routine." There is no second, parallel index builder.

import { createDefaultDiagnosticSink, type OnDiagnostic } from './diagnostics';
import { type Extent, dataExtent, widenExtent } from './extent';
import { buildBuckets, lowerBound, upperBound } from './temporalIndex';
import type {
  Time,
  TimelineData,
  TimelineElement,
  TimelineEvent,
} from './types';

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
  /** Events sorted ascending by `time` (DESIGN.md §5); see {@link reindex}. */
  private events: TimelineEvent<TData>[] = [];
  private eventById = new Map<string, TimelineEvent<TData>>();
  private extents = new Map<string, Extent>();
  /** Element id → indices into {@link events}, in time order (§5). */
  private eventIndicesByElement = new Map<string, number[]>();
  /** Per-event insertion order, the stable tiebreak for equal-time events. */
  private seq = new Map<TimelineEvent<TData>, number>();
  /**
   * Monotonic source for {@link seq}. Never reset except by {@link clear}, so
   * an event inserted after a removal still sorts *after* survivors at the same
   * time — using `events.length` would recycle a live seq and corrupt the order.
   */
  private seqCounter = 0;

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
    this.reindex();
    return { added, removed: 0, updated: 0 };
  }

  /**
   * Incrementally insert events (DESIGN.md §10). Each row runs through the same
   * validated {@link insertEvent} as `setData` (lenient: invalid rows drop), then
   * a single {@link reindex} re-sorts and rebuilds buckets. Appending a batch and
   * re-sorting the mostly-sorted array is the §10 "single merge" in practice — no
   * parallel index builder (the §5 single-build-path invariant).
   */
  addEvents(events: readonly TimelineEvent<TData>[]): DataChangeCounts {
    let added = 0;
    for (const event of events) {
      if (this.insertEvent(event)) added++;
    }
    if (added > 0) this.reindex();
    return { added, removed: 0, updated: 0 };
  }

  /**
   * Incrementally insert elements with stable-append semantics (DESIGN.md §10):
   * appended in input order, existing elements untouched. Duplicates drop
   * leniently. Events are unchanged, so no reindex is needed.
   */
  addElements(elements: readonly TimelineElement<TData>[]): DataChangeCounts {
    let added = 0;
    for (const element of elements) {
      if (this.insertElement(element)) added++;
    }
    return { added, removed: 0, updated: 0 };
  }

  /**
   * Remove events by id (DESIGN.md §10). Unknown ids are ignored (lenient).
   * Extents shrink, so the touched elements' extents are recomputed from their
   * surviving events after the buckets are rebuilt by {@link reindex}.
   */
  removeEvents(ids: readonly string[]): DataChangeCounts {
    const affected = new Set<string>();
    let removed = 0;
    for (const id of ids) {
      const event = this.eventById.get(id);
      if (event === undefined) continue;
      this.eventById.delete(id);
      this.seq.delete(event);
      affected.add(event.sourceId);
      affected.add(event.targetId);
      removed++;
    }
    if (removed === 0) return { added: 0, removed: 0, updated: 0 };

    this.events = this.events.filter((e) => this.eventById.has(e.id));
    this.reindex();
    for (const id of affected) this.recomputeExtentFor(id);
    return { added: 0, removed, updated: 0 };
  }

  /**
   * Patch an element in place (DESIGN.md §10): style/label/icon/order overrides
   * without a full rebuild. The `id` is immutable. Unknown ids are a lenient
   * no-op. Extents are event-derived, so they are unaffected.
   *
   * Note: patching `order` only changes row position under the `explicit`
   * layout with `streamingLayout: 'full'`; the default stable-append streaming
   * layout deliberately never reshuffles existing rows (§7).
   */
  updateElement(
    id: string,
    patch: Partial<TimelineElement<TData>>,
  ): DataChangeCounts {
    const existing = this.elementById.get(id);
    if (existing === undefined) return { added: 0, removed: 0, updated: 0 };
    const slot = this.elements.indexOf(existing);
    // `elementById` and `elements` are kept in sync, so this is always >= 0;
    // guard defensively rather than silently writing an out-of-range index.
    if (slot === -1) return { added: 0, removed: 0, updated: 0 };
    const updated: TimelineElement<TData> = { ...existing, ...patch, id };
    this.elements[slot] = updated;
    this.elementById.set(id, updated);
    return { added: 0, removed: 0, updated: 1 };
  }

  /**
   * Recompute one element's extent from its surviving events (§5). Reads the
   * rebuilt bucket; an event-less element has no extent and is removed.
   */
  private recomputeExtentFor(id: string): void {
    const indices = this.eventIndicesByElement.get(id);
    if (indices === undefined || indices.length === 0) {
      this.extents.delete(id);
      return;
    }
    let extent: Extent | undefined;
    for (const index of indices) {
      const event = this.events[index] as TimelineEvent<TData>;
      extent = widenExtent(extent, event.time);
    }
    if (extent !== undefined) this.extents.set(id, extent);
  }

  private clear(): void {
    this.elements = [];
    this.elementById.clear();
    this.events = [];
    this.eventById.clear();
    this.extents.clear();
    this.eventIndicesByElement.clear();
    this.seq.clear();
    this.seqCounter = 0;
  }

  /**
   * Finalise the derived event indexes from the validated events (§5): sort by
   * `time` (stable on the insertion `seq`, so equal-time order is deterministic
   * across engines), then build the per-element buckets in one pass. This is the
   * single index-build path — the future incremental `addEvents` (§10) re-enters
   * here rather than maintaining a parallel builder.
   */
  private reindex(): void {
    this.events.sort((a, b) => {
      if (a.time !== b.time) return a.time - b.time;
      return (this.seq.get(a) ?? 0) - (this.seq.get(b) ?? 0);
    });
    this.eventIndicesByElement = buildBuckets(this.events);
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

    this.seq.set(event, this.seqCounter++);
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

  /**
   * The events whose `time` falls in `[tStart, tEnd]` (inclusive), via binary
   * search over the sorted array — O(log n + k) (§5). Used by the renderer for
   * horizontal culling instead of a linear scan.
   */
  getEventsInRange(tStart: Time, tEnd: Time): readonly TimelineEvent<TData>[] {
    if (tEnd < tStart) return [];
    const lo = lowerBound(this.events, tStart);
    const hi = upperBound(this.events, tEnd);
    return this.events.slice(lo, hi);
  }

  /**
   * Indices into {@link getEvents} of the events touching `id`, in time order
   * (§5). Empty for an unknown or event-less element.
   */
  getEventIndicesForElement(id: string): readonly number[] {
    return this.eventIndicesByElement.get(id) ?? [];
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
