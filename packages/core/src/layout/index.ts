// Layout strategies barrel (DESIGN.md §7).
//
// The built-in vertical ordering strategies plus the pluggable contract hosts
// implement to supply their own.

export type { LayoutStrategy } from './types';
export { byFirstEvent } from './byFirstEvent';
export { barycenter } from './barycenter';
export { explicit } from './explicit';
export { stableAppend } from './stableAppend';
