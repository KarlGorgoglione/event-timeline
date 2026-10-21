// Row order and positions for the engine (DESIGN.md §7, §10).
//
// `'full'` runs the configured layout strategy (setData, an option change, or
// the opt-in streaming relayout); `'stable-append'` keeps existing rows and
// appends new elements (the streaming default). Strategy output is repaired
// before use, so a buggy custom strategy can't drop or duplicate rows.

import { computeRowLayout, type RowLayout } from '../layout/positions';
import { normalizeOrder } from '../layout/normalize';
import { stableAppend } from '../layout/stableAppend';
import type { LayoutStrategy } from '../layout/types';
import type { OnDiagnostic } from '../model/diagnostics';
import type { DataStore } from '../model/store';
import type { RowMetrics } from '../scale/camera';
import { debounce, type Debounced } from './debounce';

export interface LayoutModelDeps<TData> {
  store: DataStore<TData>;
  strategy: () => LayoutStrategy;
  /** Whether elements without events get a row (`emptyElements: 'show'`). */
  showEmpty: () => boolean;
  metrics: () => RowMetrics;
  onDiagnostic: (d: Parameters<OnDiagnostic>[0]) => void;
  /** Called after any recompute so the host can clamp scroll and redraw. */
  onChange: () => void;
}

export class LayoutModel<TData> {
  private current: RowLayout;
  private debounced: Debounced<[]> | null = null;

  constructor(private readonly deps: LayoutModelDeps<TData>) {
    this.current = computeRowLayout([], deps.metrics());
  }

  get rows(): RowLayout {
    return this.current;
  }

  /** Recompute now, with the strategy (`'full'`) or by appending (`'stable-append'`). */
  recompute(mode: 'full' | 'stable-append'): void {
    const ids =
      mode === 'full'
        ? this.strategyOrder()
        : stableAppend(this.current.orderedIds, this.laidOut());
    this.current = computeRowLayout(ids, this.deps.metrics());
  }

  /** Recompute the positions only, keeping the order (a metrics change). */
  refreshMetrics(): void {
    this.current = computeRowLayout(
      this.current.orderedIds,
      this.deps.metrics(),
    );
  }

  /**
   * Layout after an incremental mutation (§7, §10): stable-append applies at
   * once; `'full'` coalesces a burst into one debounced strategy run.
   */
  afterMutation(streaming: 'stable-append' | 'full', debounceMs: number): void {
    if (streaming === 'stable-append') {
      this.recompute('stable-append');
      return;
    }
    this.debounced ??= this.makeDebounced(debounceMs);
    this.debounced();
  }

  /** Drop a pending debounced relayout (e.g. its delay option changed). */
  resetDebounce(): void {
    this.debounced?.cancel();
    this.debounced = null;
  }

  dispose(): void {
    this.resetDebounce();
  }

  private makeDebounced(delayMs: number): Debounced<[]> {
    return debounce(() => {
      this.recompute('full');
      this.deps.onChange();
    }, delayMs);
  }

  /**
   * The elements that get a row: all of them with `emptyElements: 'show'`,
   * otherwise only those with events (§1) — so an element that loses its last
   * event leaves no blank lane behind.
   */
  private laidOut() {
    const { store } = this.deps;
    const elements = store.getElements();
    if (this.deps.showEmpty()) return elements;
    const mins = store.extentMins;
    return elements.filter((_, slot) => !Number.isNaN(mins[slot] as number));
  }

  private strategyOrder(): string[] {
    const elements = this.laidOut();
    const result = normalizeOrder(
      this.deps.strategy().order(elements, this.deps.store.getEvents()),
      elements.map((element) => element.id),
    );
    const { unknown, duplicate, missing } = result;
    if (unknown + duplicate + missing > 0) {
      this.deps.onDiagnostic({
        code: 'invalid-layout',
        kind: 'layout',
        reason: `layout strategy returned ${unknown} unknown, ${duplicate} duplicate and ${missing} missing id(s); repaired`,
      });
    }
    return result.ids;
  }
}
