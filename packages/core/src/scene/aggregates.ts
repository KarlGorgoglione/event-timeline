// Per-zoom-level event aggregates for the zoomed-out regime (DESIGN.md §5,
// §6; audit A-01).
//
// Zoomed far out, a frame would otherwise touch every event in the window
// just to merge most of them into count markers. Aggregates bin the events
// once per data version instead: at level L, the time axis is cut into bins of
// 2^L ms, and each (source, target, bin) with events becomes one cell holding
// their count, time span and first/last event index. A frame then feeds the
// cells in its window to the clustering pass in place of the events.
//
// Bins are aligned in time, not on screen, so cells stay put while panning.
// A level is built lazily: from the events the first time (one O(n) pass),
// or by merging a finer cached level's cells (O(cells)). Any change to the
// events drops every level; only the levels a frame asks for are rebuilt.

import type { DataStore } from '../model/store';
import { lowerBound, upperBound } from '../model/temporalIndex';

/** Finest and coarsest levels: 1 ms and 2^52 ms (≈143,000 years) bins. */
export const MIN_LEVEL = 0;
export const MAX_LEVEL = 52;
/** Levels kept cached at once (least recently used dropped first). */
const MAX_CACHED_LEVELS = 8;

/** The cells of one level, in time order of their first event. */
export interface AggregateLevel {
  readonly level: number;
  /** Bin width, ms. */
  readonly width: number;
  readonly count: number;
  /** Time of the cell's first and last event. */
  readonly tMin: Float64Array;
  readonly tMax: Float64Array;
  /** Events in the cell. */
  readonly size: Int32Array;
  /** Source and target element slots (one pair per cell). */
  readonly source: Int32Array;
  readonly target: Int32Array;
  /** Index (in the store's time order) of the cell's first and last event. */
  readonly first: Int32Array;
  readonly last: Int32Array;
}

/** The bin width of a level, ms. */
export function levelWidth(level: number): number {
  return 2 ** level;
}

/** The coarsest level whose bins last at most `maxMs`. */
export function levelForDuration(maxMs: number): number {
  const level = Math.floor(Math.log2(maxMs));
  return Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, level));
}

export class EventAggregates {
  private version = -1;
  private readonly levels = new Map<number, AggregateLevel>();
  private readonly table = new PairTable();
  // Scratch for the level being built, reused across builds.
  private tMin = new Float64Array(0);
  private tMax = new Float64Array(0);
  private size = new Int32Array(0);
  private source = new Int32Array(0);
  private target = new Int32Array(0);
  private first = new Int32Array(0);
  private last = new Int32Array(0);
  // Distinct (source, target) pairs, measured at the last build from the
  // events. Kept across streaming updates while the dataset is similar: it
  // only steers the path choice, so a slightly stale value is harmless.
  private measuredSlots = -1;
  private measuredEvents = 0;
  private measuredPairs = 0;

  /**
   * False when the data is known to hold about as many element pairs as
   * events: cells can then never be much fewer than the events, so building
   * levels would only cost time. Unknown counts as true (a build measures).
   */
  mayCompress<TData>(store: DataStore<TData>): boolean {
    const n = store.eventCount;
    const known =
      this.measuredSlots === store.slotsVersion &&
      Math.abs(n - this.measuredEvents) <= this.measuredEvents / 4;
    return !known || this.measuredPairs < this.measuredEvents / 2;
  }

  /** The cells of `level` for the store's current events. */
  level<TData>(store: DataStore<TData>, level: number): AggregateLevel {
    if (store.eventsVersion !== this.version) {
      this.levels.clear();
      this.version = store.eventsVersion;
    }
    const cached = this.levels.get(level);
    if (cached !== undefined) {
      // Re-insert: Map order doubles as least-recently-used order.
      this.levels.delete(level);
      this.levels.set(level, cached);
      return cached;
    }
    let finer: AggregateLevel | undefined;
    for (const [l, candidate] of this.levels) {
      if (l < level && (finer === undefined || l > finer.level)) {
        finer = candidate;
      }
    }
    const built =
      finer === undefined
        ? this.fromEvents(store, level)
        : this.fromLevel(finer, level);
    this.levels.set(level, built);
    if (this.levels.size > MAX_CACHED_LEVELS) {
      const oldest = this.levels.keys().next().value as number;
      this.levels.delete(oldest);
    }
    return built;
  }

  /** Cells `[lo, hi)` of `level` whose bins meet `[tStart, tEnd]`. */
  window(
    level: AggregateLevel,
    tStart: number,
    tEnd: number,
  ): [number, number] {
    if (tEnd < tStart) return [0, 0];
    // A cell lies wholly in its bin, so it meets the window iff its first
    // event is no earlier than the start of the window's first bin.
    const binStart = Math.floor(tStart / level.width) * level.width;
    return [
      lowerBound(level.tMin, level.count, binStart),
      upperBound(level.tMin, level.count, tEnd),
    ];
  }

  /** Drop every level (e.g. the store was replaced). */
  invalidate(): void {
    this.levels.clear();
    this.version = -1;
  }

