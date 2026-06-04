// Public entry point for @timeline/core.
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
  Theme,
} from './model/types';

export type {
  Diagnostic,
  DiagnosticCode,
  OnDiagnostic,
} from './model/diagnostics';

export { TimelineEngine } from './engine/timeline';
export type { TimelineEngineOptions } from './engine/timeline';
export type { TimelineEventMap } from './engine/emitter';

export { byFirstEvent } from './layout/byFirstEvent';
export type { LayoutStrategy } from './layout/types';

export { defaultTheme } from './engine/theme';

export type { HitResult } from './interaction/hit';
