// Domain vocabulary for the timeline engine (DESIGN.md §1, §11).
//
// Types only — no logic. The host payload type `TData` is threaded through the
// public API so callbacks hand back a typed `data` instead of `unknown`; the
// engine itself never interprets `data`.

/**
 * A continuous timestamp in milliseconds since the Unix epoch (UTC).
 *
 * "Date-level" granularity is a display concern, not storage: all calendar
 * interpretation (day boundaries, tick labels, day-clustering) is done in UTC,
 * but the stored value is always milliseconds (DESIGN.md §1).
 */
export type Time = number;

/** An entity drawn as a horizontal line (lane). */
export interface TimelineElement<TData = unknown> {
  id: string;
  label: string;
  /** URL, emoji, or preloaded image; drawn in the label area (Phase 2+). */
  icon?: string | HTMLImageElement;
  /** Per-element style overrides, merged over the theme (Phase 6). */
  style?: Partial<ElementStyle>;
  /** Ordering hint honoured only by the `explicit` layout strategy (§7). */
  order?: number;
  /** Opaque host payload, echoed back verbatim in callbacks. */
  data?: TData;
}

/** A directed connector drawn as an arrow between two elements at a point in time. */
export interface TimelineEvent<TData = unknown> {
  id: string;
  /** Element the arrow leaves (source node dot). */
  sourceId: string;
  /** Element the arrow enters (arrowhead). */
  targetId: string;
  /** The moment the event occurs. */
  time: Time;
  label?: string;
  style?: Partial<EventStyle>;
  data?: TData;
}

/** A clean dataset handed to the engine to render. */
export interface TimelineData<TData = unknown> {
  elements: TimelineElement<TData>[];
  events: TimelineEvent<TData>[];
}

/**
 * The complete set of stylable element properties (DESIGN.md §11). The same
 * shape is reused at every level of the resolution chain (theme default →
 * resolver → per-item `style`), so there is one definition of "what is
 * stylable" rather than parallel shapes per layer (DRY). Sizes are CSS px.
 */
export interface ElementStyle {
  lineColor: string;
  lineWidth: number;
  labelColor: string;
  /** CSS font shorthand, e.g. "12px Inter, sans-serif". */
  labelFont: string;
  iconSize: number;
}

/** The complete set of stylable event properties (DESIGN.md §11). Sizes are CSS px. */
export interface EventStyle {
  arrowColor: string;
  arrowWidth: number;
  arrowheadSize: number;
  labelColor: string;
  labelFont: string;
  /** Source node dot radius. */
  nodeRadius: number;
}

/** Engine-wide theme: defaults plus structural metrics (DESIGN.md §11). */
export interface Theme {
  background: string;
  gridlineColor: string;
  headerTextColor: string;
  headerFont: string;
  /** Height of the (multi-row) time header in CSS px. */
  headerHeight: number;
  rowHeight: number;
  rowGap: number;
  labelPadding: number;
  /** Overlay colour for the hovered primitive (DESIGN.md §9). */
  hoverColor: string;
  /** Overlay colour for selected primitives' outlines (DESIGN.md §9). */
  selectionColor: string;
  /** Colour of collapsed-event cluster markers and their counts (DESIGN.md §6). */
  clusterColor: string;
  /** Theme-level element defaults (base of the resolution chain). */
  element: ElementStyle;
  /** Theme-level event defaults (base of the resolution chain). */
  event: EventStyle;
}
