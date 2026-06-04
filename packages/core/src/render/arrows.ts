// Directed event arrows (DESIGN.md §1, §4, §5, §16).
//
// Each event is an orthogonal arrow at a single instant: a vertical riser at the
// event time between the source and target rows, a node dot at the source, and a
// direction-aware arrowhead at the target. A self-event (source === target) is a
// small rectangular half-loop on the element's own line. Risers sharing a pixel
// column are spread a few px (sub-lane offset, §16). Culling is a linear scan
// over all events using the §5 row-interval test, so an arrow whose endpoints
// are both off-screen but whose riser crosses the visible band is retained.
//
// Pure: works in CSS pixels and returns specs; the engine snaps to device px.

import { arrowheadBatch, labelBatch, lineBatch, nodeBatch } from './batch';
import type {
  ArrowheadSpec,
  BuildContext,
  LabelSpec,
  LineSpec,
  NodeSpec,
} from './specs';

/** Horizontal pixels a riser is nudged per event sharing its pixel column. */
const SUB_LANE_STEP_PX = 2;
/** Cap on the sub-lane spread; residual overlap is accepted (§16). */
const SUB_LANE_MAX = 4;
/** Gap between the riser and its event label. */
const EVENT_LABEL_GAP_PX = 4;
/** Slack each side for the horizontal cull (arrowhead/node/self-loop extent). */
const HORIZONTAL_MARGIN_PX = 48;
/** Pointing straight down / up in screen space (y-down); risers are vertical. */
const ANGLE_DOWN = Math.PI / 2;
const ANGLE_UP = -Math.PI / 2;

/**
 * Deterministic sub-lane nudge for the `k`-th event in a pixel column (§16).
 * Stable because events are scanned in insertion order; capped to bound fan-out.
 */
export function subLaneOffset(k: number): number {
  return Math.min(k, SUB_LANE_MAX) * SUB_LANE_STEP_PX;
}

export interface ArrowsResult {
  /** Risers and self-loop glyphs. */
  lines: LineSpec[];
  nodes: NodeSpec[];
  arrowheads: ArrowheadSpec[];
  labels: LabelSpec[];
}

export function buildArrows(ctx: BuildContext): ArrowsResult {
  const { camera, rowLayout, data, viewport, theme, band } = ctx;
  const rowHeight = theme.rowHeight;
  const halfRow = rowHeight / 2;

  const lines = new Map<string, LineSpec>();
  const nodes = new Map<string, NodeSpec>();
  const arrowheads = new Map<string, ArrowheadSpec>();
  const labels = new Map<string, LabelSpec>();
  const columnCounts = new Map<number, number>();

  for (const event of data.getEvents()) {
    const sourceRow = rowLayout.rowIndexById.get(event.sourceId);
    const targetRow = rowLayout.rowIndexById.get(event.targetId);
    if (sourceRow === undefined || targetRow === undefined) continue;

    // §5 row-interval cull: keep unless the spanned rows miss the band entirely.
    const lo = Math.min(sourceRow, targetRow);
    const hi = Math.max(sourceRow, targetRow);
    if (hi < band.firstRow || lo > band.lastRow) continue;

    const baseX = camera.timeToScreenX(event.time);
    if (
      baseX + HORIZONTAL_MARGIN_PX < 0 ||
      baseX - HORIZONTAL_MARGIN_PX > viewport.cssWidth
    ) {
      continue;
    }

    const column = Math.round(baseX);
    const k = columnCounts.get(column) ?? 0;
    columnCounts.set(column, k + 1);
    const x = baseX + subLaneOffset(k);

    const color = event.style?.arrowColor ?? theme.event.arrowColor;
    const width = event.style?.arrowWidth ?? theme.event.arrowWidth;
    const size = event.style?.arrowheadSize ?? theme.event.arrowheadSize;
    const radius = event.style?.nodeRadius ?? theme.event.nodeRadius;

    if (event.sourceId === event.targetId) {
      addSelfLoop(
        { lines, nodes, arrowheads },
        { color, width, size, radius },
        x,
        camera.rowToScreenY(sourceRow) + halfRow,
      );
      if (event.label !== undefined) {
        pushEventLabel(labels, event.label, theme, event, {
          x: x + size * 2 + EVENT_LABEL_GAP_PX,
          y: camera.rowToScreenY(sourceRow) + halfRow,
        });
      }
      continue;
    }

    const ySource = camera.rowToScreenY(sourceRow) + halfRow;
    const yTarget = camera.rowToScreenY(targetRow) + halfRow;
    lineBatch(lines, color, width).segments.push({
      x1: x,
      y1: ySource,
      x2: x,
      y2: yTarget,
    });
    nodeBatch(nodes, color, radius).items.push({ x, y: ySource });
    arrowheadBatch(arrowheads, color, size).items.push({
      x,
      y: yTarget,
      angle: yTarget > ySource ? ANGLE_DOWN : ANGLE_UP,
    });
    if (event.label !== undefined) {
      pushEventLabel(labels, event.label, theme, event, {
        x: x + width / 2 + EVENT_LABEL_GAP_PX,
        y: (ySource + yTarget) / 2,
      });
    }
  }

  return {
    lines: [...lines.values()],
    nodes: [...nodes.values()],
    arrowheads: [...arrowheads.values()],
    labels: [...labels.values()],
  };
}

/**
 * A self-directed event: a rectangular half-loop above the line returning to a
 * downward arrowhead, with the source dot on the line. No inter-row riser (§1).
 */
function addSelfLoop(
  batches: {
    lines: Map<string, LineSpec>;
    nodes: Map<string, NodeSpec>;
    arrowheads: Map<string, ArrowheadSpec>;
  },
  style: { color: string; width: number; size: number; radius: number },
  x: number,
  y: number,
): void {
  const loop = style.size * 2;
  const top = y - loop;
  lineBatch(batches.lines, style.color, style.width).segments.push(
    { x1: x, y1: y, x2: x, y2: top },
    { x1: x, y1: top, x2: x + loop, y2: top },
    { x1: x + loop, y1: top, x2: x + loop, y2: y },
  );
  nodeBatch(batches.nodes, style.color, style.radius).items.push({ x, y });
  arrowheadBatch(batches.arrowheads, style.color, style.size).items.push({
    x: x + loop,
    y,
    angle: ANGLE_DOWN,
  });
}

function pushEventLabel(
  labels: Map<string, LabelSpec>,
  text: string,
  theme: BuildContext['theme'],
  event: { style?: { labelColor?: string; labelFont?: string } },
  at: { x: number; y: number },
): void {
  const color = event.style?.labelColor ?? theme.event.labelColor;
  const font = event.style?.labelFont ?? theme.event.labelFont;
  labelBatch(labels, color, font).items.push({ x: at.x, y: at.y, text });
}
