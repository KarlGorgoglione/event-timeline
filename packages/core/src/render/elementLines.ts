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

import type { Theme } from '../model/types';
import { labelBatch, lineBatch } from './batch';
import type {
  BuildContext,
  HitTarget,
  IconSpec,
  LabelSpec,
  LineSpec,
} from './specs';

/**
 * CSS px of slack each side of the viewport that an element line's drawn extent
 * is clamped to. A line spans its element's full extent in screen-x, which at
 * high zoom is millions of px wide; stroking that and rasterizing it into the
 * 64px hit grid cell-by-cell makes the framerate fall *as you zoom in* (§13).
 * The off-screen portion is invisible and un-hittable (the pointer is always in
 * the viewport), and the line is horizontal, so clamping changes nothing visible.
 */
export const OFFSCREEN_LINE_MARGIN_PX = 128;
/** Vertical gap between the stacked icon and the label beneath it. */
const STACK_GAP_PX = 2;
/** Fallback label line height when a font's px size can't be parsed. */
const FALLBACK_LABEL_PX = 12;

/**
 * Heuristic label-width budget (CSS px) used only to reserve fit space. The pure
 * builder never measures text (it has no canvas), so `fit` can't know the real
 * label width; this is a reasonable upper bound for typical short labels. Wider
 * labels still render fine — they may just need a manual pan after the initial fit.
 */
const FIT_LABEL_BUDGET_PX = 96;

/**
 * CSS px to reserve left of the leftmost line so its start marker (icon + label,
 * §1) isn't clipped by `fit`. Mirrors the marker geometry below: the line's lead
 * gap, the marker gap, the marker content width, and the left padding.
 */
export function markerReserveLeftPx(theme: Theme): number {
  const markerContentW = Math.max(theme.element.iconSize, FIT_LABEL_BUDGET_PX);
  return (
    theme.labelPadding +
    markerContentW +
    theme.markerGap +
    theme.lineLeadPadding
  );
}

// Extract the leading px size from a CSS font shorthand (e.g. "12px Inter").
// Only px-sized fonts are supported (the theme uses them); pt/em/% fall back to
// FALLBACK_LABEL_PX, which only affects vertical stack centering, never layout.
function fontPx(font: string): number {
  const match = /(\d+(?:\.\d+)?)px/.exec(font);
  return match ? Number(match[1]) : FALLBACK_LABEL_PX;
}

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
  const leadPad = theme.lineLeadPadding;
  const markerGap = theme.markerGap;

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
    if (lineEndX <= 0 || lineStartX - leadPad > viewport.cssWidth) {
      continue;
    }

    const rowCenterY = camera.rowToScreenY(rowIndex) + rowHeight / 2;
    const element = data.getElementById(id);

    // Resolve the full §11 style once per element (theme → resolver → .style).
    const style = element ? ctx.resolveElementStyle(element) : theme.element;
    const lineColor = style.lineColor;
    const lineWidth = style.lineWidth;
    const x1 = lineStartX - leadPad;
    // Clamp the *drawn* extent to the viewport (+ slack). The start marker below
    // still keys off the true `x1`, so its sticky-left fallback is unchanged —
    // only the off-screen, invisible run of the horizontal line is trimmed (§13).
    const drawX1 = Math.max(x1, -OFFSCREEN_LINE_MARGIN_PX);
    const drawX2 = Math.min(
      lineEndX,
      viewport.cssWidth + OFFSCREEN_LINE_MARGIN_PX,
    );
    lineBatch(lines, lineColor, lineWidth, style.lineDash).segments.push({
      x1: drawX1,
      y1: rowCenterY,
      x2: drawX2,
      y2: rowCenterY,
    });
    if (element !== undefined) {
      targets.push({
        kind: 'element',
        element,
        y: rowCenterY,
        x1: drawX1,
        x2: drawX2,
        width: lineWidth,
      });
    }

    // Start marker (§1): a block to the LEFT of the line's left end. With an
    // icon it's the icon stacked over a centred label; without one it's the
    // label alone, right-aligned so it never spills onto the line. Sticky-left:
    // when the start scrolls past the edge but the line is still visible, pin
    // the marker so it clears `labelPadding` and stays readable.
    const iconSize = style.iconSize;
    const icon = element?.icon;
    const text = element ? ctx.formatElementLabel(element) : id;
    const labelPx = fontPx(style.labelFont);

    if (icon !== undefined) {
      const markerHalfW = iconSize / 2;
      const markerCenterX = Math.max(
        x1 - markerGap - markerHalfW,
        theme.labelPadding + markerHalfW,
      );
      // Centre the icon+label stack vertically on the row centre.
      const totalH = iconSize + STACK_GAP_PX + labelPx;
      const top = rowCenterY - totalH / 2;
      const iconCenterY = top + iconSize / 2;
      const labelY = top + iconSize + STACK_GAP_PX + labelPx / 2;
      const resolved = resolveIcon(icon);
      if (resolved.kind === 'image') {
        icons.items.push({
          x: markerCenterX - iconSize / 2,
          y: top,
          size: iconSize,
          image: resolved.image,
        });
      } else if (resolved.kind === 'text') {
        // Emoji / glyph icon drawn as centred text sized to the icon slot,
        // tinted with the element's resolved label colour for consistency.
        const iconFont = `${iconSize}px sans-serif`;
        labelBatch(labels, style.labelColor, iconFont, 'center').items.push({
          x: markerCenterX,
          y: iconCenterY,
          text: resolved.text,
        });
      }
      labelBatch(
        labels,
        style.labelColor,
        style.labelFont,
        'center',
      ).items.push({ x: markerCenterX, y: labelY, text });
    } else {
      // No icon: right-align the label so its right edge sits a gap left of the
      // line start — it can never overflow onto the line. When the line start
      // scrolls off-screen, fall back to a left-anchored sticky label.
      const labelRightX = x1 - markerGap;
      if (labelRightX >= theme.labelPadding) {
        labelBatch(
          labels,
          style.labelColor,
          style.labelFont,
          'right',
        ).items.push({ x: labelRightX, y: rowCenterY, text });
      } else {
        labelBatch(
          labels,
          style.labelColor,
          style.labelFont,
          'left',
        ).items.push({ x: theme.labelPadding, y: rowCenterY, text });
      }
    }
  }

  return {
    lines: [...lines.values()],
    labels: [...labels.values()],
    icons,
    targets,
  };
}
