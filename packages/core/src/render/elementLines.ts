// Element lines + their label/icon at the line start (DESIGN.md §1, §4, §7).
//
// Each element is a horizontal line spanning from a few px before its first
// event to its last event, with its label (and optional icon) anchored at the
// line start in world space so they pan with the content. When the line start
// scrolls off the left edge while the line is still visible, the label "sticks"
// to the left edge so it stays readable (§1). Vertical culling uses the padded
// row band (§5, §16); event-less elements have no extent and are not drawn (§1).
//
// Pure: works in CSS pixels and returns specs; the engine snaps to device px.

import { labelBatch, lineBatch } from './batch';
import type {
  BuildContext,
  HitTarget,
  IconSpec,
  LabelSpec,
  LineSpec,
} from './specs';

/** A few CSS px of line drawn before an element's first event (§1). */
export const LINE_LEAD_PAD_PX = 6;
/** Gap between the element icon and its label text. */
const ICON_GAP_PX = 4;

export interface ElementLinesResult<TData = unknown> {
  lines: LineSpec[];
  /** Element labels and emoji icons (both anchored left/middle). */
  labels: LabelSpec[];
  icons: IconSpec;
  /** Identity-carrying line geometry for hit-testing (§5). */
  targets: HitTarget<TData>[];
}

export function buildElementLines<TData>(
  ctx: BuildContext<TData>,
): ElementLinesResult<TData> {
  const { camera, rowLayout, data, viewport, theme, band, resolveIcon } = ctx;
  const rowHeight = theme.rowHeight;

  const lines = new Map<string, LineSpec>();
  const labels = new Map<string, LabelSpec>();
  const icons: IconSpec = { items: [] };
  const targets: HitTarget<TData>[] = [];

  for (const id of rowLayout.orderedIds) {
    const extent = data.getExtent(id);
    if (extent === undefined) continue; // event-less: not drawn (§1)

    const rowIndex = rowLayout.rowIndexById.get(id);
    if (rowIndex === undefined) continue;
    if (rowIndex < band.firstRow || rowIndex > band.lastRow) continue; // §5/§16

    const lineStartX = camera.timeToScreenX(extent.minTime);
    const lineEndX = camera.timeToScreenX(extent.maxTime);
    // Keep while any part of the line is visible. The left bound is governed by
    // lineEndX (a sticky label is drawn while the line still reaches the
    // viewport), so we must NOT cull on a negative lineStartX. `lineEndX <= 0`
    // means the whole line sits at/left of the edge — nothing visible — so the
    // cull and the `lineEndX > 0` sticky guard below agree on "visible = > 0".
    if (lineEndX <= 0 || lineStartX - LINE_LEAD_PAD_PX > viewport.cssWidth) {
      continue;
    }

    const rowCenterY = camera.rowToScreenY(rowIndex) + rowHeight / 2;
    const element = data.getElementById(id);

    // Resolve the full §11 style once per element (theme → resolver → .style).
    const style = element ? ctx.resolveElementStyle(element) : theme.element;
    const lineColor = style.lineColor;
    const lineWidth = style.lineWidth;
    const x1 = lineStartX - LINE_LEAD_PAD_PX;
    lineBatch(lines, lineColor, lineWidth).segments.push({
      x1,
      y1: rowCenterY,
      x2: lineEndX,
      y2: rowCenterY,
    });
    if (element !== undefined) {
      targets.push({
        kind: 'element',
        element,
        y: rowCenterY,
        x1,
        x2: lineEndX,
        width: lineWidth,
      });
    }

    // Label + icon anchor. Sticky-left: when the start scrolled past the edge
    // but the line is still visible, pin to labelPadding (§1).
    const desiredX = lineStartX - LINE_LEAD_PAD_PX;
    const stuck = desiredX < theme.labelPadding && lineEndX > 0;
    const anchorX = stuck ? theme.labelPadding : desiredX;

    let textX = anchorX;
    if (element?.icon !== undefined) {
      const iconSize = style.iconSize;
      const resolved = resolveIcon(element.icon);
      if (resolved.kind === 'image') {
        icons.items.push({
          x: anchorX,
          y: rowCenterY - iconSize / 2,
          size: iconSize,
          image: resolved.image,
        });
      } else if (resolved.kind === 'text') {
        // Emoji / glyph icon drawn as text sized to the icon slot, tinted with
        // the element's resolved label colour for consistency.
        const iconFont = `${iconSize}px sans-serif`;
        labelBatch(labels, style.labelColor, iconFont).items.push({
          x: anchorX,
          y: rowCenterY,
          text: resolved.text,
        });
      }
      // Reserve the icon slot even while a URL icon is still loading ('none'),
      // so the label does not jump sideways when the image arrives.
      textX = anchorX + iconSize + ICON_GAP_PX;
    }

    const text = element ? ctx.formatElementLabel(element) : id;
    labelBatch(labels, style.labelColor, style.labelFont).items.push({
      x: textX,
      y: rowCenterY,
      text,
    });
  }

  return {
    lines: [...lines.values()],
    labels: [...labels.values()],
    icons,
    targets,
  };
}
