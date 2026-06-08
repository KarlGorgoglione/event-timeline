export { Timeline } from './Timeline';
export type { TimelineProps, TimelineHandle } from './Timeline';
export { Tooltip } from './Tooltip';
export type { TooltipProps } from './Tooltip';
export type { TimelineOptions } from './useTimeline';

// Re-export the core domain types hosts need to type their `data`/callbacks.
export type {
  TimelineData,
  TimelineElement,
  TimelineEvent,
  HitResult,
  Time,
  LayoutStrategy,
  // Theming & customisation surface (DESIGN.md §11, §12).
  Theme,
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
  FrameStats,
} from '@event-timeline/core';

// Built-in layout strategies (DESIGN.md §7), so hosts can name one in `options`.
export { byFirstEvent, barycenter, explicit } from '@event-timeline/core';

// The dark theme default (base of the §11 resolution chain), so hosts can read
// or compose against it when building a `Partial<Theme>`.
export { defaultTheme } from '@event-timeline/core';
