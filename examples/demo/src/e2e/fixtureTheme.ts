// Theme presets and data hooks of the e2e fixture page (DESIGN.md §14).
//
// The Playwright specs select these presets by label and the golden baselines
// are rendered with them, so their values are a contract: `fixtureTheme.test.ts`
// snapshots every output. 'Dark' is exactly core's `defaultTheme`. The
// showcase demo has its own themes (`src/themes/`) and never imports this.
//
// A preset is stored in an editable flat shape (structured fonts, plain dash
// arrays) and turned into a `ThemeInput` by `buildTheme`.

import {
  defaultTheme,
  type Formatters,
  type StyleResolvers,
  type ThemeInput,
} from '@event-timeline/react';
import type { DemoDatum } from '../synthetic';

// --- Editable shapes -------------------------------------------------------

/** A CSS font shorthand split into its size (px) and family. */
export interface FontValue {
  size: number;
  family: string;
}

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

/** Datasets the fixture page loads through `?dataset=`. */
export type DatasetKey = 'default' | 'aml' | 'synthetic10k' | 'synthetic50k';

// --- Defaults (derived from the engine's own defaults, so they never drift) --

const FONT_RE = /^\s*(\d+(?:\.\d+)?)px\s+(.+?)\s*$/;

/** Parse a CSS font shorthand into the structured value the presets hold. */
function parseFont(shorthand: string): FontValue {
  const m = FONT_RE.exec(shorthand);
  return m
    ? { size: Number(m[1]), family: m[2] as string }
    : { size: 12, family: 'system-ui, sans-serif' };
}

/** The preset base, copied from core's `defaultTheme` (DRY, no drift). */
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

// --- Presets ---------------------------------------------------------------

const base = defaultThemeConfig();

/** A clean light surface. */
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

/** A named look the fixture page switches to through `setPreset`. */
export interface Preset {
  label: string;
  theme: ThemeConfig;
}

export const PRESETS: readonly Preset[] = [
  { label: 'Dark', theme: base },
  { label: 'Light', theme: lightTheme },
  { label: 'High-contrast', theme: highContrastTheme },
  { label: 'Minimal', theme: minimalTheme },
];

// --- Preset → ThemeInput ---------------------------------------------------

/** Serialise the structured font back to the CSS shorthand the theme expects. */
const font = (f: FontValue): string => `${f.size}px ${f.family}`;

export function buildTheme(t: ThemeConfig): ThemeInput {
  return {
    background: t.background,
    grid: {
      color: t.gridlineColor,
      width: t.gridlineWidth,
      dash: t.gridlineDash,
    },
    header: {
      height: t.headerHeight,
      textColor: t.headerTextColor,
      font: font(t.headerFont),
      majorTickRatio: t.headerMajorTickRatio,
      minorTickRatio: t.headerMinorTickRatio,
    },
    layout: {
      rowHeight: t.rowHeight,
      rowGap: t.rowGap,
      edgePadding: t.labelPadding,
      lineLead: t.lineLeadPadding,
      markerGap: t.markerGap,
      eventLabelGap: t.eventLabelGap,
    },
    emphasis: {
      hoverColor: t.hoverColor,
      selectionColor: t.selectionColor,
      hoverWidthBonus: t.hoverWidthBonus,
      selectionWidthBonus: t.selectionWidthBonus,
      radiusBonus: t.emphasisRadiusBonus,
    },
    cluster: {
      color: t.clusterColor,
      textColor: t.clusterTextColor,
      markerBonus: t.clusterMarkerBonus,
    },
    rowSeparator: { ...t.rowSeparator },
    element: {
      lineColor: t.element.lineColor,
      lineWidth: t.element.lineWidth,
      lineDash: t.element.lineDash,
      labelColor: t.element.labelColor,
      labelFont: font(t.element.labelFont),
      iconSize: t.element.iconSize,
    },
    event: {
      arrowColor: t.event.arrowColor,
      arrowWidth: t.event.arrowWidth,
      arrowDash: t.event.arrowDash,
      arrowheadSize: t.event.arrowheadSize,
      labelColor: t.event.labelColor,
      labelFont: font(t.event.labelFont),
      nodeRadius: t.event.nodeRadius,
      labelBoxBackground: t.event.labelBoxBackground,
      labelBoxBorderColor: t.event.labelBoxBorderColor,
      labelBoxBorderWidth: t.event.labelBoxBorderWidth,
      labelBoxBorderDash: t.event.labelBoxBorderDash,
      labelBoxPadding: t.event.labelBoxPadding,
    },
  };
}

// --- Data-driven hooks (§11) -------------------------------------------------

/** Five-colour palette; bucket 0 is muted so AML background recedes (§11). */
const PALETTE = ['#6b7280', '#98c379', '#61afef', '#c678dd', '#e5c07b'];
const paletteColor = (category = 0): string =>
  PALETTE[category % PALETTE.length] as string;

export function buildResolvers(
  on: boolean,
): StyleResolvers<DemoDatum> | undefined {
  if (!on) return undefined;
  return {
    element: (e) => ({ lineColor: paletteColor(e.data?.category) }),
    event: (e) => {
      const colour = paletteColor(e.data?.category);
      return {
        arrowColor: colour,
        labelBoxBackground: 'rgba(0, 0, 0, 0.55)',
        labelBoxBorderColor: colour,
        labelBoxBorderWidth: 1,
      };
    },
  };
}

export function buildFormatters(
  on: boolean,
): Formatters<DemoDatum> | undefined {
  if (!on) return undefined;
  return {
    elementLabel: (e) => (e.label ?? e.id).toUpperCase(),
    eventLabel: (e) => `» ${e.label ?? e.id}`,
  };
}
