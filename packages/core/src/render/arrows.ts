// Directed event arrows (DESIGN.md §1, §4, §5, §6, §16).
//
// Each event is an orthogonal arrow at a single instant: a vertical riser at the
// event time between the source and target rows, a node dot at the source, and a
// direction-aware arrowhead at the target. A self-event (source === target) is a
// small rectangular half-loop on the element's own line. Risers sharing a pixel
// column are spread a few px (sub-lane offset, §16).
//
// Horizontal culling is a binary search over the time-sorted index (§5), not a
// linear scan: only events whose time falls in the (margin-widened) visible
// window are considered, then the §5 row-interval test drops those whose riser
// misses the visible band. Survivors are collapsed by the clustering pass (§6)
// — dense same-key runs become a single count marker — and per-event labels are
// suppressed below the label-LOD zoom threshold.
//
// Pure: works in CSS pixels and returns specs; the engine snaps to device px.

import { clusterEvents } from '../cluster/cluster';
import type { ClusterContext } from '../cluster/types';
import {
  arrowheadBatch,
  boxBatch,
  labelBatch,
  lineBatch,
  nodeBatch,
} from './batch';
import { parseFontPx } from './device';
import { buildRiserSegments } from './riser';
import type {
  ArrowheadSpec,
  BuildContext,
  EventLabelPlacement,
  HitTarget,
  LabelSpec,
  LineSpec,
  NodeSpec,
  RectSpec,
} from './specs';
import type { EventStyle, TimelineEvent } from '../model/types';

/** Horizontal pixels a riser is nudged per event sharing its pixel column. */
const SUB_LANE_STEP_PX = 2;
/** Cap on the sub-lane spread; residual overlap is accepted (§16). */
const SUB_LANE_MAX = 4;
/** Slack each side for the horizontal cull (arrowhead/node/self-loop extent). */
const HORIZONTAL_MARGIN_PX = 48;
/** Radius of the semicircular hop a riser makes over a crossed line (§16). */
const HOP_RADIUS_PX = 4;
/** Pointing straight down / up in screen space (y-down); risers are vertical. */
const ANGLE_DOWN = Math.PI / 2;
const ANGLE_UP = -Math.PI / 2;

/**
 * Deterministic sub-lane nudge for the `k`-th event in a pixel column (§16).
 * Stable because events are scanned in (time, insertion) order; capped to bound
 * fan-out.
 */
export function subLaneOffset(k: number): number {
  return Math.min(k, SUB_LANE_MAX) * SUB_LANE_STEP_PX;
}

/** Mutable per-frame accumulators shared by the single-arrow and cluster paths. */
interface Batches<TData> {
  lines: Map<string, LineSpec>;
  nodes: Map<string, NodeSpec>;
  arrowheads: Map<string, ArrowheadSpec>;
  labels: Map<string, LabelSpec>;
  /** Event label-box backgrounds, keyed by fill colour (§11). */
  boxes: Map<string, RectSpec>;
  /** Event label-box borders, keyed by colour/width/dash (§11). */
  boxBorders: Map<string, LineSpec>;
  targets: HitTarget<TData>[];
  /** Count of risers already placed per rounded pixel column (sub-lane keying). */
  columnCounts: Map<number, number>;
}

export interface ArrowsResult<TData = unknown> {
  /** Risers and self-loop glyphs. */
  lines: LineSpec[];
  nodes: NodeSpec[];
  arrowheads: ArrowheadSpec[];
  labels: LabelSpec[];
  /** Event label-box backgrounds; drawn behind labels, above arrows (§11). */
  boxes: RectSpec[];
  /** Event label-box borders; drawn over backgrounds, behind labels (§11). */
  boxBorders: LineSpec[];
  /** Identity-carrying arrow/cluster geometry for hit-testing (§5, §6). */
  targets: HitTarget<TData>[];
}

