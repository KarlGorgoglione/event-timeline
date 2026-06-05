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
import { arrowheadBatch, labelBatch, lineBatch, nodeBatch } from './batch';
import { buildRiserSegments } from './riser';
import type {
  ArrowheadSpec,
  BuildContext,
  HitTarget,
  LabelSpec,
  LineSpec,
  NodeSpec,
} from './specs';
import type { EventStyle, TimelineEvent } from '../model/types';

/** Horizontal pixels a riser is nudged per event sharing its pixel column. */
const SUB_LANE_STEP_PX = 2;
/** Cap on the sub-lane spread; residual overlap is accepted (§16). */
const SUB_LANE_MAX = 4;
/** Gap between the riser/marker and its label. */
const EVENT_LABEL_GAP_PX = 4;
/** Slack each side for the horizontal cull (arrowhead/node/self-loop extent). */
const HORIZONTAL_MARGIN_PX = 48;
/** Extra radius a cluster marker gets over an ordinary source dot. */
const CLUSTER_MARKER_BONUS_PX = 2;
/** Radius of the semicircular hop a riser makes over a crossed line (§16). */
const HOP_RADIUS_PX = 4;
/** Skip hop computation beyond this row span (perf guard, §13); draw straight. */
const MAX_HOP_SPAN_ROWS = 24;
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

  const baseX = camera.timeToScreenX(event.time);
  const column = Math.round(baseX);
  const k = batches.columnCounts.get(column) ?? 0;
  batches.columnCounts.set(column, k + 1);
  const x = baseX + subLaneOffset(k);

  // Resolve the full §11 style once per event (theme → resolver → .style).
  const style = ctx.resolveEventStyle(event);
  const color = style.arrowColor;
  const width = style.arrowWidth;
  const size = style.arrowheadSize;
  const radius = style.nodeRadius;
  const labelText = labelsOn ? ctx.formatEventLabel(event) : undefined;

  if (event.sourceId === event.targetId) {
    const y = camera.rowToScreenY(rows.sourceRow) + halfRow;
    addSelfLoop(batches, { color, width, size, radius }, x, y, event);
    if (labelText) {
      pushEventLabel(batches.labels, labelText, style, {
        x: x + size * 2 + EVENT_LABEL_GAP_PX,
        y,
      });
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
  lineBatch(batches.lines, color, width).segments.push(...segments);

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
    pushEventLabel(batches.labels, labelText, style, {
      x: x + width / 2 + EVENT_LABEL_GAP_PX,
      y: (ySource + yTargetCenter) / 2,
    });
  }
}

/**
 * Screen-Y of each intermediary element line the riser crosses: rows strictly
 * between source and target whose element line is present at the event's time.
 * Bounded by {@link MAX_HOP_SPAN_ROWS} so a tall riser never scans the whole
 * column (§13). The line's small lead pad is ignored — the extent test is close
 * enough and the hop is cosmetic.
 */
function intermediaryCrossings<TData>(
  ctx: BuildContext<TData>,
  rows: { lo: number; hi: number },
  time: number,
): number[] {
  if (rows.hi - rows.lo <= 1 || rows.hi - rows.lo > MAX_HOP_SPAN_ROWS)
    return [];
  const { rowLayout, data, camera, theme } = ctx;
  const halfRow = theme.rowHeight / 2;
  const ys: number[] = [];
  for (let r = rows.lo + 1; r < rows.hi; r++) {
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
  const markerRadius = theme.event.nodeRadius + CLUSTER_MARKER_BONUS_PX;

  // Riser only when the cluster spans more than one row (else it is a point).
  const segments = yTop !== yBot ? [{ x1: x, y1: yTop, x2: x, y2: yBot }] : [];
  if (segments.length > 0) {
    lineBatch(batches.lines, color, width).segments.push(...segments);
  }
  nodeBatch(batches.nodes, color, markerRadius).items.push({ x, y: yMid });
  labelBatch(batches.labels, color, theme.event.labelFont).items.push({
    x: x + markerRadius + EVENT_LABEL_GAP_PX,
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
  style: { color: string; width: number; size: number; radius: number },
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
  lineBatch(batches.lines, style.color, style.width).segments.push(...segments);
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

function pushEventLabel(
  labels: Map<string, LabelSpec>,
  text: string,
  style: EventStyle,
  at: { x: number; y: number },
): void {
  labelBatch(labels, style.labelColor, style.labelFont).items.push({
    x: at.x,
    y: at.y,
    text,
  });
}
