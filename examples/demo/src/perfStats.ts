// Pure summary statistics for the perf benchmark (DESIGN.md §13). Kept separate
// from the browser harness (`bench.ts`) and the Playwright spec so the maths is
// unit-testable in node without a canvas.

export interface PerfSummary {
  /** Number of samples kept (after warm-up discard). */
  count: number;
  min: number;
  /** The robust central estimate the perf gate asserts against (§13). */
  median: number;
  /** Tail estimate, logged as a watchdog. */
  p95: number;
}

/**
 * Median of a numeric sample. For an even count it averages the two middle
 * values; returns `NaN` for an empty sample. The input is not mutated.
 */
export function median(values: readonly number[]): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

/**
 * The `p`-quantile (0..1) by the nearest-rank method. `quantile(xs, 0.95)` is
 * the p95 used as a tail watchdog. Returns `NaN` for an empty sample.
 */
export function quantile(values: readonly number[], p: number): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil(p * sorted.length);
  const index = Math.min(sorted.length - 1, Math.max(0, rank - 1));
  return sorted[index]!;
}

/**
 * Summarise a sample after discarding the first `warmup` measurements, which
 * carry JIT warm-up and first-paint costs that are not steady-state (§13).
 */
export function summarize(values: readonly number[], warmup = 0): PerfSummary {
  const sample = values.slice(warmup);
  return {
    count: sample.length,
    min: sample.length > 0 ? Math.min(...sample) : NaN,
    median: median(sample),
    p95: quantile(sample, 0.95),
  };
}
