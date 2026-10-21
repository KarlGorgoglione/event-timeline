// Element lines with their start marker (DESIGN.md §1, §4, §7).
//
// Each element is a horizontal line from just before its first event to its
// last event, with its label (and optional icon) anchored to the left of the
// line start, in world space, so it pans with the content. When the line start
// scrolls off the left edge while the line is still visible, the marker sticks
// to the edge so it stays readable. With `emptyElements: 'show'`, an element
// without events keeps its row and draws only its label (a stub).
//
// Geometry is computed in CSS px and snapped to device px once, here.

import { hairlineOffset } from '../render/device';
import type { ElementsInput } from './context';
import type { SceneOutput } from './output';
import { TargetKind } from './targets';
import { strokeBuffer, textBuffer } from './groups';

/**
 * CSS px of slack each side of the viewport the drawn line is clamped to. At
 * high zoom a line's full extent is millions of px wide; the off-screen part
 * is invisible and un-hittable, and the line is horizontal, so clamping it
 * changes nothing visible.
 */
export const OFFSCREEN_LINE_MARGIN_PX = 128;
/** Vertical gap between a stacked icon and the label beneath it. */
const STACK_GAP_PX = 2;

/** Width of an element's start marker block (icon and/or label), CSS px. */
export function markerContentWidth(
  labelWidth: number,
  iconSize: number,
  hasIcon: boolean,
): number {
  return hasIcon ? Math.max(iconSize, labelWidth) : labelWidth;
}

export function buildElements<TData>(
  input: ElementsInput<TData>,
  out: SceneOutput,
): void {
  const { store, camera, viewport, band, config, styles, dpr, rowSlot } = input;
  const { theme } = config;
  const snap = (v: number) => Math.round(v * dpr);
  const leadPad = theme.layout.lineLead;
  const markerGap = theme.layout.markerGap;
  const mins = store.extentMins;
  const maxs = store.extentMaxs;

  for (let row = band.firstRow; row <= band.lastRow; row++) {
    const slot = rowSlot[row] as number;
    if (slot < 0) continue;
    const element = store.elementAt(slot);
    const resolved = styles.element(slot);
    const style = resolved.style;
    const rowCenterY = camera.rowToScreenY(row) + theme.layout.rowHeight / 2;
    const text = config.formatElementLabel(element);
    const font = styles.fonts.values[resolved.text]!;
    const minTime = mins[slot] as number;

    if (Number.isNaN(minTime)) {
      if (config.emptyElements !== 'show') continue;
      // An element without events keeps its row and draws its label only.
      const width = input.measure(text, style.labelFont);
      const x = theme.layout.edgePadding;
      pushLabel(input, out, resolved.text, 'left', x, rowCenterY, text, width);
      const target = out.targets.open(TargetKind.Element, slot);
      out.targets.segment(target, x, rowCenterY, x + width, rowCenterY);
      target.width = font.px;
      out.targets.close(target);
      continue;
    }

    const lineStartX = camera.timeToScreenX(minTime);
    const lineEndX = camera.timeToScreenX(maxs[slot] as number);
    // Keep while any part of the line is visible; a negative start is fine
    // (the sticky marker covers it), so the left bound keys off the end.
    if (lineEndX <= 0 || lineStartX - leadPad > viewport.cssWidth) continue;

    const x1 = lineStartX - leadPad;
    const drawX1 = Math.max(x1, -OFFSCREEN_LINE_MARGIN_PX);
    const drawX2 = Math.min(
      lineEndX,
      viewport.cssWidth + OFFSCREEN_LINE_MARGIN_PX,
    );
    const line = strokeBuffer(out.elementLines, styles, resolved.stroke, dpr);
    const off = hairlineOffset(line.width);
    const y = snap(rowCenterY) + off;
    line.push(snap(drawX1) + off, y, snap(drawX2) + off, y);

    const target = out.targets.open(TargetKind.Element, slot);
    out.targets.segment(target, drawX1, rowCenterY, drawX2, rowCenterY);
    target.width = style.lineWidth;
    out.targets.close(target);

    // Start marker (§1), left of the line's left end, sticky at the edge.
    const width = input.measure(text, style.labelFont);
    const iconSize = style.iconSize;
    if (element.icon !== undefined) {
      // The icon over its centred label make one block, as wide as the wider
      // of the two (the width the fit inset reserves). It ends `markerGap`
      // before the line and, sticky, starts at `edgePadding`: a label wider
      // than its icon is never cut off by the edge or drawn over the line.
      const halfW = iconSize / 2;
      const halfBlock = markerContentWidth(width, iconSize, true) / 2;
      const centerX = Math.max(
        x1 - markerGap - halfBlock,
        theme.layout.edgePadding + halfBlock,
      );
      const totalH = iconSize + STACK_GAP_PX + font.px;
      const top = rowCenterY - totalH / 2;
      const icon = input.resolveIcon(element.icon);
      if (icon.kind === 'image') {
        out.icon(snap(centerX - halfW), snap(top), snap(iconSize), icon.image);
      } else if (icon.kind === 'text') {
        // Emoji/glyph drawn as text in the icon slot, in the label colour.
        const glyphFont = styles.font(
          style.labelColor,
          `${iconSize}px sans-serif`,
        );
        textBuffer(out.elementText, styles, glyphFont, 'center', dpr).push(
          snap(centerX),
          snap(top + halfW),
          icon.text,
        );
      }
      out.labels.reserve(centerX - halfW, top, iconSize, iconSize);
      pushLabel(
        input,
        out,
        resolved.text,
        'center',
        centerX,
        top + iconSize + STACK_GAP_PX + font.px / 2,
        text,
        width,
      );
    } else {
      // Right-aligned so the label never overflows onto the line; once the
      // line start leaves the screen it sticks to the left edge.
      const rightX = x1 - markerGap;
      if (rightX >= theme.layout.edgePadding) {
        pushLabel(
          input,
          out,
          resolved.text,
          'right',
          rightX,
          rowCenterY,
          text,
          width,
        );
      } else {
        pushLabel(
          input,
          out,
          resolved.text,
          'left',
          theme.layout.edgePadding,
          rowCenterY,
          text,
          width,
        );
      }
    }
  }
}

/** Draw an element label and reserve its box against event labels. */
function pushLabel<TData>(
  input: ElementsInput<TData>,
  out: SceneOutput,
  fontId: number,
  align: 'left' | 'center' | 'right',
  x: number,
  y: number,
  text: string,
  width: number,
): void {
  const { dpr, styles } = input;
  const px = styles.fonts.values[fontId]!.px;
  textBuffer(out.elementText, styles, fontId, align, dpr).push(
    Math.round(x * dpr),
    Math.round(y * dpr),
    text,
  );
  const left =
    align === 'left' ? x : align === 'right' ? x - width : x - width / 2;
  out.labels.reserve(left, y - px / 2, width, px);
}
