// The dataset store (DESIGN.md §1, §5, §10): owns elements, events and
// per-element extents, and is the single owner of dataset validation.
//
// Events live in parallel typed-array columns kept sorted by (time, insertion
// order): time, source and target element slots, plus the host objects. The
// columns are snapshots taken at ingest, so a host mutating an event object
// afterwards cannot corrupt the index. There is one index-build path: `setData`
// clears, then merges its whole batch through the same sort-and-merge the
// streaming `addEvents` uses (§10).

import { createDefaultDiagnosticSink, type OnDiagnostic } from './diagnostics';
import type { Extent } from './extent';
import { lowerBound, upperBound } from './temporalIndex';
import type {
  Time,
  TimelineData,
  TimelineElement,
  TimelineEvent,
} from './types';

export interface DataStoreOptions {
  onDiagnostic?: OnDiagnostic;
}

export interface ChangeCounts {
  added: number;
  removed: number;
  updated: number;
}

/** What a mutation changed, per entity kind (DESIGN.md §9 `dataChange`). */
export interface DataChangeCounts {
  elements: ChangeCounts;
  events: ChangeCounts;
}

const none = (): ChangeCounts => ({ added: 0, removed: 0, updated: 0 });

export function noChanges(): DataChangeCounts {
  return { elements: none(), events: none() };
}

export function isNoChange(counts: DataChangeCounts): boolean {
  const total = (c: ChangeCounts) => c.added + c.removed + c.updated;
  return total(counts.elements) + total(counts.events) === 0;
}

/** A validated event awaiting its merge into the columns. */
interface Pending<TData> {
  time: number;
  source: number;
  target: number;
  ref: TimelineEvent<TData>;
}

const INITIAL_EVENT_CAPACITY = 64;
const INITIAL_ELEMENT_CAPACITY = 16;

export class DataStore<TData = unknown> {
  private readonly onDiagnostic: OnDiagnostic;

  // Elements, in insertion order (the layout strategies' input order).
  private elements: TimelineElement<TData>[] = [];
  private slotById = new Map<string, number>();
  private extMin = new Float64Array(INITIAL_ELEMENT_CAPACITY);
  private extMax = new Float64Array(INITIAL_ELEMENT_CAPACITY);
  /** Per-element style slot for the render side; −1 = not resolved yet. */
  elementStyle = new Int32Array(INITIAL_ELEMENT_CAPACITY).fill(-1);
  /** Bumped whenever element slots change (added, removed, renumbered). */
  slotsVersion = 0;
  /** Bumped whenever the event columns change (indices may have shifted). */
  eventsVersion = 0;

  // Events, sorted by time, then insertion order: a merged batch is stably
  // sorted and lands after existing events at an equal time.
  private count = 0;
  private time = new Float64Array(INITIAL_EVENT_CAPACITY);
  private source = new Int32Array(INITIAL_EVENT_CAPACITY);
  private target = new Int32Array(INITIAL_EVENT_CAPACITY);
  /** Per-event style slot for the render side; −1 = not resolved yet. */
  eventStyle = new Int32Array(INITIAL_EVENT_CAPACITY).fill(-1);
  private refs: TimelineEvent<TData>[] = [];
  /** Event id → its indexed time, to locate it by binary search. */
  private timeById = new Map<string, number>();

  constructor(options: DataStoreOptions = {}) {
    this.onDiagnostic = options.onDiagnostic ?? createDefaultDiagnosticSink();
  }

  // --- Mutations ---

  /** Replace the whole dataset; counts are by id against the previous one. */
  setData(data: TimelineData<TData>): DataChangeCounts {
    const previousElements = new Set(this.slotById.keys());
    const previousEvents = new Set(this.timeById.keys());
    this.clear();
    for (const element of data.elements) this.insertElement(element);
    const pending: Pending<TData>[] = [];
    const batchIds = new Set<string>();
    for (const event of data.events) {
      const p = this.validateEvent(event, batchIds);
      if (p !== null) pending.push(p);
    }
    this.merge(pending);
    return {
      elements: diffIds(previousElements, this.slotById),
      events: diffIds(previousEvents, this.timeById),
    };
  }

