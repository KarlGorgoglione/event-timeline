// Time header, gridlines and row separators (DESIGN.md §4, §8, §11).

import { generateTicks, type TickScale } from '../scale/ticks';
import type { HeaderInput } from './context';
import { hairlineOffset, scaleFontToDevice } from '../render/device';
import { deviceDash } from './groups';
import type { SceneOutput } from './output';

/** Minimum pixel spacing header labels need (§8). */
const MIN_LABEL_GAP_PX = 64;
/** A major (period) label starts this far right of its boundary, CSS px. */
const PERIOD_LABEL_INSET_PX = 4;
/** Minimum gap between the sticky period label and the next one, CSS px. */
const STICKY_LABEL_GAP_PX = 12;

export function buildHeader<TData>(
  input: HeaderInput<TData>,
  out: SceneOutput,
): void {
  const { camera, viewport, dpr, config } = input;
  const { theme, metrics } = config;
  const snap = (v: number) => Math.round(v * dpr);
  const ticks = generateTicks(
    camera.screenXToTime(0),
    camera.screenXToTime(viewport.cssWidth),
    camera.state.pxPerMs,
    MIN_LABEL_GAP_PX,
    { formatter: config.tickFormatter, locale: config.locale },
  );

  // Major gridlines run from the header bottom through the content.
  const grid = out.gridlines;
  grid.color = theme.grid.color;
  grid.width = Math.max(1, snap(theme.grid.width));
  grid.dash = deviceDash(theme.grid.dash, dpr);
  const off = hairlineOffset(grid.width);
  const top = snap(metrics.headerHeight);
  const bottom = snap(viewport.cssHeight);
  for (const tick of ticks.major) {
    const x = snap(camera.timeToScreenX(tick.time)) + off;
    grid.push(x, top, x, bottom);
  }

  out.background = theme.background;
  out.mask.width = snap(viewport.cssWidth);
  out.mask.height = top;
  out.mask.color = theme.background;
  const baseline = out.baseline;
  baseline.color = grid.color;
  baseline.width = grid.width;
  baseline.dash = grid.dash;
  baseline.push(0, top + off, snap(viewport.cssWidth), top + off);

  const font = scaleFontToDevice(theme.header.font, dpr);
  const major = out.majorText;
  major.color = theme.header.textColor;
  major.font = font;
  const majorY = snap(metrics.headerHeight * theme.header.majorTickRatio);
  for (const label of periodLabels(input, ticks)) {
    major.push(snap(label.x), majorY, label.text);
  }
  const minor = out.minorText;
  minor.color = theme.header.textColor;
  minor.font = font;
  const minorY = snap(metrics.headerHeight * theme.header.minorTickRatio);
  for (const tick of ticks.minor) {
    minor.push(snap(camera.timeToScreenX(tick.time)), minorY, tick.label);
  }
}

/**
 * Major (period) labels in CSS px, each starting just right of its boundary,
 * plus a sticky label for the period that began before the left edge (§8):
 * pinned at the left edge until the next period's label pushes it out, so the
 * header always names the period on screen, however deep the zoom.
 */
function periodLabels<TData>(
  input: HeaderInput<TData>,
  ticks: TickScale,
): { x: number; text: string }[] {
  const { camera, config } = input;
  const labels = ticks.major.map((tick) => ({
    x: camera.timeToScreenX(tick.time) + PERIOD_LABEL_INSET_PX,
    text: tick.label,
  }));
  const current = ticks.current;
  if (current === null || camera.timeToScreenX(current.time) >= 0) {
    return labels;
  }
  const width = input.measure(current.label, config.theme.header.font);
  let x = PERIOD_LABEL_INSET_PX;
  const next = labels[0];
  if (next !== undefined) {
    x = Math.min(x, next.x - STICKY_LABEL_GAP_PX - width);
  }
  return [{ x, text: current.label }, ...labels];
}

/** Optional separator lines between rows (§11), centred in the row gap. */
export function buildSeparators<TData>(
  input: HeaderInput<TData>,
  out: SceneOutput,
): void {
  const { config, camera, viewport, band, dpr } = input;
  const sep = config.theme.rowSeparator;
  if (!sep.enabled) return;
  const buffer = out.separators;
  buffer.color = sep.color;
  buffer.width = Math.max(1, Math.round(sep.width * dpr));
  buffer.dash = deviceDash(sep.dash, dpr);
  const off = hairlineOffset(buffer.width);
  const right = Math.round(viewport.cssWidth * dpr);
  const { rowHeight, rowGap } = config.theme.layout;
  for (let r = band.firstRow; r <= band.lastRow; r++) {
    const y =
      Math.round((camera.rowToScreenY(r) + rowHeight + rowGap / 2) * dpr) + off;
    buffer.push(0, y, right, y);
  }
}
