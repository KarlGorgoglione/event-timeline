// Typed pub/sub for engine events (DESIGN.md §9).
//
// The event map is typed so `on`/`off` are checked against each event's
// payload type.

import type { HitResult } from '../interaction/hit';
import type { Selection } from '../interaction/selection';
import type { DataChangeCounts } from '../model/store';
import type { ViewportState } from './view';

export interface TimelineEventMap<TData = unknown> {
  /** The visible window changed; emitted at most once per frame. */
  viewportChange: ViewportState;
  hover: HitResult<TData> | null;
  click: {
    hit: HitResult<TData>;
    modifiers: { ctrlOrMeta: boolean; shift: boolean };
  };
  selectionChange: Selection;
  dataChange: DataChangeCounts;
  /** The engine is constructed and its API usable (a microtask after `new`). */
  ready: void;
  /** The first base frame has been drawn. */
  firstFrame: void;
}

type Listener<T> = (payload: T) => void;

export class TypedEmitter<M> {
  private readonly listeners = new Map<keyof M, Set<Listener<unknown>>>();

  on<K extends keyof M>(key: K, fn: Listener<M[K]>): () => void {
    let set = this.listeners.get(key);
    if (set === undefined) {
      set = new Set();
      this.listeners.set(key, set);
    }
    set.add(fn as Listener<unknown>);
    return () => this.off(key, fn);
  }

  off<K extends keyof M>(key: K, fn: Listener<M[K]>): void {
    this.listeners.get(key)?.delete(fn as Listener<unknown>);
  }

  emit<K extends keyof M>(key: K, payload: M[K]): void {
    const set = this.listeners.get(key);
    if (set === undefined) return;
    for (const fn of set) (fn as Listener<M[K]>)(payload);
  }

  clear(): void {
    this.listeners.clear();
  }
}