  /** Insert events with one sort of the batch and one merge (§10). */
  addEvents(events: readonly TimelineEvent<TData>[]): DataChangeCounts {
    const pending: Pending<TData>[] = [];
    const batchIds = new Set<string>();
    for (const event of events) {
      const p = this.validateEvent(event, batchIds);
      if (p !== null) pending.push(p);
    }
    this.merge(pending);
    return { elements: none(), events: { ...none(), added: pending.length } };
  }

  /** Remove events by id; unknown ids are ignored (lenient). */
  removeEvents(ids: readonly string[]): DataChangeCounts {
    const marks = new Uint8Array(this.count);
    const affected = new Uint8Array(this.elements.length);
    let removed = 0;
    for (const id of ids) {
      const index = this.indexOfEvent(id);
      if (index < 0 || marks[index] === 1) continue;
      marks[index] = 1;
      affected[this.source[index] as number] = 1;
      affected[this.target[index] as number] = 1;
      this.timeById.delete(id);
      removed++;
    }
    if (removed === 0) return noChanges();
    this.compact((i) => marks[i] === 0, affected);
    return { elements: none(), events: { ...none(), removed } };
  }

  /**
   * Patch an event (`id` is immutable). The event is re-indexed, so a new
   * `time` moves it; it then sorts after other events at that time. An
   * invalid result is reported and leaves the event unchanged.
   */
  updateEvent(
    id: string,
    patch: Partial<TimelineEvent<TData>>,
  ): DataChangeCounts {
    const index = this.indexOfEvent(id);
    if (index < 0) return noChanges();
    const updated = {
      ...this.refs[index],
      ...patch,
      id,
    } as TimelineEvent<TData>;
    this.timeById.delete(id);
    const pending = this.validateEvent(updated, new Set());
    if (pending === null) {
      this.timeById.set(id, this.time[index] as number);
      return noChanges();
    }
    const affected = new Uint8Array(this.elements.length);
    affected[this.source[index] as number] = 1;
    affected[this.target[index] as number] = 1;
    this.compact((i) => i !== index, affected);
    this.merge([pending]);
    return { elements: none(), events: { ...none(), updated: 1 } };
  }

  /** Append elements in input order; duplicates drop leniently. */
  addElements(elements: readonly TimelineElement<TData>[]): DataChangeCounts {
    let added = 0;
    for (const element of elements) {
      if (this.insertElement(element)) added++;
    }
    return { elements: { ...none(), added }, events: none() };
  }

  /**
   * Patch an element in place (§10); `id` is immutable. Extents are
   * event-derived, so they are unaffected.
   */
  updateElement(
    id: string,
    patch: Partial<TimelineElement<TData>>,
  ): DataChangeCounts {
    const slot = this.slotById.get(id);
    if (slot === undefined) return noChanges();
    const updated = {
      ...this.elements[slot],
      ...patch,
      id,
    } as TimelineElement<TData>;
    this.reportElementFields(updated);
    this.elements[slot] = updated;
    this.elementStyle[slot] = -1;
    return { elements: { ...none(), updated: 1 }, events: none() };
  }

  /** Remove elements by id, together with every event that touches them. */
  removeElements(ids: readonly string[]): DataChangeCounts {
    const doomed = new Uint8Array(this.elements.length);
    let removed = 0;
    for (const id of ids) {
      const slot = this.slotById.get(id);
      if (slot === undefined || doomed[slot] === 1) continue;
      doomed[slot] = 1;
      removed++;
    }
    if (removed === 0) return noChanges();

    // Survivors that shared an event with a removed element lose that event,
    // so their extents must be recomputed.
    const affected = new Uint8Array(this.elements.length);
    const keep = (i: number): boolean =>
      doomed[this.source[i] as number] === 0 &&
      doomed[this.target[i] as number] === 0;
    let eventsRemoved = 0;
    for (let i = 0; i < this.count; i++) {
      if (keep(i)) continue;
      affected[this.source[i] as number] = 1;
      affected[this.target[i] as number] = 1;
      this.timeById.delete((this.refs[i] as TimelineEvent<TData>).id);
      eventsRemoved++;
    }
    this.compact(keep, affected);

    // Compact the element columns and renumber the event endpoints.
    const remap = new Int32Array(this.elements.length);
    let w = 0;
    for (let s = 0; s < this.elements.length; s++) {
      if (doomed[s] === 1) {
        remap[s] = -1;
        continue;
      }
      remap[s] = w;
      this.elements[w] = this.elements[s] as TimelineElement<TData>;
      this.extMin[w] = this.extMin[s] as number;
      this.extMax[w] = this.extMax[s] as number;
      this.elementStyle[w] = this.elementStyle[s] as number;
      w++;
    }
    this.elements.length = w;
    this.slotsVersion++;
    this.slotById = new Map(this.elements.map((e, slot) => [e.id, slot]));
    for (let i = 0; i < this.count; i++) {
      this.source[i] = remap[this.source[i] as number] as number;
      this.target[i] = remap[this.target[i] as number] as number;
    }
    this.eventsVersion++;
    return {
      elements: { ...none(), removed },
      events: { ...none(), removed: eventsRemoved },
    };
  }

