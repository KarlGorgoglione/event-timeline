// Public entry point for @timeline/core.
//
// Phase 0 ships only the foundational vocabulary so the package builds, types,
// and is importable by @timeline/react and the demo. The engine
// (Camera, TimeScale, Renderer, indexes, layout) arrives in Phase 1+ per
// docs/DESIGN.md.

/** Current package version placeholder; real releases are driven by Changesets. */
export const VERSION = '0.0.0';

/**
 * A continuous timestamp in milliseconds since the Unix epoch (UTC).
 *
 * "Date-level" granularity is a display concern, not storage: all calendar
 * interpretation (day boundaries, tick labels, day-clustering) is done in UTC,
 * but the stored value is always milliseconds (docs/DESIGN.md §1).
 */
export type Time = number;
