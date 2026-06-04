export { Timeline } from './Timeline';
export type { TimelineProps, TimelineHandle } from './Timeline';
export type { TimelineOptions } from './useTimeline';

// Re-export the core domain types hosts need to type their `data` prop.
export type {
  TimelineData,
  TimelineElement,
  TimelineEvent,
  Time,
} from '@timeline/core';