export function buildArrows<TData>(
  ctx: BuildContext<TData>,
): ArrowsResult<TData> {
  const { camera, viewport, lod, clustering } = ctx;

  const batches: Batches<TData> = {
    lines: new Map(),
    nodes: new Map(),
    arrowheads: new Map(),
    labels: new Map(),
    boxes: new Map(),
    boxBorders: new Map(),
    targets: [],
    columnCounts: new Map(),
  };

  // Horizontal cull via the temporal index (§5), widened so an arrowhead or
  // self-loop just off either edge is still drawn. The window is derived through
  // the Camera, never raw pxPerMs (§3).
  const tStart = camera.screenXToTime(-HORIZONTAL_MARGIN_PX);
  const tEnd = camera.screenXToTime(viewport.cssWidth + HORIZONTAL_MARGIN_PX);
  const windowEvents = ctx.data.getEventsInRange(tStart, tEnd);

  // Vertical cull (§5 row-interval test): keep an arrow unless the rows it spans
  // miss the band entirely, so a riser crossing the band with both endpoints
  // off-screen is retained.
  const visible: TimelineEvent<TData>[] = [];
  for (const event of windowEvents) {
    const rows = rowSpan(ctx, event);
    if (rows === null) continue;
    if (rows.hi < ctx.band.firstRow || rows.lo > ctx.band.lastRow) continue;
    visible.push(event);
  }

  const labelsOn = camera.state.pxPerMs >= lod.eventLabelMinPxPerMs;

  if (clustering.enabled) {
    const clusterCtx: ClusterContext = {
      minSeparationPx: clustering.minSeparationPx,
      timeToScreenX: (t) => camera.timeToScreenX(t),
    };
    for (const cluster of clusterEvents(
      visible,
      clustering.strategy,
      clusterCtx,
    )) {
      const [first] = cluster.events;
      if (cluster.events.length === 1 && first !== undefined) {
        addSingleArrow(batches, ctx, first, labelsOn);
      } else {
        addCluster(batches, ctx, cluster.events);
      }
    }
  } else {
    for (const event of visible) addSingleArrow(batches, ctx, event, labelsOn);
  }

  return {
    lines: [...batches.lines.values()],
    nodes: [...batches.nodes.values()],
    arrowheads: [...batches.arrowheads.values()],
    labels: [...batches.labels.values()],
    boxes: [...batches.boxes.values()],
    boxBorders: [...batches.boxBorders.values()],
    targets: batches.targets,
  };
}

/** The inclusive row interval an event spans, or `null` if an endpoint is unrowed. */
function rowSpan<TData>(
  ctx: BuildContext<TData>,
  event: TimelineEvent<TData>,
): { lo: number; hi: number; sourceRow: number; targetRow: number } | null {
  const sourceRow = ctx.rowLayout.rowIndexById.get(event.sourceId);
  const targetRow = ctx.rowLayout.rowIndexById.get(event.targetId);
  if (sourceRow === undefined || targetRow === undefined) return null;
  return {
    lo: Math.min(sourceRow, targetRow),
    hi: Math.max(sourceRow, targetRow),
    sourceRow,
    targetRow,
  };
}

