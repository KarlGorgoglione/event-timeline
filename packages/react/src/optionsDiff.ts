// Field-level option diffing for the React binding (DESIGN.md §12).
//
// Hosts often pass options, themes and resolvers inline, which creates new
// objects on every render. Comparing structurally (plain objects and arrays
// by content, everything else by reference) means an inline
// `options={{ multiSelect: true }}` sends nothing to the engine on re-render,
// and a real change sends only the fields that changed.

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value) as unknown;
  return proto === Object.prototype || proto === null;
}

/** Structural equality for plain data; reference equality for the rest. */
export function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => sameValue(v, b[i]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = Object.keys(a);
    if (keys.length !== Object.keys(b).length) return false;
    return keys.every((k) => k in b && sameValue(a[k], b[k]));
  }
  return false;
}

/**
 * The fields of `next` that differ from `previous` (a field removed in `next`
 * is reported as `undefined`, restoring its default), or null when nothing
 * changed.
 */
export function changedFields<T extends object>(
  previous: T,
  next: T,
): Partial<T> | null {
  const patch: Partial<T> = {};
  let changed = false;
  const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);
  for (const key of keys as Set<keyof T & string>) {
    if (!sameValue(previous[key], next[key])) {
      patch[key] = next[key];
      changed = true;
    }
  }
  return changed ? patch : null;
}
