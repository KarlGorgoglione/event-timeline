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
} from '@timeline/core';
