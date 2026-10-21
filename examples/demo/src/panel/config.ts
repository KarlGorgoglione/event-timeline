// The single source of truth for everything the panel can edit (§11, §12).
//
// `DemoConfig` mirrors the engine's stylable surface, but in shapes the UI can
// drive directly: fonts are structured `{ size, family }` (serialised to a CSS
// shorthand only when building the theme) and dashes are plain `number[]`. The
// config is split into `theme` and `options` sub-objects so each maps to one
// memoised engine prop — editing a colour never churns the options reference,
// and vice versa (the §12 referential-stability contract).

import { defaultTheme } from '@event-timeline/react';
import type { FontValue } from './controls';

// --- Editable shapes -------------------------------------------------------

export interface ElementStyleConfig {
  lineColor: string;
  lineWidth: number;
  lineDash: number[];
  labelColor: string;
  labelFont: FontValue;
  iconSize: number;
}

export interface EventStyleConfig {
  arrowColor: string;
  arrowWidth: number;
  arrowDash: number[];
  arrowheadSize: number;
  labelColor: string;
  labelFont: FontValue;
  nodeRadius: number;
  labelBoxBackground: string;
  labelBoxBorderColor: string;
  labelBoxBorderWidth: number;
  labelBoxBorderDash: number[];
  labelBoxPadding: number;
}

export interface RowSeparatorConfig {
  enabled: boolean;
  color: string;
  width: number;
  dash: number[];
}

export interface ThemeConfig {
  background: string;
  gridlineColor: string;
  gridlineWidth: number;
  gridlineDash: number[];
  headerTextColor: string;
  headerFont: FontValue;
  headerHeight: number;
  headerMajorTickRatio: number;
  headerMinorTickRatio: number;
  rowHeight: number;
  rowGap: number;
  labelPadding: number;
  lineLeadPadding: number;
  markerGap: number;
  eventLabelGap: number;
  hoverColor: string;
  selectionColor: string;
  hoverWidthBonus: number;
  selectionWidthBonus: number;
  emphasisRadiusBonus: number;
  clusterColor: string;
  clusterTextColor: string;
  clusterMarkerBonus: number;
  rowSeparator: RowSeparatorConfig;
  element: ElementStyleConfig;
  event: EventStyleConfig;
}

export type DatasetKey = 'default' | 'aml' | 'synthetic10k' | 'synthetic50k';
export type LayoutKey = 'byFirstEvent' | 'barycenter' | 'explicit';
export type ClusterKey =
  | 'byPixelColumn'
  | 'byElementPair'
  | 'byDay'
  | 'bySourceTargetColumn';
export type StreamingLayoutKey = 'stable-append' | 'full';
export type PlacementKey = 'midpoint' | 'sourceNode';
export type RendererKey = 'auto' | 'canvas2d' | 'webgl';

export interface ClusteringConfig {
  enabled: boolean;
  strategy: ClusterKey;
  minSeparationPx: number;
}

export interface OptionsConfig {
  /** Rendering backend preference (DESIGN.md §4). */
  renderer: RendererKey;
  layout: LayoutKey;
  multiSelect: boolean;
  streamingLayout: StreamingLayoutKey;
  layoutDebounceMs: number;
  eventLabelPlacement: PlacementKey;
  clustering: ClusteringConfig;
  /** Human-scale LOD threshold; converted to px/ms when building options. */
  lodEventLabelPxPerDay: number;
}

export interface DemoConfig {
  dataset: DatasetKey;
  streaming: boolean;
  /** Data-driven palette resolvers on/off (demonstrates the §11 resolver hook). */
  resolvers: boolean;
  /** Label formatters on/off (upper-cased elements, prefixed events). */
  formatters: boolean;
  theme: ThemeConfig;
  options: OptionsConfig;
}

// --- Defaults (derived from the engine's own defaults, so they never drift) --

/** Engine default for the LOD threshold, expressed in the panel's px/day unit. */
const DEFAULT_LABEL_PX_PER_DAY = 40;

const FONT_RE = /^\s*(\d+(?:\.\d+)?)px\s+(.+?)\s*$/;

/** Parse a CSS font shorthand into the structured value the UI edits. */
function parseFont(shorthand: string): FontValue {
  const m = FONT_RE.exec(shorthand);
  return m
    ? { size: Number(m[1]), family: m[2] as string }
    : { size: 12, family: 'system-ui, sans-serif' };
}