  /** Mark every resolved style stale (theme or resolvers changed). */
  resetStyles(): void {
    this.elementStyle.fill(-1);
    this.eventStyle.fill(-1);
  }

  // --- Queries ---

  getElements(): readonly TimelineElement<TData>[] {
    return this.elements;
  }

  /** Events in time order (a live view; do not mutate). */
  getEvents(): readonly TimelineEvent<TData>[] {
    return this.refs;
  }

  /** A snapshot of the current dataset, events in time order. */
  getData(): TimelineData<TData> {
    return { elements: [...this.elements], events: [...this.refs] };
  }

  get elementCount(): number {
    return this.elements.length;
  }

  get eventCount(): number {
    return this.count;
  }

  /** First event time per element slot (NaN: no events). */
  get extentMins(): Float64Array {
    return this.extMin;
  }

  /** Last event time per element slot (NaN: no events). */
  get extentMaxs(): Float64Array {
    return this.extMax;
  }

  /** Sorted event times; valid for indices below {@link eventCount}. */
  get eventTimes(): Float64Array {
    return this.time;
  }

  /** Source element slot per event (see {@link elementAt}). */
  get eventSources(): Int32Array {
    return this.source;
  }

  /** Target element slot per event. */
  get eventTargets(): Int32Array {
    return this.target;
  }

  eventAt(index: number): TimelineEvent<TData> {
    return this.refs[index] as TimelineEvent<TData>;
  }

  elementAt(slot: number): TimelineElement<TData> {
    return this.elements[slot] as TimelineElement<TData>;
  }

  slotOf(id: string): number | undefined {
    return this.slotById.get(id);
  }

  getElementById(id: string): TimelineElement<TData> | undefined {
    const slot = this.slotById.get(id);
    return slot === undefined ? undefined : this.elements[slot];
  }

  hasEvent(id: string): boolean {
    return this.timeById.has(id);
  }

  getEventById(id: string): TimelineEvent<TData> | undefined {
    const index = this.indexOfEvent(id);
    return index < 0 ? undefined : this.refs[index];
  }

  /** The indexed time of an event (a snapshot taken at ingest). */
  timeOf(id: string): Time | undefined {
    return this.timeById.get(id);
  }

  /** Index range `[lo, hi)` of the events with time in `[tStart, tEnd]`. */
  rangeOf(tStart: Time, tEnd: Time): [number, number] {
    if (tEnd < tStart) return [0, 0];
    return [
      lowerBound(this.time, this.count, tStart),
      upperBound(this.time, this.count, tEnd),
    ];
  }

  /** The events with time in `[tStart, tEnd]`, via binary search (§5). */
  getEventsInRange(tStart: Time, tEnd: Time): readonly TimelineEvent<TData>[] {
    const [lo, hi] = this.rangeOf(tStart, tEnd);
    return this.refs.slice(lo, hi);
  }

  /** An element's extent, or undefined when it has no events (§1). */
  getExtent(id: string): Extent | undefined {
    const slot = this.slotById.get(id);
    return slot === undefined ? undefined : this.extentAt(slot);
  }

  extentAt(slot: number): Extent | undefined {
    const minTime = this.extMin[slot] as number;
    if (Number.isNaN(minTime)) return undefined;
    return { minTime, maxTime: this.extMax[slot] as number };
  }

