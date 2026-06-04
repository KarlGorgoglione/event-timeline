// Trailing-edge debounce (DESIGN.md §7 "debounced recompute", §10).
//
// Coalesces rapid calls into a single trailing invocation with the latest
// arguments — used so high-frequency data mutations re-run layout once rather
// than per mutation. Framework-free and timer-based (no rAF), so it is testable
// with fake timers and reusable outside the render loop. `setTimeout` is
// referenced lazily inside the call so the module stays import-safe in SSR.

export interface Debounced<TArgs extends unknown[]> {
  (...args: TArgs): void;
  /** Drop any pending trailing call (idempotent — safe to call when idle). */
  cancel(): void;
  /** Run a pending trailing call now, if one is scheduled. */
  flush(): void;
}

export function debounce<TArgs extends unknown[]>(
  fn: (...args: TArgs) => void,
  delayMs: number,
): Debounced<TArgs> {
  let handle: ReturnType<typeof setTimeout> | null = null;
  let pendingArgs: TArgs | null = null;

  const run = () => {
    handle = null;
    if (pendingArgs === null) return;
    const args = pendingArgs;
    pendingArgs = null;
    fn(...args);
  };

  const debounced = ((...args: TArgs) => {
    pendingArgs = args;
    if (handle !== null) clearTimeout(handle);
    handle = setTimeout(run, delayMs);
  }) as Debounced<TArgs>;

  debounced.cancel = () => {
    if (handle !== null) {
      clearTimeout(handle);
      handle = null;
    }
    pendingArgs = null;
  };

  debounced.flush = () => {
    if (handle !== null) {
      clearTimeout(handle);
      run();
    }
  };

  return debounced;
}
