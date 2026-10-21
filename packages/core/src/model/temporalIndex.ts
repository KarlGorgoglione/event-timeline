// Binary search over the sorted event times (DESIGN.md §5).
//
// Horizontal culling is "binary search for [tStart, tEnd] → O(log n + k)".
// The store keeps event times in an ascending typed array; these helpers find
// the bounds of a time window in its first `count` entries.

/** First index `i` in `[0, count]` with `times[i] >= t`. */
export function lowerBound(
  times: ArrayLike<number>,
  count: number,
  t: number,
): number {
  let lo = 0;
  let hi = count;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if ((times[mid] as number) < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** First index `i` in `[0, count]` with `times[i] > t`. */
export function upperBound(
  times: ArrayLike<number>,
  count: number,
  t: number,
): number {
  let lo = 0;
  let hi = count;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if ((times[mid] as number) <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
