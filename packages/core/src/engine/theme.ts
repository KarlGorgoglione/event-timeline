// Default theme + shallow merge (DESIGN.md §11).
//
// Phase 1 ships the theme defaults only; the per-item style resolver chain
// (resolver callback → per-item `style`) arrives in Phase 6.

import type { Theme } from '../model/types';

export const defaultTheme: Theme = {
  background: '#161b22',
  gridlineColor: 'rgba(255, 255, 255, 0.08)',
  gridlineWidth: 1,
  gridlineDash: [],
  headerTextColor: '#9aa4b2',
  headerFont: '12px system-ui, sans-serif',
  headerHeight: 44,
  headerMajorTickRatio: 0.32,
  headerMinorTickRatio: 0.72,
  rowHeight: 28,
  rowGap: 6,
  labelPadding: 8,
  lineLeadPadding: 12,
  markerGap: 8,
  eventLabelGap: 4,
  hoverColor: '#ffd166',
  selectionColor: '#4fc3f7',
  hoverWidthBonus: 2,
  selectionWidthBonus: 2,
  emphasisRadiusBonus: 1,
  clusterColor: '#d29922',
  clusterTextColor: '#d29922',
  clusterMarkerBonus: 2,
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
  },
};

/**
 * Merge a partial theme over the defaults. Top-level keys and the nested
 * `element`/`event`/`rowSeparator` objects are merged one level deep so a
 * partial only overrides the keys it sets. Dash arrays are whole-value
 * overrides (a partial dash is meaningless).
 */
export function resolveTheme(partial?: Partial<Theme>): Theme {
  if (partial === undefined) return defaultTheme;
  return {
    ...defaultTheme,
    ...partial,
    element: { ...defaultTheme.element, ...partial.element },
    event: { ...defaultTheme.event, ...partial.event },
    rowSeparator: { ...defaultTheme.rowSeparator, ...partial.rowSeparator },
  };
}
