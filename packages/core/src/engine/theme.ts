// The default theme and the merge of a host's overrides (DESIGN.md §11).
// Per-item styles resolve over the theme's element/event defaults
// (render/resolveStyle.ts).

import type { Diagnostic } from '../model/diagnostics';
import type { Theme, ThemeInput } from '../model/types';

export const defaultTheme: Theme = {
  background: '#161b22',
  grid: { color: 'rgba(255, 255, 255, 0.08)', width: 1, dash: [] },
  header: {
    height: 44,
    textColor: '#9aa4b2',
    font: '12px system-ui, sans-serif',
    majorTickRatio: 0.32,
    minorTickRatio: 0.72,
  },
  layout: {
    rowHeight: 28,
    rowGap: 6,
    edgePadding: 8,
    lineLead: 12,
    markerGap: 8,
    eventLabelGap: 4,
  },
  emphasis: {
    hoverColor: '#ffd166',
    selectionColor: '#4fc3f7',
    hoverWidthBonus: 2,
    selectionWidthBonus: 2,
    radiusBonus: 1,
  },
  cluster: { color: '#d29922', textColor: '#d29922', markerBonus: 2 },
  rowSeparator: {
    enabled: false,
    color: 'rgba(255, 255, 255, 0.06)',
    width: 1,
    dash: [],
  },
  element: {
    lineColor: '#5aa0ff',
    lineWidth: 2,
    lineDash: [],
    labelColor: '#e6e6e6',
    labelFont: '12px system-ui, sans-serif',
    iconSize: 16,
  },
  event: {
    arrowColor: '#8b949e',
    arrowWidth: 1,
    arrowDash: [],
    arrowheadSize: 6,
    labelColor: '#c9d1d9',
    labelFont: '11px system-ui, sans-serif',
    nodeRadius: 3,
    // Source-node label box off by default: transparent fill + zero border means
    // enabling the placement alone leaves the look byte-identical until a theme or
    // resolver supplies colours (§11).
    labelBoxBackground: 'transparent',
    labelBoxBorderColor: 'transparent',
    labelBoxBorderWidth: 0,
    labelBoxBorderDash: [],
    labelBoxPadding: 3,
  },
};

/**
 * Merge a theme override over the defaults, group by group, so an override
 * changes only the keys it sets. Dash arrays are replaced whole (a partial
 * dash is meaningless).
 */
export function resolveTheme(input?: ThemeInput): Theme {
  if (input === undefined) return defaultTheme;
  const d = defaultTheme;
  return {
    background: input.background ?? d.background,
    grid: { ...d.grid, ...input.grid },
    header: { ...d.header, ...input.header },
    layout: { ...d.layout, ...input.layout },
    emphasis: { ...d.emphasis, ...input.emphasis },
    cluster: { ...d.cluster, ...input.cluster },
    rowSeparator: { ...d.rowSeparator, ...input.rowSeparator },
    element: { ...d.element, ...input.element },
    event: { ...d.event, ...input.event },
  };
}

/** A CSS font shorthand whose size is given in `px` (e.g. `12px Inter`). */
const PX_FONT = /(^|\s)\d*\.?\d+px(\s|\/|$)/;

/**
 * Whether a font can be drawn at the right size: the context is not pre-scaled
 * (§3), so font sizes are multiplied by the device pixel ratio, which only
 * works for `px` sizes.
 */
export function isPxFont(font: string): boolean {
  return PX_FONT.test(font);
}

/**
 * Replace every theme font that isn't sized in `px` with the default font for
 * that slot and report it, rather than silently drawing it at 1/dpr size on
 * high-density screens.
 */
export function validateThemeFonts(
  theme: Theme,
  onDiagnostic: (d: Diagnostic) => void,
): Theme {
  const check = (font: string, fallback: string, slot: string): string => {
    if (isPxFont(font)) return font;
    onDiagnostic({
      code: 'invalid-font',
      kind: 'theme',
      reason: `${slot} font "${font}" is not sized in px; using "${fallback}"`,
    });
    return fallback;
  };
  const headerFont = check(
    theme.header.font,
    defaultTheme.header.font,
    'header.font',
  );
  const elementFont = check(
    theme.element.labelFont,
    defaultTheme.element.labelFont,
    'element.labelFont',
  );
  const eventFont = check(
    theme.event.labelFont,
    defaultTheme.event.labelFont,
    'event.labelFont',
  );
  if (
    headerFont === theme.header.font &&
    elementFont === theme.element.labelFont &&
    eventFont === theme.event.labelFont
  ) {
    return theme;
  }
  return {
    ...theme,
    header: { ...theme.header, font: headerFont },
    element: { ...theme.element, labelFont: elementFont },
    event: { ...theme.event, labelFont: eventFont },
  };
}
