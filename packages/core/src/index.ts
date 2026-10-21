// Public entry point for @event-timeline/core.
//
// The engine facade plus the domain, option, theme, strategy and renderer
// types hosts need. Internals (Camera, DataStore, painters, controllers) are
// not exported, keeping the public surface small (DESIGN.md §2).

export { VERSION } from './version';

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
  ThemeInput,
  GridStyle,
  HeaderStyle,
  LayoutStyle,
  EmphasisStyle,
  ClusterStyle,
} from './model/types';

export type {
  Diagnostic,
  DiagnosticCode,
  DiagnosticSubject,
  OnDiagnostic,
} from './model/diagnostics';
export type { DataChangeCounts } from './model/store';

export { TimelineEngine } from './engine/timeline';
export type { MountOptions } from './engine/timeline';
export type {
  TimelineEngineOptions,
  TimelineOptions,
  ClusteringOptions,
  LodOptions,
  StyleResolvers,
  Formatters,
  FrameStats,
  AccessibilityOptions,
  PointerOptions,
} from './engine/options';
export type { TimelineEventMap } from './engine/emitter';
export type { ViewportState } from './engine/view';
export type { FrameSource } from './engine/scheduler';
export type { Selection, SelectionInput } from './interaction/selection';
export type { EventLabelPlacement } from './scene/context';
export type {
  Renderer,
  RendererLayers,
  RendererBackend,
  RendererPreference,
  RendererImage,
  TextMetricsLite,
  LineBatch,
  TextBatch,
  ArrowheadBatch,
  NodeBatch,
  RectBatch,
  ImageItem,
  ImageBatch,
} from './render/types';

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
// ClusterContext is the argument a ClusterStrategy receives.
export type { ClusterStrategy, ClusterContext } from './cluster/types';

export { defaultTheme } from './engine/theme';

export type { HitResult } from './interaction/hit';