  /** First and last event times, or null when there are no events (§3.1). */
  getDataExtent(): Extent | null {
    if (this.count === 0) return null;
    return {
      minTime: this.time[0] as number,
      maxTime: this.time[this.count - 1] as number,
    };
  }

  // --- Internals ---

  private clear(): void {
    this.slotsVersion++;
    this.eventsVersion++;
    this.elements = [];
    this.slotById.clear();
    this.count = 0;
    this.refs = [];
    this.timeById.clear();
    this.extMin.fill(NaN);
    this.extMax.fill(NaN);
    this.elementStyle.fill(-1);
  }

  /** Index of the event with `id` in time order, or −1. */
  indexOfEvent(id: string): number {
    const t = this.timeById.get(id);
    if (t === undefined) return -1;
    for (
      let i = lowerBound(this.time, this.count, t);
      i < this.count && this.time[i] === t;
      i++
    ) {
      if ((this.refs[i] as TimelineEvent<TData>).id === id) return i;
    }
    return -1;
  }

  /**
   * Sort the validated batch by time (stable, so insertion order breaks
   * ties) and merge it into the columns from the back, in place: O(n + k).
   */
  private merge(batch: Pending<TData>[]): void {
    if (batch.length === 0) return;
    batch.sort((a, b) => a.time - b.time);
    const n = this.count;
    const total = n + batch.length;
    this.ensureEventCapacity(total);
    let i = n - 1;
    let j = batch.length - 1;
    for (let w = total - 1; j >= 0; w--) {
      const p = batch[j] as Pending<TData>;
      // Existing events stay before new ones at an equal time.
      if (i >= 0 && (this.time[i] as number) > p.time) {
        this.move(i, w);
        i--;
      } else {
        this.time[w] = p.time;
        this.source[w] = p.source;
        this.target[w] = p.target;
        this.eventStyle[w] = -1;
        this.refs[w] = p.ref;
        this.timeById.set(p.ref.id, p.time);
        this.widen(p.source, p.time);
        this.widen(p.target, p.time);
        j--;
      }
    }
    this.count = total;
    this.eventsVersion++;
  }

  /**
   * Keep the events passing `keep`, in order, and recompute the extents of
   * the `affected` element slots from the survivors: one O(n) pass.
   */
  private compact(
    keep: (index: number) => boolean,
    affected: Uint8Array,
  ): void {
    for (let s = 0; s < affected.length; s++) {
      if (affected[s] === 1) {
        this.extMin[s] = NaN;
        this.extMax[s] = NaN;
      }
    }
    let w = 0;
    for (let i = 0; i < this.count; i++) {
      if (!keep(i)) continue;
      if (w !== i) this.move(i, w);
      const t = this.time[w] as number;
      const s = this.source[w] as number;
      const d = this.target[w] as number;
      if (affected[s] === 1) this.widen(s, t);
      if (affected[d] === 1) this.widen(d, t);
      w++;
    }
    this.count = w;
    this.refs.length = w;
    this.eventsVersion++;
  }

  private move(from: number, to: number): void {
    this.time[to] = this.time[from] as number;
    this.source[to] = this.source[from] as number;
    this.target[to] = this.target[from] as number;
    this.eventStyle[to] = this.eventStyle[from] as number;
    this.refs[to] = this.refs[from] as TimelineEvent<TData>;
  }

  private widen(slot: number, t: number): void {
    const min = this.extMin[slot] as number;
    if (Number.isNaN(min) || t < min) this.extMin[slot] = t;
    const max = this.extMax[slot] as number;
    if (Number.isNaN(max) || t > max) this.extMax[slot] = t;
  }

  private ensureEventCapacity(total: number): void {
    if (total <= this.time.length) return;
    const capacity = Math.max(total, this.time.length * 2);
    this.time = grow(this.time, capacity, this.count);
    this.source = grow(this.source, capacity, this.count);
    this.target = grow(this.target, capacity, this.count);
    this.eventStyle = grow(this.eventStyle, capacity, this.count, -1);
  }

