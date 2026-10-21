// HTML hover tooltip (DESIGN.md §9, §12).
//
// Hit-testing happens on the canvas (core); the tooltip is plain HTML so its
// text stays crisp and selectable. It is portalled to `document.body` and
// positioned with `fixed` next to the pointer, flipping to the other side of
// the cursor near the viewport's right and bottom edges. The position is
// written straight to the element on pointer moves, so moving the pointer
// never re-renders React. SSR-safe: renders nothing on the server.

import { createPortal } from 'react-dom';
import {
  forwardRef,
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type ForwardedRef,
  type ReactNode,
} from 'react';
import {
  defaultTheme,
  type Formatters,
  type HitResult,
  type ThemeInput,
} from '@event-timeline/core';

export interface TooltipProps<TData = unknown> {
  /** The current hover hit; the tooltip renders nothing for null. */
  hit: HitResult<TData> | null;
  /** Initial pointer position in client (viewport) pixels. */
  x: number;
  y: number;
  /**
   * Custom content. Returning `null`, `undefined` or `false` hides the
   * tooltip for that hit.
   */
  render?: (hit: HitResult<TData>) => ReactNode;
  /** Formatters, so the default text matches the canvas labels. */
  formatters?: Formatters<TData>;
  /** Theme the default styling is derived from. */
  theme?: ThemeInput;
}

/** Gap between the pointer and the tooltip, in CSS px. */
export const TOOLTIP_OFFSET_PX = 12;
/** Members a cluster tooltip lists before summarising the rest. */
const CLUSTER_LIST_MAX = 5;

/**
 * Place the tooltip beside (x, y), flipping left/up when it would overflow
 * the viewport's right/bottom edge.
 */
export function placeTooltip(el: HTMLElement, x: number, y: number): void {
  const view = el.ownerDocument.defaultView;
  const width = el.offsetWidth;
  const height = el.offsetHeight;
  const vw = view?.innerWidth ?? Infinity;
  const vh = view?.innerHeight ?? Infinity;
  let left = x + TOOLTIP_OFFSET_PX;
  if (left + width > vw) left = Math.max(0, x - TOOLTIP_OFFSET_PX - width);
  let top = y + TOOLTIP_OFFSET_PX;
  if (top + height > vh) top = Math.max(0, y - TOOLTIP_OFFSET_PX - height);
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
}

function eventText<TData>(
  event: Extract<HitResult<TData>, { kind: 'event' }>['event'],
  formatters?: Formatters<TData>,
): string {
  const label = formatters?.eventLabel
    ? formatters.eventLabel(event)
    : event.label;
  return label || `${event.sourceId} → ${event.targetId}`;
}

/** Default tooltip content for a hit, using the host's label formatters. */
export function defaultTooltipContent<TData>(
  hit: HitResult<TData>,
  formatters?: Formatters<TData>,
): ReactNode {
  switch (hit.kind) {
    case 'event':
      return eventText(hit.event, formatters);
    case 'element':
      return formatters?.elementLabel
        ? formatters.elementLabel(hit.element)
        : typeof hit.element.label === 'string'
          ? hit.element.label
          : hit.element.id;
    case 'cluster': {
      const shown = hit.events.slice(0, CLUSTER_LIST_MAX);
      const rest = hit.count - shown.length;
      return (
        <>
          <div style={{ fontWeight: 600 }}>{hit.count} events</div>
          {shown.map((event) => (
            <div key={event.id}>{eventText(event, formatters)}</div>
          ))}
          {rest > 0 ? <div>… and {rest} more</div> : null}
        </>
      );
    }
  }
}

function tooltipStyle(theme?: ThemeInput): CSSProperties {
  return {
    position: 'fixed',
    left: 0,
    top: 0,
    pointerEvents: 'none',
    zIndex: 2147483647,
    padding: '4px 8px',
    borderRadius: 4,
    background: theme?.background ?? defaultTheme.background,
    color: theme?.element?.labelColor ?? defaultTheme.element.labelColor,
    border: `1px solid ${theme?.grid?.color ?? defaultTheme.grid.color}`,
    font: theme?.element?.labelFont ?? defaultTheme.element.labelFont,
    whiteSpace: 'nowrap',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.4)',
  };
}

function TooltipInner<TData>(
  { hit, x, y, render, formatters, theme }: TooltipProps<TData>,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const local = useRef<HTMLDivElement | null>(null);
  const content =
    hit === null
      ? null
      : render
        ? render(hit)
        : defaultTooltipContent(hit, formatters);
  const visible =
    hit !== null &&
    content !== null &&
    content !== undefined &&
    content !== false;

  // Position after layout so the flip can use the rendered size.
  useLayoutEffect(() => {
    if (visible && local.current !== null) placeTooltip(local.current, x, y);
  });

  if (!visible || typeof document === 'undefined') return null;
  return createPortal(
    <div
      ref={(el) => {
        local.current = el;
        if (typeof ref === 'function') ref(el);
        else if (ref !== null) ref.current = el;
      }}
      data-testid="timeline-tooltip"
      role="tooltip"
      style={tooltipStyle(theme)}
    >
      {content}
    </div>,
    document.body,
  );
}

/** The default hover tooltip. */
export const Tooltip = forwardRef(TooltipInner) as <TData = unknown>(
  props: TooltipProps<TData> & { ref?: ForwardedRef<HTMLDivElement> },
) => ReturnType<typeof TooltipInner>;
