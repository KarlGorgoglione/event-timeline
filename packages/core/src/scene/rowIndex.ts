// Row-interval index for the zoomed-out regime (DESIGN.md §5, §13).
//
// Zoomed in, the time window holds few events and a binary search over the
// sorted times finds them. Zoomed out, the window holds (nearly) every event,
// yet only those whose rows meet the visible band are drawn — a small
// fraction when the timeline has many rows. This index groups events by their
// upper row and, within a group, orders them by their lower row, so the
// events crossing a band are found without scanning the rest: those starting
// inside the band, plus, from each group above it, the prefix that reaches
// down into it. It is built lazily, the first time a frame needs it after the
// data or the row order changed.

import type { DataStore } from '../model/store';

export class RowIntervalIndex {
  /** Group start per top row, into `events`/`bottoms` (length rows + 1). */
  private start = new Int32Array(0);
  /** Event indices, grouped by top row, each group by bottom row descending. */
  private events = new Int32Array(0);
  private bottoms = new Int32Array(0);
  private rows = 0;
  private builtFor: { events: number; slots: unknown } | null = null;

  /** Drop the index (the data or the layout changed). */
  invalidate(): void {
    this.builtFor = null;
  }

  /**
   * (Re)build for the current data and row mapping, unless already current.
   * `layoutKey` changes whenever rows were re-ordered.
   */
  ensure<TData>(
    store: DataStore<TData>,
    slotRow: Int32Array,
    rowCount: number,
    layoutKey: unknown,
  ): void {
    const built = this.builtFor;
    if (
      built !== null &&
      built.events === store.eventsVersion &&
      built.slots === layoutKey
    ) {
      return;
    }
    this.builtFor = { events: store.eventsVersion, slots: layoutKey };
    const n = store.eventCount;
    const sources = store.eventSources;
    const targets = store.eventTargets;
    this.rows = rowCount;
    const counts = new Int32Array(rowCount + 1);
    const tops = new Int32Array(n);
    const bottoms = new Int32Array(n);
    for (let i = 0; i < n; i++) {
      const a = slotRow[sources[i] as number] as number;
      const b = slotRow[targets[i] as number] as number;
      if (a < 0 || b < 0) {
        tops[i] = -1;
        continue;
      }
      tops[i] = Math.min(a, b);
      bottoms[i] = Math.max(a, b);
      (counts[tops[i] as number] as number)++;
    }
    this.start = new Int32Array(rowCount + 1);
    let total = 0;
    for (let r = 0; r < rowCount; r++) {
      this.start[r] = total;
      total += counts[r] as number;
    }
    this.start[rowCount] = total;
    this.events = new Int32Array(total);
    this.bottoms = new Int32Array(total);
    const cursor = this.start.slice(0, rowCount);
    for (let i = 0; i < n; i++) {
      const top = tops[i] as number;
      if (top < 0) continue;
      this.events[(cursor[top] as number)++] = i;
    }
    // Within a group, deepest-reaching first, so "reaches row a" is a prefix.
    for (let r = 0; r < rowCount; r++) {
      const s = this.start[r] as number;
      const e = this.start[r + 1] as number;
      if (e - s > 1) {
        this.events
          .subarray(s, e)
          .sort((x, y) => (bottoms[y] as number) - (bottoms[x] as number));
      }
      for (let j = s; j < e; j++) {
        this.bottoms[j] = bottoms[this.events[j] as number] as number;
      }
    }
  }

  /**
   * Event indices in `[lo, hi)` whose rows meet `[first, last]`, ascending
   * (time order), written into `out`; returns how many.
   */
  query(
    first: number,
    last: number,
    lo: number,
    hi: number,
    out: Int32Array,
  ): number {
    let n = 0;
    const end = Math.min(last, this.rows - 1);
    for (let r = 0; r <= end; r++) {
      const s = this.start[r] as number;
      const e = this.start[r + 1] as number;
      for (let j = s; j < e; j++) {
        // Groups above the band are ordered deepest first: stop at the first
        // event that ends above the band.
        if (r < first && (this.bottoms[j] as number) < first) break;
        const index = this.events[j] as number;
        if (index >= lo && index < hi) out[n++] = index;
      }
    }
    out.subarray(0, n).sort();
    return n;
  }

  /** Upper bound on {@link query}'s count, ignoring the time window. */
  estimate(first: number, last: number): number {
    let n = 0;
    const end = Math.min(last, this.rows - 1);
    for (let r = 0; r <= end; r++) {
      const s = this.start[r] as number;
      const e = this.start[r + 1] as number;
      if (r >= first) {
        n += e - s;
        continue;
      }
      // Binary search the prefix still reaching row `first`.
      let a = s;
      let b = e;
      while (a < b) {
        const mid = (a + b) >>> 1;
        if ((this.bottoms[mid] as number) >= first) a = mid + 1;
        else b = mid;
      }
      n += a - s;
    }
    return n;
  }
}
