// Public entry point for @event-timeline/core.
//
// Phase 1 exposes the engine facade (TimelineEngine) plus the domain, layout,
// theme, and diagnostic types hosts need. The internals — Camera, DataStore,
// Renderer/Canvas2DRenderer, scheduler, controllers — are deliberately NOT
// exported, keeping the seam and the bundle surface minimal (DESIGN.md §2).

/** Current package version placeholder; real releases are driven by Changesets. */
export const VERSION = '0.0.0';

export type {
  Time,
  TimelineElement,
  TimelineEvent,
  TimelineData,
  ElementStyle,
  EventStyle,
  LineDash,
  RowSeparatorStyle,
  Theme,
} from './model/types';

export type {
  Diagnostic,
  DiagnosticCode,
  OnDiagnostic,
} from './model/diagnostics';

export { TimelineEngine } from './engine/timeline';
export type {
  TimelineEngineOptions,
  ClusteringOptions,
  LodOptions,
  StyleResolvers,
  Formatters,
  FrameStats,
} from './engine/timeline';
export type { TimelineEventMap } from './engine/emitter';

export { overlayStyle } from './render/resolveStyle';
export type {
  ElementStyleResolver,
  EventStyleResolver,
} from './render/resolveStyle';
export type { TickFormatter, TickLevel } from './scale/ticks';

export { byFirstEvent, barycenter, explicit } from './layout';
export type { LayoutStrategy } from './layout/types';

export {
  byPixelColumn,
  byElementPair,
  byDay,
  bySourceTargetColumn,
} from './cluster/strategies';
export type { ClusterStrategy, ClusterContext, Cluster } from './cluster/types';

export { defaultTheme } from './engine/theme';

export type { HitResult } from './interaction/hit';