/** Build the editable theme defaults from core's `defaultTheme` (DRY, no drift). */
function defaultThemeConfig(): ThemeConfig {
  const { element, event, rowSeparator } = defaultTheme;
  return {
    background: defaultTheme.background,
    gridlineColor: defaultTheme.grid.color,
    gridlineWidth: defaultTheme.grid.width,
    gridlineDash: [...defaultTheme.grid.dash],
    headerTextColor: defaultTheme.header.textColor,
    headerFont: parseFont(defaultTheme.header.font),
    headerHeight: defaultTheme.header.height,
    headerMajorTickRatio: defaultTheme.header.majorTickRatio,
    headerMinorTickRatio: defaultTheme.header.minorTickRatio,
    rowHeight: defaultTheme.layout.rowHeight,
    rowGap: defaultTheme.layout.rowGap,
    labelPadding: defaultTheme.layout.edgePadding,
    lineLeadPadding: defaultTheme.layout.lineLead,
    markerGap: defaultTheme.layout.markerGap,
    eventLabelGap: defaultTheme.layout.eventLabelGap,
    hoverColor: defaultTheme.emphasis.hoverColor,
    selectionColor: defaultTheme.emphasis.selectionColor,
    hoverWidthBonus: defaultTheme.emphasis.hoverWidthBonus,
    selectionWidthBonus: defaultTheme.emphasis.selectionWidthBonus,
    emphasisRadiusBonus: defaultTheme.emphasis.radiusBonus,
    clusterColor: defaultTheme.cluster.color,
    clusterTextColor: defaultTheme.cluster.textColor,
    clusterMarkerBonus: defaultTheme.cluster.markerBonus,
    rowSeparator: { ...rowSeparator, dash: [...rowSeparator.dash] },
    element: {
      lineColor: element.lineColor,
      lineWidth: element.lineWidth,
      lineDash: [...element.lineDash],
      labelColor: element.labelColor,
      labelFont: parseFont(element.labelFont),
      iconSize: element.iconSize,
    },
    event: {
      arrowColor: event.arrowColor,
      arrowWidth: event.arrowWidth,
      arrowDash: [...event.arrowDash],
      arrowheadSize: event.arrowheadSize,
      labelColor: event.labelColor,
      labelFont: parseFont(event.labelFont),
      nodeRadius: event.nodeRadius,
      labelBoxBackground: event.labelBoxBackground,
      labelBoxBorderColor: event.labelBoxBorderColor,
      labelBoxBorderWidth: event.labelBoxBorderWidth,
      labelBoxBorderDash: [...event.labelBoxBorderDash],
      labelBoxPadding: event.labelBoxPadding,
    },
  };
}

const defaultOptionsConfig: OptionsConfig = {
  renderer: 'auto',
  layout: 'byFirstEvent',
  multiSelect: true,
  streamingLayout: 'stable-append',
  layoutDebounceMs: 120,
  eventLabelPlacement: 'midpoint',
  clustering: {
    enabled: true,
    strategy: 'bySourceTargetColumn',
    minSeparationPx: 12,
  },
  lodEventLabelPxPerDay: DEFAULT_LABEL_PX_PER_DAY,
};

export const DEFAULT_CONFIG: DemoConfig = {
  dataset: 'default',
  streaming: false,
  resolvers: false,
  formatters: false,
  theme: defaultThemeConfig(),
  options: defaultOptionsConfig,
};

/**
 * The initial config, with the renderer optionally pinned via `?renderer=`.
 * Playwright pixel-reading specs need a deterministic backend — a WebGL-bound
 * canvas can't hand out a 2D context — so they navigate with the param.
 */
export function initialConfig(): DemoConfig {
  if (typeof location === 'undefined') return DEFAULT_CONFIG;
  const renderer = new URLSearchParams(location.search).get('renderer');
  if (renderer === 'auto' || renderer === 'canvas2d' || renderer === 'webgl') {
    return {
      ...DEFAULT_CONFIG,
      options: { ...DEFAULT_CONFIG.options, renderer },
    };
  }
  return DEFAULT_CONFIG;
}

// --- Built-in look presets -------------------------------------------------

const base = DEFAULT_CONFIG.theme;

/** A clean light surface (the demo's former "light theme" toggle). */
const lightTheme: ThemeConfig = {
  ...base,
  background: '#f7f8fa',
  gridlineColor: 'rgba(0,0,0,0.10)',
  headerTextColor: '#5a6472',
  hoverColor: '#d97706',
  selectionColor: '#2563eb',
  clusterColor: '#b45309',
  clusterTextColor: '#b45309',
  element: { ...base.element, lineColor: '#2563eb', labelColor: '#1f2933' },
  event: { ...base.event, arrowColor: '#52606d', labelColor: '#1f2933' },
};

/** Maximum legibility: pure black/white, heavier strokes and emphasis. */
const highContrastTheme: ThemeConfig = {
  ...base,
  background: '#000000',
  gridlineColor: 'rgba(255,255,255,0.35)',
  headerTextColor: '#ffffff',
  hoverColor: '#ffeb3b',
  selectionColor: '#00e5ff',
  hoverWidthBonus: 3,
  selectionWidthBonus: 3,
  emphasisRadiusBonus: 2,
  clusterColor: '#ffd54f',
  clusterTextColor: '#ffffff',
  rowSeparator: {
    enabled: true,
    color: 'rgba(255,255,255,0.25)',
    width: 1,
    dash: [],
  },
  element: {
    ...base.element,
    lineColor: '#ffffff',
    lineWidth: 3,
    labelColor: '#ffffff',
  },
  event: {
    ...base.event,
    arrowColor: '#ffffff',
    arrowWidth: 2,
    labelColor: '#ffffff',
  },
};

/** Quiet, low-chrome: no gridlines, thin muted strokes. */
const minimalTheme: ThemeConfig = {
  ...base,
  background: '#0e1116',
  gridlineColor: 'transparent',
  element: {
    ...base.element,
    lineColor: '#3a4a63',
    lineWidth: 1,
    labelColor: '#8a93a0',
  },
  event: {
    ...base.event,
    arrowColor: '#4a5568',
    arrowWidth: 1,
    nodeRadius: 2,
    labelColor: '#8a93a0',
  },
};

/** A named look applied as a whole (preserving the user's dataset choice). */
export interface Preset {
  label: string;
  theme: ThemeConfig;
  options: OptionsConfig;
}

export const PRESETS: readonly Preset[] = [
  { label: 'Dark', theme: base, options: defaultOptionsConfig },
  { label: 'Light', theme: lightTheme, options: defaultOptionsConfig },
  {
    label: 'High-contrast',
    theme: highContrastTheme,
    options: defaultOptionsConfig,
  },
  { label: 'Minimal', theme: minimalTheme, options: defaultOptionsConfig },
];
