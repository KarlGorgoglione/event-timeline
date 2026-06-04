// Typed pub/sub for engine events (DESIGN.md §9).
//
// The full event map is typed so on/off are checked against each event's
// payload type. Phase 1 only EMITS viewportChange, ready, and dataChange; the
// hover/click/selection events are part of the contract but fire from Phase 3.

import type { HitResult } from '../interaction/hit';

export interface TimelineEventMap<TData = unknown> {
  viewportChange: {
    timeRange: [number, number];
    scrollY: number;
    pxPerMs: number;
    visibleRowRange: [number, number];
  };
  hover: HitResult<TData> | null;
  click: {
    hit: HitResult<TData>;
    modifiers: { ctrlOrMeta: boolean; shift: boolean };
  };
  selectionChange: { ids: string[] };
  dataChange: { added: number; removed: number; updated: number };
  ready: void;
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
