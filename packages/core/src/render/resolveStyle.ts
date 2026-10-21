// Per-item style resolution (DESIGN.md §11).
//
// The §11 resolution order is, most specific wins: per-item `style` → resolver
// callback → theme default, each visual property resolved independently. This is
// expressed once here as an `overlayStyle` merge and reused for both element and
// event styles (DRY), so there is a single definition of "how a style is layered"
// rather than parallel `?? theme` chains scattered through the builders.

import type {
  ElementStyle,
  EventStyle,
  TimelineElement,
  TimelineEvent,
} from '../model/types';

/**
 * Overlay `partials` onto a complete `base`, later partials winning. A property
 * set to `undefined` (or absent) in a partial **falls through** to the previous
 * layer, matching the `?? theme.default` semantics each level previously used and
 * keeping per-property independence (§11): a partial only overrides the keys it
 * actually sets.
 */
export function overlayStyle<T extends object>(
  base: T,
  ...partials: Array<Partial<T> | undefined>
): T {
  const out = { ...base };
  for (const partial of partials) {
    if (partial === undefined) continue;
    for (const key of Object.keys(partial) as Array<keyof T>) {
      const value = partial[key];
      if (value !== undefined) out[key] = value;
    }
  }
  return out;
}

/** Data-driven element style override (§11); merged between theme and `.style`. */
export type ElementStyleResolver<TData = unknown> = (
  element: TimelineElement<TData>,
) => Partial<ElementStyle>;

/** Data-driven event style override (§11); merged between theme and `.style`. */
export type EventStyleResolver<TData = unknown> = (
  event: TimelineEvent<TData>,
) => Partial<EventStyle>;