/** Draw one event as an ordinary arrow (riser + node + arrowhead, or self-loop). */
function addSingleArrow<TData>(
  batches: Batches<TData>,
  ctx: BuildContext<TData>,
  event: TimelineEvent<TData>,
  labelsOn: boolean,
): void {
  const rows = rowSpan(ctx, event);
  if (rows === null) return;
  const { camera, theme } = ctx;
  const halfRow = theme.rowHeight / 2;
  const eventLabelGap = theme.eventLabelGap;

  const baseX = camera.timeToScreenX(event.time);
  const column = Math.round(baseX);
  const k = batches.columnCounts.get(column) ?? 0;
  batches.columnCounts.set(column, k + 1);
  const x = baseX + subLaneOffset(k);

  // Resolve the full §11 style once per event (theme → resolver → .style).
  const style = ctx.resolveEventStyle(event);
  const color = style.arrowColor;
  const width = style.arrowWidth;
  const dash = style.arrowDash;
  const size = style.arrowheadSize;
  const radius = style.nodeRadius;
  const labelText = labelsOn ? ctx.formatEventLabel(event) : undefined;

  if (event.sourceId === event.targetId) {
    const y = camera.rowToScreenY(rows.sourceRow) + halfRow;
    addSelfLoop(batches, { color, width, dash, size, radius }, x, y, event);
    if (labelText) {
      // The loop glyph sits above the line, so a source-node label goes below
      // it (dir = -1); the midpoint side label clears the loop's width.
      const anchor = eventLabelAnchor(ctx.eventLabel.placement, style, {
        x,
        ySource: y,
        dir: -1,
        sideX: x + size * 2 + eventLabelGap,
        midY: y,
        gap: radius + eventLabelGap,
      });
      pushEventLabel(batches, ctx, labelText, style, anchor);
    }
    return;
  }

  const ySource = camera.rowToScreenY(rows.sourceRow) + halfRow;
  const yTargetCenter = camera.rowToScreenY(rows.targetRow) + halfRow;
  const dir = yTargetCenter > ySource ? 1 : -1;

  // Land at the near edge of the target line's thickness (§1): resolve the
  // target element's line width so the arrowhead tip stops on the edge, and the
  // riser ends at the arrowhead base rather than piercing the line. A dot then
  // marks the landing point on the target line (mirrors the source dot).
  const targetEl = ctx.data.getElementById(event.targetId);
  const targetLineWidth = targetEl
    ? ctx.resolveElementStyle(targetEl).lineWidth
    : theme.element.lineWidth;
  const nearEdge = yTargetCenter - dir * (targetLineWidth / 2);
  const arrowheadAnchorY = nearEdge - dir * size;

  // Hop over any intermediary element lines the riser crosses (§16).
  const crossings = intermediaryCrossings(ctx, rows, event.time);
  const segments = buildRiserSegments(
    x,
    ySource,
    arrowheadAnchorY,
    crossings,
    HOP_RADIUS_PX,
  );
  lineBatch(batches.lines, color, width, dash).segments.push(...segments);

  const nodes = nodeBatch(batches.nodes, color, radius);
  nodes.items.push({ x, y: ySource });
  nodes.items.push({ x, y: yTargetCenter });
  arrowheadBatch(batches.arrowheads, color, size).items.push({
    x,
    y: arrowheadAnchorY,
    angle: dir > 0 ? ANGLE_DOWN : ANGLE_UP,
  });
  batches.targets.push({
    kind: 'event',
    event,
    segments,
    arrowhead: { x, y: arrowheadAnchorY },
    node: { x, y: ySource },
    targetNode: { x, y: yTargetCenter },
    width,
    arrowheadSize: size,
  });
  if (labelText) {
    const anchor = eventLabelAnchor(ctx.eventLabel.placement, style, {
      x,
      ySource,
      dir,
      sideX: x + width / 2 + eventLabelGap,
      midY: (ySource + yTargetCenter) / 2,
      gap: radius + eventLabelGap,
    });
    pushEventLabel(batches, ctx, labelText, style, anchor);
  }
}

/**
 * Screen-Y of each intermediary element line the riser crosses: rows strictly
 * between source and target whose element line is present at the event's time.
 *
 * The scan is clamped to the visible band (§5): only lines *on screen* can be
 * visibly crossed, so a tall riser whose endpoints are far off-screen still hops
 * over the lines it crosses within the band — and the scan stays bounded by the
 * viewport height, never the full data height (§13 perf). The line's small lead
 * pad is ignored — the extent test is close enough and the hop is cosmetic.
 */
function intermediaryCrossings<TData>(
  ctx: BuildContext<TData>,
  rows: { lo: number; hi: number },
  time: number,
): number[] {
  const { rowLayout, data, camera, theme, band } = ctx;
  // Intermediary rows are strictly between source and target; only those inside
  // the visible band can be crossed on screen.
  const lo = Math.max(rows.lo + 1, band.firstRow);
  const hi = Math.min(rows.hi - 1, band.lastRow);
  if (hi < lo) return [];
  const halfRow = theme.rowHeight / 2;
  const ys: number[] = [];
  for (let r = lo; r <= hi; r++) {
    const id = rowLayout.orderedIds[r];
    if (id === undefined) continue;
    const extent = data.getExtent(id);
    if (extent === undefined) continue;
    if (time < extent.minTime || time > extent.maxTime) continue;
    ys.push(camera.rowToScreenY(r) + halfRow);
  }
  return ys;
}

/**
 * Draw a collapsed cluster (§6): a riser spanning the members' row interval, a
 * count marker at its midpoint, and an "×N" label. Direction is ambiguous once
 * many events merge, so no arrowhead is drawn; the marker carries the meaning.
 */
