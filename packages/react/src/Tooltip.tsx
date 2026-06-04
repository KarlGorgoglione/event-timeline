// HTML hover tooltip (DESIGN.md §9, §12).
//
// Hover hit-testing happens on the canvas (core); the tooltip is plain HTML so
// its text stays crisp (no canvas-text blur) and selectable. It is portalled to
// `document.body` and positioned with `fixed` at the pointer's client
// coordinates, so it is never clipped by the timeline container's `overflow:
// hidden`. SSR-safe: renders nothing until a hover hit exists on the client.

import { createPortal } from 'react-dom';
import type { CSSProperties, ReactPortal } from 'react';
import type { HitResult } from '@timeline/core';

export interface TooltipProps<TData = unknown> {
  /** The current hover hit, or null when nothing is hovered. */
  hit: HitResult<TData> | null;
  /** Pointer position in client (viewport) pixels. */
  x: number;
  y: number;
}

/** Default tooltip text for a hit; host-customisable content arrives in Phase 6. */
function defaultContent(hit: HitResult): string {
  switch (hit.kind) {
    case 'event':
      return hit.event.label ?? `${hit.event.sourceId} → ${hit.event.targetId}`;
    case 'element':
      return hit.element.label;
    case 'cluster':
      return `${hit.count} events`;
  }
}

const tooltipStyle: CSSProperties = {
  position: 'fixed',
  pointerEvents: 'none',
  zIndex: 2147483647,
  padding: '4px 8px',
  borderRadius: 4,
  background: 'rgba(20, 24, 31, 0.95)',
  color: '#e6e6e6',
  font: '12px system-ui, sans-serif',
  whiteSpace: 'nowrap',
  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.4)',
};

export function Tooltip<TData>({
  hit,
  x,
  y,
}: TooltipProps<TData>): ReactPortal | null {
  if (hit === null || typeof document === 'undefined') return null;
  return createPortal(
    <div
      data-testid="timeline-tooltip"
      role="tooltip"
      style={{ ...tooltipStyle, left: x + 12, top: y + 12 }}
    >
      {defaultContent(hit)}
    </div>,
    document.body,
  );
}
