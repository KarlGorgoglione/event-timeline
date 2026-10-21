// Tiny external stores for values that change many times a second (the
// viewport while panning, frame timings, the event log). Components that show
// them subscribe directly, so a pan never re-renders the whole app.

import { useEffect, useState, useSyncExternalStore } from 'react';

export interface Store<T> {
  get: () => T;
  set: (value: T) => void;
  subscribe: (listener: () => void) => () => void;
}

export function createStore<T>(initial: T): Store<T> {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(next) {
      if (Object.is(next, value)) return;
      value = next;
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function useStore<T>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}

/** A fixed-size ring of the latest entries, read by polling. */
export class Ring<T> {
  private items: T[] = [];
  /** Bumped on every push, so pollers can skip unchanged reads. */
  version = 0;
  constructor(private readonly capacity: number) {}
  push(item: T): void {
    this.items.push(item);
    if (this.items.length > this.capacity) this.items.shift();
    this.version++;
  }
  clear(): void {
    this.items = [];
    this.version++;
  }
  values(): readonly T[] {
    return this.items;
  }
}

/** Re-render at most every `ms` while `read` returns something new. */
export function usePolled<T>(read: () => T, ms: number, key: unknown = 0): T {
  const [value, setValue] = useState(read);
  useEffect(() => {
    setValue(read);
    const id = setInterval(() => setValue(read), ms);
    return () => clearInterval(id);
    // `read` is recreated every render; polling restarts only when `key` does.
  }, [ms, key]);
  return value;
}
