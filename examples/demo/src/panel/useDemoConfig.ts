import { useCallback, useReducer, useRef } from 'react';
import { DEFAULT_CONFIG, type DemoConfig } from './config';

// One reducer, one immutable path updater (§ DRY): every control edits the
// config through `bind(...path)`, which returns a stable setter for that path.
// Presets/reset are a single `apply(wholeConfig)`.

type Action =
  | { type: 'update'; path: readonly string[]; value: unknown }
  | { type: 'apply'; config: DemoConfig };

type Obj = Record<string, unknown>;

/** Immutably set `value` at `path`, cloning only the nodes along the way. */
function setPath(obj: Obj, path: readonly string[], value: unknown): Obj {
  const [head, ...rest] = path;
  if (head === undefined) return obj;
  return {
    ...obj,
    [head]: rest.length === 0 ? value : setPath(obj[head] as Obj, rest, value),
  };
}

function reducer(state: DemoConfig, action: Action): DemoConfig {
  switch (action.type) {
    case 'update':
      return setPath(
        state as unknown as Obj,
        action.path,
        action.value,
      ) as unknown as DemoConfig;
    case 'apply':
      return action.config;
  }
}

/** A setter factory: `bind<T>(...path)` returns a stable `(value: T) => void`. */
export type Bind = <T>(...path: string[]) => (value: T) => void;

export interface DemoConfigApi {
  config: DemoConfig;
  bind: Bind;
  apply: (config: DemoConfig) => void;
}

export function useDemoConfig(): DemoConfigApi {
  const [config, dispatch] = useReducer(reducer, DEFAULT_CONFIG);

  // Cache one setter per path so controls receive a stable `onChange` identity
  // across renders. The closure captures only the (constant) path, so caching
  // it forever is safe — `dispatch` is itself stable. `bind` itself is a plain
  // generic function (a generic can't round-trip through `useCallback`); its
  // identity changing per render is harmless since the cached setters are stable.
  const cache = useRef(new Map<string, (value: never) => void>());
  function bind<T>(...path: string[]): (value: T) => void {
    const key = path.join('.');
    const cached = cache.current.get(key);
    if (cached) return cached as (value: T) => void;
    const setter = (value: T) => dispatch({ type: 'update', path, value });
    cache.current.set(key, setter as (value: never) => void);
    return setter;
  }

  const apply = useCallback(
    (next: DemoConfig) => dispatch({ type: 'apply', config: next }),
    [],
  );

  return { config, bind, apply };
}
