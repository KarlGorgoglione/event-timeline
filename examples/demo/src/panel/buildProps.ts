// Pure translation from the editable `DemoConfig` to the engine's props (§11,
// §12). The only place that knows the engine's prop shapes; callers memoise
// each result so unchanged slices keep a stable reference.

import {
  barycenter,
  byDay,
  byElementPair,
  byFirstEvent,
  byPixelColumn,
  bySourceTargetColumn,
  explicit,
  type ClusterStrategy,
  type Formatters,
  type LayoutStrategy,
  type StyleResolvers,
  type Theme,
  type TimelineOptions,
} from '@event-timeline/react';
import type { FontValue } from './controls';
import type {
  ClusterKey,
  LayoutKey,
  OptionsConfig,
  ThemeConfig,
} from './config';
import type { DemoDatum } from '../synthetic';

const MS_PER_DAY = 86_400_000;

const LAYOUTS: Record<LayoutKey, LayoutStrategy> = {
  byFirstEvent,
  barycenter,
  explicit,
};

const CLUSTERS: Record<ClusterKey, ClusterStrategy> = {
  byPixelColumn,
  byElementPair,
  byDay,
  bySourceTargetColumn,
};

/** Serialise the structured font back to the CSS shorthand the theme expects. */
const font = (f: FontValue): string => `${f.size}px ${f.family}`;

export function buildTheme(t: ThemeConfig): Partial<Theme> {
  return {
    background: t.background,
    gridlineColor: t.gridlineColor,
    gridlineWidth: t.gridlineWidth,
    gridlineDash: t.gridlineDash,
    headerTextColor: t.headerTextColor,
    headerFont: font(t.headerFont),
    headerHeight: t.headerHeight,
    headerMajorTickRatio: t.headerMajorTickRatio,
    headerMinorTickRatio: t.headerMinorTickRatio,
    rowHeight: t.rowHeight,
    rowGap: t.rowGap,
    labelPadding: t.labelPadding,
    lineLeadPadding: t.lineLeadPadding,
    markerGap: t.markerGap,
    eventLabelGap: t.eventLabelGap,
    hoverColor: t.hoverColor,
    selectionColor: t.selectionColor,
    hoverWidthBonus: t.hoverWidthBonus,
    selectionWidthBonus: t.selectionWidthBonus,
    emphasisRadiusBonus: t.emphasisRadiusBonus,
    clusterColor: t.clusterColor,
    clusterTextColor: t.clusterTextColor,
    clusterMarkerBonus: t.clusterMarkerBonus,
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

export function buildOptions(o: OptionsConfig): TimelineOptions {
  return {
    layout: LAYOUTS[o.layout],
    multiSelect: o.multiSelect,
    streamingLayout: o.streamingLayout,
    layoutDebounceMs: o.layoutDebounceMs,
    eventLabel: { placement: o.eventLabelPlacement },
    clustering: {
      enabled: o.clustering.enabled,
      strategy: CLUSTERS[o.clustering.strategy],
      minSeparationPx: o.clustering.minSeparationPx,
    },
    lod: { eventLabelMinPxPerMs: o.lodEventLabelPxPerDay / MS_PER_DAY },
  };
}

// --- Data-driven hooks (preserved feature demos) ---------------------------

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
