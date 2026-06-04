// Hit-test result type (DESIGN.md §9).
//
// A discriminated union so consumers narrow on `kind` and get a typed `data`
// payload. The type is part of the public contract from Phase 1; hit-testing
// that produces these results lands in Phase 3.

import type { TimelineElement, TimelineEvent } from '../model/types';

export type HitResult<TData = unknown> =
  | { kind: 'element'; element: TimelineElement<TData> }
  | { kind: 'event'; event: TimelineEvent<TData> }
  | { kind: 'cluster'; events: TimelineEvent<TData>[]; count: number };