  private ensureElementCapacity(total: number): void {
    if (total <= this.extMin.length) return;
    const capacity = Math.max(total, this.extMin.length * 2);
    const used = this.elements.length;
    this.extMin = grow(this.extMin, capacity, used, NaN);
    this.extMax = grow(this.extMax, capacity, used, NaN);
    this.elementStyle = grow(this.elementStyle, capacity, used, -1);
  }

  private insertElement(element: TimelineElement<TData>): boolean {
    if (!isValidId(element.id)) {
      this.onDiagnostic({
        code: 'invalid-id',
        kind: 'element',
        reason: 'element id must be a non-empty string',
      });
      return false;
    }
    if (this.slotById.has(element.id)) {
      this.onDiagnostic({
        code: 'duplicate-id',
        kind: 'element',
        id: element.id,
        reason: 'duplicate element id',
      });
      return false;
    }
    this.reportElementFields(element);
    const slot = this.elements.length;
    this.ensureElementCapacity(slot + 1);
    this.elements.push(element);
    this.slotsVersion++;
    this.slotById.set(element.id, slot);
    this.extMin[slot] = NaN;
    this.extMax[slot] = NaN;
    this.elementStyle[slot] = -1;
    return true;
  }

  /** Report malformed optional fields (kept; the engine ignores them). */
  private reportElementFields(element: TimelineElement<TData>): void {
    if (element.label !== undefined && typeof element.label !== 'string') {
      this.onDiagnostic({
        code: 'invalid-field',
        kind: 'element',
        id: element.id,
        reason: 'label is not a string; the id is shown instead',
      });
    }
    if (element.order !== undefined && !Number.isFinite(element.order)) {
      this.onDiagnostic({
        code: 'invalid-field',
        kind: 'element',
        id: element.id,
        reason: 'order is not a finite number and is ignored',
      });
    }
  }

  /** Validate one event against the current elements; null drops it. */
  private validateEvent(
    event: TimelineEvent<TData>,
    batchIds: Set<string>,
  ): Pending<TData> | null {
    if (!isValidId(event.id)) {
      this.onDiagnostic({
        code: 'invalid-id',
        kind: 'event',
        reason: 'event id must be a non-empty string',
      });
      return null;
    }
    const time = event.time;
    if (typeof time !== 'number' || !Number.isFinite(time)) {
      this.onDiagnostic({
        code: 'invalid-time',
        kind: 'event',
        id: event.id,
        reason: 'time is not a finite number',
      });
      return null;
    }
    if (
      event.endTime !== undefined &&
      !(Number.isFinite(event.endTime) && event.endTime >= time)
    ) {
      this.onDiagnostic({
        code: 'invalid-time',
        kind: 'event',
        id: event.id,
        reason: 'endTime must be a finite time no earlier than time; ignored',
      });
    }
    if (this.timeById.has(event.id) || batchIds.has(event.id)) {
      this.onDiagnostic({
        code: 'duplicate-id',
        kind: 'event',
        id: event.id,
        reason: 'duplicate event id',
      });
      return null;
    }
    const source = this.slotById.get(event.sourceId);
    const target = this.slotById.get(event.targetId);
    if (source === undefined || target === undefined) {
      this.onDiagnostic({
        code: 'dangling-edge',
        kind: 'event',
        id: event.id,
        reason: 'sourceId or targetId references an unknown element',
      });
      return null;
    }
    batchIds.add(event.id);
    return { time, source, target, ref: event };
  }
}

function isValidId(id: unknown): id is string {
  return typeof id === 'string' && id.length > 0;
}

/** Ids added, removed and kept between two snapshots. */
function diffIds(
  previous: ReadonlySet<string>,
  current: ReadonlyMap<string, unknown>,
): ChangeCounts {
  let kept = 0;
  for (const id of current.keys()) if (previous.has(id)) kept++;
  return {
    added: current.size - kept,
    removed: previous.size - kept,
    updated: kept,
  };
}

function grow<T extends Float64Array | Int32Array>(
  array: T,
  capacity: number,
  used: number,
  fill?: number,
): T {
  const next = new (array.constructor as new (n: number) => T)(capacity);
  next.set(array.subarray(0, used));
  if (fill !== undefined) next.fill(fill, used);
  return next;
}
