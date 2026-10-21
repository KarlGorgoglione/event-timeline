export { Timeline } from './Timeline';
export type { TimelineProps, TimelineHandle } from './Timeline';
export { Tooltip, defaultTooltipContent } from './Tooltip';
export type { TooltipProps } from './Tooltip';
export { useTimeline } from './useTimeline';
export type { TimelineOptions, UseTimelineArgs } from './useTimeline';

// Core types hosts need to type their data, callbacks and customisation.
export type {
  TimelineData,
  TimelineElement,
  TimelineEvent,
  TimelineEngine,
  TimelineEventMap,
  HitResult,
  Time,
  Selection,
  SelectionInput,
  ViewportState,
  DataChangeCounts,
  Diagnostic,
  DiagnosticCode,
  LayoutStrategy,
  Theme,
  ThemeInput,
  GridStyle,
  HeaderStyle,
  LayoutStyle,
  EmphasisStyle,
  ClusterStyle,
  ElementStyle,
  EventStyle,
  LineDash,
  RowSeparatorStyle,
  StyleResolvers,
  Formatters,
  ElementStyleResolver,
  EventStyleResolver,
  EventLabelPlacement,
  TickFormatter,
  TickLevel,
  FrameStats,
  ClusterStrategy,
  ClusterContext,
  ClusteringOptions,
  LodOptions,
  RendererBackend,
  RendererPreference,
} from '@event-timeline/core';

// Built-in strategies and the default theme, so hosts can name them in props
// without importing core directly.
export {
  byFirstEvent,
  barycenter,
  explicit,
  byPixelColumn,
  byElementPair,
  byDay,
  bySourceTargetColumn,
  defaultTheme,
} from '@event-timeline/core';