  /** One pass over the time-sorted events. */
  private fromEvents<TData>(
    store: DataStore<TData>,
    level: number,
  ): AggregateLevel {
    const n = store.eventCount;
    const times = store.eventTimes;
    const sources = store.eventSources;
    const targets = store.eventTargets;
    const width = levelWidth(level);
    this.ensure(n);
    const table = this.table;
    table.reset(n);
    let cells = 0;
    for (let i = 0; i < n; i++) {
      const t = times[i] as number;
      const s = sources[i] as number;
      const d = targets[i] as number;
      const slot = table.find(s, d);
      const bin = Math.floor(t / width);
      if (table.has(slot)) {
        const c = table.value(slot);
        if (Math.floor((this.tMin[c] as number) / width) === bin) {
          (this.size[c] as number)++;
          this.tMax[c] = t;
          this.last[c] = i;
          continue;
        }
        table.update(slot, cells);
      } else {
        table.insert(slot, s, d, cells);
      }
      this.tMin[cells] = t;
      this.tMax[cells] = t;
      this.size[cells] = 1;
      this.source[cells] = s;
      this.target[cells] = d;
      this.first[cells] = i;
      this.last[cells] = i;
      cells++;
    }
    this.measuredSlots = store.slotsVersion;
    this.measuredEvents = n;
    this.measuredPairs = table.size;
    return this.snapshot(level, cells);
  }

  /** Merge a finer level's cells (already in time order) into coarser bins. */
  private fromLevel(finer: AggregateLevel, level: number): AggregateLevel {
    const width = levelWidth(level);
    this.ensure(finer.count);
    const table = this.table;
    table.reset(finer.count);
    let cells = 0;
    for (let f = 0; f < finer.count; f++) {
      const s = finer.source[f] as number;
      const d = finer.target[f] as number;
      const slot = table.find(s, d);
      const bin = Math.floor((finer.tMin[f] as number) / width);
      if (table.has(slot)) {
        const c = table.value(slot);
        if (Math.floor((this.tMin[c] as number) / width) === bin) {
          this.size[c] = (this.size[c] as number) + (finer.size[f] as number);
          this.tMax[c] = finer.tMax[f] as number;
          this.last[c] = finer.last[f] as number;
          continue;
        }
        table.update(slot, cells);
      } else {
        table.insert(slot, s, d, cells);
      }
      this.tMin[cells] = finer.tMin[f] as number;
      this.tMax[cells] = finer.tMax[f] as number;
      this.size[cells] = finer.size[f] as number;
      this.source[cells] = s;
      this.target[cells] = d;
      this.first[cells] = finer.first[f] as number;
      this.last[cells] = finer.last[f] as number;
      cells++;
    }
    return this.snapshot(level, cells);
  }

  private ensure(n: number): void {
    if (this.tMin.length >= n) return;
    const size = Math.max(n, this.tMin.length * 2);
    this.tMin = new Float64Array(size);
    this.tMax = new Float64Array(size);
    this.size = new Int32Array(size);
    this.source = new Int32Array(size);
    this.target = new Int32Array(size);
    this.first = new Int32Array(size);
    this.last = new Int32Array(size);
  }

  /** Copy the scratch cells into a right-sized level. */
  private snapshot(level: number, count: number): AggregateLevel {
    return {
      level,
      width: levelWidth(level),
      count,
      tMin: this.tMin.slice(0, count),
      tMax: this.tMax.slice(0, count),
      size: this.size.slice(0, count),
      source: this.source.slice(0, count),
      target: this.target.slice(0, count),
      first: this.first.slice(0, count),
      last: this.last.slice(0, count),
    };
  }
}

/**
 * An open-addressing hash table from an element pair to an int, cleared in
 * O(1) by bumping a generation stamp. Several times faster than a Map for
 * the one-lookup-per-event inner loop of a level build.
 */
class PairTable {
  private sources = new Int32Array(0);
  private targets = new Int32Array(0);
  private values = new Int32Array(0);
  private stamps = new Uint32Array(0);
  private generation = 0;
  private mask = 0;
  size = 0;

  /** Empty the table, sized for up to `expected` keys. */
  reset(expected: number): void {
    let capacity = 16;
    while (capacity < expected * 2) capacity *= 2;
    if (capacity > this.stamps.length) {
      this.sources = new Int32Array(capacity);
      this.targets = new Int32Array(capacity);
      this.values = new Int32Array(capacity);
      this.stamps = new Uint32Array(capacity);
      this.generation = 0;
    }
    this.mask = this.stamps.length - 1;
    this.generation = (this.generation + 1) >>> 0;
    if (this.generation === 0) {
      this.stamps.fill(0);
      this.generation = 1;
    }
    this.size = 0;
  }

  /** The slot holding `(s, d)`, or the empty slot where it would go. */
  find(s: number, d: number): number {
    let slot =
      (Math.imul(s, 0x9e3779b1) ^ Math.imul(d + 1, 0x85ebca6b)) & this.mask;
    while (
      this.stamps[slot] === this.generation &&
      (this.sources[slot] !== s || this.targets[slot] !== d)
    ) {
      slot = (slot + 1) & this.mask;
    }
    return slot;
  }

  has(slot: number): boolean {
    return this.stamps[slot] === this.generation;
  }

  value(slot: number): number {
    return this.values[slot] as number;
  }

  update(slot: number, value: number): void {
    this.values[slot] = value;
  }

  insert(slot: number, s: number, d: number, value: number): void {
    this.stamps[slot] = this.generation;
    this.sources[slot] = s;
    this.targets[slot] = d;
    this.values[slot] = value;
    this.size++;
  }
}
