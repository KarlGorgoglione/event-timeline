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
  /** Shown at the line start; the id is shown when it is omitted. */
  label?: string;
  /**
   * Drawn above the label at the line start: a URL (loaded and cached), any
   * other string (an emoji or glyph, drawn as text), or an image source such
   * as an `HTMLImageElement`, `ImageBitmap` or canvas.
   */
  icon?: string | CanvasImageSource;
  /** Per-element style overrides, merged over the theme (§11). */
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
  /**
   * Reserved for events with a duration (the end of the interval), so adding
   * them later is not a breaking change. Validated — it must be a finite time
   * no earlier than `time`, else it is reported — but not drawn yet.
   */
  endTime?: Time;
  label?: string;
  style?: Partial<EventStyle>;
  data?: TData;
}

/**
 * A dataset handed to the engine. The engine copies what it indexes and
 * never writes to the arrays, so they may be frozen or shared.
 */
export interface TimelineData<TData = unknown> {
  elements: readonly TimelineElement<TData>[];
  events: readonly TimelineEvent<TData>[];
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
  /**
   * Background fill of the event label box (DESIGN.md §11). The box is part of the
   * label's *style*, so it is drawn the same way in every label placement
   * (`options.eventLabel.placement`) — placement only moves the label, never
   * restyles it. The default `'transparent'` paints no box, so the label renders
   * as plain text until a theme/resolver opts into a colour.
   */
  labelBoxBackground: string;
  /** Border colour of the event label box; `'transparent'` = no border. */
  labelBoxBorderColor: string;
  /** Border width of the event label box in CSS px; `0` = no border. */
  labelBoxBorderWidth: number;
  /** Border dash of the event label box; `[]` = solid, `[a,b]` = dashed. */
  labelBoxBorderDash: LineDash;
  /** Inner padding (text → box edge) of the event label box, in CSS px. */
  labelBoxPadding: number;
}

/** Vertical time gridlines. */
export interface GridStyle {
  color: string;
  /** Stroke width, CSS px. */
  width: number;
  /** `[]` = solid. */
  dash: LineDash;
}

/** The time header above the rows. */
export interface HeaderStyle {
  /** Height of the two-row header, CSS px. */
  height: number;
  textColor: string;
  /** CSS font shorthand sized in px. */
  font: string;
  /** Vertical centre of the major (upper) labels, as a fraction of the height. */
  majorTickRatio: number;
  /** Vertical centre of the minor (lower) labels, as a fraction of the height. */
  minorTickRatio: number;
}

/** Row geometry and the spacing around lines, markers and labels, CSS px. */
export interface LayoutStyle {
  rowHeight: number;
  /** Space between rows. */
  rowGap: number;
  /** Space kept between the viewport's left edge and a sticky start marker. */
  edgePadding: number;
  /** Length of line drawn before an element's first event. */
  lineLead: number;
  /** Gap between a start marker (icon/label) and its line's left end. */
  markerGap: number;
  /** Gap between a riser or cluster marker and its label. */
  eventLabelGap: number;
}

/** Hover and selection highlights on the overlay layer (DESIGN.md §9). */
export interface EmphasisStyle {
  hoverColor: string;
  selectionColor: string;
  /** Stroke width added to a hovered primitive, CSS px. */
  hoverWidthBonus: number;
  /** Stroke width added to a selected primitive, CSS px. */
  selectionWidthBonus: number;
  /** Radius added to a highlighted node dot or arrowhead, CSS px. */
  radiusBonus: number;
}

/** Collapsed-event cluster markers (DESIGN.md §6). */
export interface ClusterStyle {
  color: string;
  /** Colour of the "×N" count label. */
  textColor: string;
  /** Radius a marker gets over an ordinary node dot, CSS px. */
  markerBonus: number;
}

/** Engine-wide theme: colours, metrics and the style defaults (DESIGN.md §11). */
export interface Theme {
  background: string;
  grid: GridStyle;
  header: HeaderStyle;
  layout: LayoutStyle;
  emphasis: EmphasisStyle;
  cluster: ClusterStyle;
  /** Separator lines drawn between rows (off by default). */
  rowSeparator: RowSeparatorStyle;
  /** Theme-level element defaults (base of the resolution chain). */
  element: ElementStyle;
  /** Theme-level event defaults (base of the resolution chain). */
  event: EventStyle;
}

/**
 * A theme override (DESIGN.md §11): every key optional, and each group
 * partial too — it is merged over the defaults group by group, so
 * `{ header: { height: 56 } }` changes only the header height. Dash arrays
 * are replaced whole.
 */
export type ThemeInput = {
  [K in keyof Theme]?: Theme[K] extends object ? Partial<Theme[K]> : Theme[K];
};
