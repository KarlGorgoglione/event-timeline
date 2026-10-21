// Dotted paths into plain config objects (`'event.arrowColor'`), typed at
// compile time and walked at run time. The editor addresses every theme key and
// option by its path, so edits, resets, share links and the code export all
// share one vocabulary.

/** Dotted paths to the leaves of `T`. Arrays (dash patterns) are leaves. */
export type LeafPath<T> = {
  [K in keyof T & string]: T[K] extends readonly unknown[]
    ? K
    : T[K] extends object
      ? `${K}.${LeafPath<T[K]>}`
      : K;
}[keyof T & string];

/** The value type at a dotted path. */
export type PathValue<T, P extends string> = P extends `${infer K}.${infer R}`
  ? K extends keyof T
    ? PathValue<T[K], R>
    : never
  : P extends keyof T
    ? T[P]
    : never;

/** A sparse set of edits, keyed by leaf path. */
export type Edits<T> = { [P in LeafPath<T>]?: PathValue<T, P> };

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export function getPath(obj: unknown, path: string): unknown {
  let node: unknown = obj;
  for (const key of path.split('.')) {
    if (!isRecord(node)) return undefined;
    node = node[key];
  }
  return node;
}

/** A copy of `obj` with `value` at `path`; the untouched branches are shared. */
export function setPath<T>(obj: T, path: string, value: unknown): T {
  const [head, ...rest] = path.split('.') as [string, ...string[]];
  const node: Record<string, unknown> = isRecord(obj) ? obj : {};
  return {
    ...node,
    [head]:
      rest.length === 0 ? value : setPath(node[head], rest.join('.'), value),
  } as T;
}

/** Apply every edit over `base`, without mutating it. */
export function applyEdits<T>(base: T, edits: Edits<T>): T {
  let out = base;
  for (const [path, value] of Object.entries(edits)) {
    if (value !== undefined) out = setPath(out, path, value);
  }
  return out;
}

/** Every leaf path of a runtime object (arrays are leaves), in key order. */
export function leafPaths(obj: unknown, prefix = ''): string[] {
  if (!isRecord(obj)) return [];
  return Object.entries(obj).flatMap(([key, value]) =>
    isRecord(value)
      ? leafPaths(value, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );
}

/** Structural equality for config leaves (numbers, strings, dash arrays). */
export function sameValue(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => v === b[i]);
  }
  return Object.is(a, b);
}