function addCluster<TData>(
  batches: Batches<TData>,
  ctx: BuildContext<TData>,
  events: TimelineEvent<TData>[],
): void {
  const { camera, theme } = ctx;
  const halfRow = theme.rowHeight / 2;

  let minRow = Infinity;
  let maxRow = -Infinity;
  let sumX = 0;
  let placed = 0;
  for (const event of events) {
    const rows = rowSpan(ctx, event);
    if (rows === null) continue;
    minRow = Math.min(minRow, rows.lo);
    maxRow = Math.max(maxRow, rows.hi);
    sumX += camera.timeToScreenX(event.time);
    placed += 1;
  }
  if (placed === 0) return;

  // Average only over the events that contributed an x (those with a row pair),
  // so the marker stays centred even if the row-span and cull paths ever desync.
  const x = sumX / placed;
  const yTop = camera.rowToScreenY(minRow) + halfRow;
  const yBot = camera.rowToScreenY(maxRow) + halfRow;
  const yMid = (yTop + yBot) / 2;
  const color = theme.clusterColor;
  const width = theme.event.arrowWidth;
  const markerRadius = theme.event.nodeRadius + theme.clusterMarkerBonus;

  // Riser only when the cluster spans more than one row (else it is a point).
  // The cluster riser is always solid: an aggregate marker carries the meaning,
  // and a solid riser keeps it visually distinct from dashed single arrows.
  const segments = yTop !== yBot ? [{ x1: x, y1: yTop, x2: x, y2: yBot }] : [];
  if (segments.length > 0) {
    lineBatch(batches.lines, color, width).segments.push(...segments);
  }
  nodeBatch(batches.nodes, color, markerRadius).items.push({ x, y: yMid });
  labelBatch(
    batches.labels,
    theme.clusterTextColor,
    theme.event.labelFont,
  ).items.push({
    x: x + markerRadius + theme.eventLabelGap,
    y: yMid,
    text: `×${events.length}`,
  });
  batches.targets.push({
    kind: 'cluster',
    events,
    segments,
    marker: { x, y: yMid },
    markerSize: markerRadius,
    width,
  });
}

/**
 * A self-directed event: a rectangular half-loop above the line returning to a
 * downward arrowhead, with the source dot on the line. No inter-row riser (§1).
 */
function addSelfLoop<TData>(
  batches: Batches<TData>,
  style: {
    color: string;
    width: number;
    dash: number[];
    size: number;
    radius: number;
  },
  x: number,
  y: number,
  event: TimelineEvent<TData>,
): void {
  const loop = style.size * 2;
  const top = y - loop;
  const segments = [
    { x1: x, y1: y, x2: x, y2: top },
    { x1: x, y1: top, x2: x + loop, y2: top },
    { x1: x + loop, y1: top, x2: x + loop, y2: y },
  ];
  lineBatch(batches.lines, style.color, style.width, style.dash).segments.push(
    ...segments,
  );
  nodeBatch(batches.nodes, style.color, style.radius).items.push({ x, y });
  arrowheadBatch(batches.arrowheads, style.color, style.size).items.push({
    x: x + loop,
    y,
    angle: ANGLE_DOWN,
  });
  batches.targets.push({
    kind: 'event',
    event,
    segments,
    arrowhead: { x: x + loop, y },
    node: { x, y },
    width: style.width,
    arrowheadSize: style.size,
  });
}

/**
 * Where an event label's text is drawn. Placement decides this; the label's
 * style (text + box) is then applied identically by {@link pushEventLabel}.
 */
interface LabelAnchor {
  x: number;
  y: number;
  align: LabelSpec['align'];
  baseline: LabelSpec['baseline'];
}

/** Geometry a placement may draw on; each placement reads only what it needs. */
interface LabelGeometry {
  /** Riser column x and source-node centre y. */
  x: number;
  ySource: number;
  /** Arrow direction: `1` points down, `-1` up. */
  dir: number;
  /** Left edge x of a side-placed (midpoint) label, already clear of the riser. */
  sideX: number;
  /** Vertical centre for a side-placed label. */
  midY: number;
  /** Clearance from the source node a node-anchored label keeps (dot + gap). */
  gap: number;
}

/**
 * Resolve the text anchor for the active label placement (§11). This is the
 * *only* thing that varies between placements — the label's style is applied
 * uniformly by {@link pushEventLabel}. Adding a placement means adding a branch
 * here; the drawing never changes (open/closed).
 */
