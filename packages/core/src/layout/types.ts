// Vertical layout strategy contract (DESIGN.md §7).

import type { TimelineElement, TimelineEvent } from '../model/types';

export interface LayoutStrategy {
  /**
   * Pure function of the data: returns element ids in top-to-bottom order.
   * No rendering, no side effects, no pixels — trivially unit-testable.
   */
  order(
    elements: readonly TimelineElement[],
    events: readonly TimelineEvent[],
  ): string[];
}
