// The per-frame clustering pass (DESIGN.md §6).
//
// Groups the visible events (in time order, so ascending screen-x) by key and
// cuts each group into runs: an event joins its key's open run while it lies
// within `minSeparationPx` of the run's FIRST event, so a run spans at most
// that distance and never chains across the viewport. No state survives the
// frame, so live updates stay cheap and "expand on zoom-in" is automatic.

import { DAY_MS } from '../model/time';

/**
 * Runs of candidates, reused across frames. Candidate positions of run `r`
 * are `members[start[r] .. start[r] + size[r])`, in time order.
 */
export class ClusterRuns {
  count = 0;
  start = new Int32Array(64);
  size = new Int32Array(64);
  members = new Int32Array(64);
  private firstX = new Float64Array(64);
  private tail = new Int32Array(64);
  private next = new Int32Array(64);
  private readonly open = new Map<number | string, number>();

  /**
   * Cut `n` candidates (screen-x in `x`, ascending) into runs by `keyOf`.
   * With `minSeparationPx` < 0 every candidate is its own run.
   */
  build(
    n: number,
    x: Float64Array,
    keyOf: (candidate: number) => number | string,
    minSeparationPx: number,
  ): void {
    this.ensure(n);
    this.open.clear();
    let runs = 0;
    for (let k = 0; k < n; k++) {
      this.next[k] = -1;
      const xk = x[k] as number;
      const key = minSeparationPx < 0 ? k : keyOf(k);
      const r = this.open.get(key);
      if (
        r === undefined ||
        xk - (this.firstX[r] as number) > minSeparationPx
      ) {
        this.firstX[runs] = xk;
        this.start[runs] = k; // head, until members are laid out below
        this.tail[runs] = k;
        this.size[runs] = 1;
        this.open.set(key, runs);
        runs++;
      } else {
        this.next[this.tail[r] as number] = k;
        this.tail[r] = k;
        (this.size[r] as number)++;
      }
    }
    // Lay each run's members out contiguously, in time order.
    let offset = 0;
    for (let r = 0; r < runs; r++) {
      let k = this.start[r] as number;
      this.start[r] = offset;
      while (k >= 0) {
        this.members[offset++] = k;
        k = this.next[k] as number;
      }
    }
    this.count = runs;
  }

  private ensure(n: number): void {
    if (n <= this.members.length) return;
    const size = Math.max(n, this.members.length * 2);
    this.start = new Int32Array(size);
    this.size = new Int32Array(size);
    this.members = new Int32Array(size);
    this.firstX = new Float64Array(size);
    this.tail = new Int32Array(size);
    this.next = new Int32Array(size);
  }
}

/** Inputs for the built-in numeric keys. */
export interface FastKeyInput {
  /** Screen-x (CSS px) per candidate. */
  x: Float64Array;
  /** Event time per candidate. */
  time: Float64Array;
  /** Source and target element slots per candidate. */
  source: Int32Array;
  target: Int32Array;
  elementCount: number;
  minSeparationPx: number;
}

/**
 * A numeric key function equivalent to a built-in strategy's `key()`, reading
 * only typed columns. Pair and column are packed into one safe integer.
 */
export function fastKeyFunction(
  kind: 'column' | 'pair' | 'day' | 'pair-column',
  input: FastKeyInput,
): (candidate: number) => number {
  const { x, time, source, target, elementCount, minSeparationPx } = input;
  const column = (k: number) => Math.floor((x[k] as number) / minSeparationPx);
  const pair = (k: number) =>
    (source[k] as number) * elementCount + (target[k] as number);
  switch (kind) {
    case 'column':
      return column;
    case 'pair':
      return pair;
    case 'day':
      return (k) => Math.floor((time[k] as number) / DAY_MS);
    case 'pair-column': {
      // Columns lie within ±32k of zero for any real viewport (viewport width
      // / minSeparationPx); the offset keeps them non-negative so the packing
      // stays injective, and pair × 2^16 stays exact up to ~370k elements.
      const COLUMNS = 1 << 16;
      const OFFSET = 1 << 15;
      return (k) => pair(k) * COLUMNS + column(k) + OFFSET;
    }
  }
}
