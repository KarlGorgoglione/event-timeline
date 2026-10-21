// Hit-test result type (DESIGN.md §9).
//
// A discriminated union so consumers narrow on `kind` and get a typed `data`
// payload.

import type { TimelineElement, TimelineEvent } from '../model/types';

export type HitResult<TData = unknown> =
  | { kind: 'element'; element: TimelineElement<TData> }
  | { kind: 'event'; event: TimelineEvent<TData> }
  | { kind: 'cluster'; events: TimelineEvent<TData>[]; count: number };
