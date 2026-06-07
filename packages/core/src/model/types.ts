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
 * A stroke dash pattern in CSS px, with the same semantics as the Canvas
 * `setLineDash` argument: alternating on/off lengths. The empty array `[]` (the
 * default everywhere) means a solid line. Plumbed through the Renderer seam and
 * scaled to device px at the single snap boundary (DESIGN.md §3, §4, §11).
 */
export type LineDash = number[];

/**
 * Optional separator line drawn between element rows (DESIGN.md §11). This is a
 * "border" between lanes, not a background fill. Off by default so existing
 * themes render unchanged.
 */
export interface RowSeparatorStyle {
  enabled: boolean;
  color: string;
  width: number;
  /** `[]` = solid. */
  dash: LineDash;
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
  /** Dash pattern for the element line; `[]` = solid (DESIGN.md §11). */
  lineDash: LineDash;
  labelColor: string;
  /** CSS font shorthand, e.g. "12px Inter, sans-serif". */
  labelFont: string;
  iconSize: number;
}

/** The complete set of stylable event properties (DESIGN.md §11). Sizes are CSS px. */
export interface EventStyle {
  arrowColor: string;
  arrowWidth: number;
  /** Dash pattern for the arrow riser / self-loop; `[]` = solid. Arrowheads stay solid. */
  arrowDash: LineDash;
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
  /** Gridline stroke width in CSS px. */
  gridlineWidth: number;
  /** Gridline dash; `[]` = solid. */
  gridlineDash: LineDash;
  headerTextColor: string;
  headerFont: string;
  /** Height of the (multi-row) time header in CSS px. */
  headerHeight: number;
  /** Vertical centre of the major tick label, as a fraction of `headerHeight`. */
  headerMajorTickRatio: number;
  /** Vertical centre of the minor tick label, as a fraction of `headerHeight`. */
  headerMinorTickRatio: number;
  rowHeight: number;
  rowGap: number;
  labelPadding: number;
  /** Horizontal lead drawn before an element's first event, in CSS px. */
  lineLeadPadding: number;
  /** Gap between the start marker block and the line's left end, in CSS px. */
  markerGap: number;
  /** Gap between a riser/marker and its event label, in CSS px. */
  eventLabelGap: number;
  /** Overlay colour for the hovered primitive (DESIGN.md §9). */
  hoverColor: string;
  /** Overlay colour for selected primitives' outlines (DESIGN.md §9). */
  selectionColor: string;
  /** Extra stroke width added to a hovered primitive in the overlay, in CSS px. */
  hoverWidthBonus: number;
  /** Extra stroke width added to a selected primitive in the overlay, in CSS px. */
  selectionWidthBonus: number;
  /** Extra radius added to a hovered/selected node dot & arrowhead, in CSS px. */
  emphasisRadiusBonus: number;
  /** Colour of collapsed-event cluster markers (DESIGN.md §6). */
  clusterColor: string;
  /** Colour of the cluster "×N" count label (defaults to `clusterColor`). */
  clusterTextColor: string;
  /** Extra radius a cluster marker gets over an ordinary node dot, in CSS px. */
  clusterMarkerBonus: number;
  /** Separator lines drawn between rows (off by default). */
  rowSeparator: RowSeparatorStyle;
  /** Theme-level element defaults (base of the resolution chain). */
  element: ElementStyle;
  /** Theme-level event defaults (base of the resolution chain). */
  event: EventStyle;
}