function eventLabelAnchor(
  placement: EventLabelPlacement,
  style: EventStyle,
  geom: LabelGeometry,
): LabelAnchor {
  if (placement === 'sourceNode') {
    // Centre the label over/under the node, offset by the gap plus the box's
    // half-height (font + padding) so the box's near edge clears the node. The
    // offset uses the box geometry even when no box is painted, so toggling the
    // box background never shifts the label (style is independent of position).
    const halfBox = parseFontPx(style.labelFont) / 2 + style.labelBoxPadding;
    const y = geom.ySource - geom.dir * (geom.gap + halfBox);
    return { x: geom.x, y, align: 'center', baseline: 'middle' };
  }
  // 'midpoint' (default): left-anchored beside the riser, vertically centred.
  return { x: geom.sideX, y: geom.midY, align: 'left', baseline: 'middle' };
}

/**
 * Emit one event label: its themeable box (when the style opts in) and its text,
 * at the given anchor. The box is part of the label *style* (§11), so it renders
 * the same in every placement — only the anchor differs. Text width is measured
 * (to size the box) only when a box is actually drawn, so a plain label never
 * pays for measurement.
 */
function pushEventLabel<TData>(
  batches: Batches<TData>,
  ctx: BuildContext<TData>,
  text: string,
  style: EventStyle,
  anchor: LabelAnchor,
): void {
  if (eventLabelBoxVisible(style)) {
    pushEventLabelBox(batches, ctx, text, style, anchor);
  }
  labelBatch(
    batches.labels,
    style.labelColor,
    style.labelFont,
    anchor.align,
    anchor.baseline,
  ).items.push({ x: anchor.x, y: anchor.y, text });
}

/** Whether the resolved style paints any label box (background or border, §11). */
function eventLabelBoxVisible(style: EventStyle): boolean {
  return (
    style.labelBoxBackground !== 'transparent' ||
    (style.labelBoxBorderWidth > 0 &&
      style.labelBoxBorderColor !== 'transparent')
  );
}

/**
 * Draw the label's box: a rectangle wrapping the text plus `labelBoxPadding`,
 * with optional background fill and border. The rect is derived from the text's
 * bounds at the anchor (alignment + measured width + font px), so the box hugs
 * the text the same way regardless of where the placement put it.
 */
function pushEventLabelBox<TData>(
  batches: Batches<TData>,
  ctx: BuildContext<TData>,
  text: string,
  style: EventStyle,
  anchor: LabelAnchor,
): void {
  const pad = style.labelBoxPadding;
  const textWidth = ctx.measureText(text, style.labelFont).width;
  const fontPx = parseFontPx(style.labelFont);

  // Text bounds at the anchor, then expand by padding to get the box rect.
  const textLeft =
    anchor.align === 'center'
      ? anchor.x - textWidth / 2
      : anchor.align === 'right'
        ? anchor.x - textWidth
        : anchor.x;
  const textTop =
    anchor.baseline === 'middle'
      ? anchor.y - fontPx / 2
      : anchor.baseline === 'top'
        ? anchor.y
        : anchor.y - fontPx; // 'alphabetic' ~ bottom-anchored
  const boxX = textLeft - pad;
  const boxY = textTop - pad;
  const boxW = textWidth + 2 * pad;
  const boxH = fontPx + 2 * pad;

  if (style.labelBoxBackground !== 'transparent') {
    boxBatch(batches.boxes, style.labelBoxBackground).items.push({
      x: boxX,
      y: boxY,
      w: boxW,
      h: boxH,
    });
  }
  if (
    style.labelBoxBorderWidth > 0 &&
    style.labelBoxBorderColor !== 'transparent'
  ) {
    const right = boxX + boxW;
    const bottom = boxY + boxH;
    lineBatch(
      batches.boxBorders,
      style.labelBoxBorderColor,
      style.labelBoxBorderWidth,
      style.labelBoxBorderDash,
    ).segments.push(
      { x1: boxX, y1: boxY, x2: right, y2: boxY },
      { x1: right, y1: boxY, x2: right, y2: bottom },
      { x1: right, y1: bottom, x2: boxX, y2: bottom },
      { x1: boxX, y1: bottom, x2: boxX, y2: boxY },
    );
  }
}
