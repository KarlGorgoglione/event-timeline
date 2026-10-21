// Every engine option the demo can drive, in a serialisable shape (strategy
// *names*, human units), and its translation to `TimelineOptions` (§3.1, §4,
// §6, §7, §9). The defaults are the engine's own, so "modified" in the editor
// means "differs from what you get out of the box".

import {
  barycenter,
  byDay,
  byElementPair,
  byFirstEvent,
  byPixelColumn,
  bySourceTargetColumn,
  explicit,
  type ClusterStrategy,
  type LayoutStrategy,
  type TimelineOptions,
} from '@event-timeline/react';

export const MS_PER_MINUTE = 60_000;
export const MS_PER_HOUR = 3_600_000;
export const MS_PER_DAY = 86_400_000;

export type RendererKey = 'auto' | 'canvas2d' | 'webgl';
export type LayoutKey = 'byFirstEvent' | 'barycenter' | 'explicit';
export type ClusterKey =
  | 'bySourceTargetColumn'
  | 'byElementPair'
  | 'byPixelColumn'
  | 'byDay';
export type HopsKey = 'auto' | 'on' | 'off';
export type PointerKey = 'primary' | 'primary+middle';
export type FitKey = 'auto' | 'always' | 'first' | 'never';

export interface OptionsState {
  renderer: RendererKey;
  layout: LayoutKey;
  streamingLayout: 'stable-append' | 'full';
  layoutDebounceMs: number;
  emptyElements: 'hide' | 'show';
  multiSelect: boolean;
  clustering: {
    enabled: boolean;
    strategy: ClusterKey;
    minSeparationPx: number;
    /** Zoomed-out time-bin aggregation (§6); off = `maxMarkers: Infinity`. */
    aggregate: boolean;
    maxMarkers: number;
  };
  lod: {
    /** Event labels appear at or above this zoom, in px per day. */
    eventLabelPxPerDay: number;
  };
  arrows: {
    hops: HopsKey;
    hopRadius: number;
    hopBudget: number;
    subLaneStep: number;
    subLaneMax: number;
    targetDot: boolean;
  };
  labels: {
    placement: 'midpoint' | 'sourceNode';
    maxPerFrame: number;
    avoidCollisions: boolean;
  };
  navigation: {
    /** Deepest zoom-out is the whole data extent (`zoom.min: 'fit'`). */
    zoomMinFit: boolean;
    zoomMinPxPerDay: number;
    zoomMaxPxPerMinute: number;
    panBounds: 'none' | 'data';
    fitOnDataChange: FitKey;
    keyboard: boolean;
    pointer: PointerKey;
  };
  locale: string;
  accessibility: { label: string; description: string };
}

/** The engine's defaults (options.ts), in the demo's units. */
export const DEFAULT_OPTIONS: OptionsState = {
  renderer: 'auto',
  layout: 'byFirstEvent',
  streamingLayout: 'stable-append',
  layoutDebounceMs: 120,
  emptyElements: 'hide',
  multiSelect: false,
  clustering: {
    enabled: true,
    strategy: 'bySourceTargetColumn',
    minSeparationPx: 12,
    aggregate: true,
    maxMarkers: 4000,
  },
  lod: { eventLabelPxPerDay: 40 },
  arrows: {
    hops: 'auto',
    hopRadius: 4,
    hopBudget: 400,
    subLaneStep: 2,
    subLaneMax: 4,
    targetDot: true,
  },
  labels: { placement: 'midpoint', maxPerFrame: 400, avoidCollisions: true },
  navigation: {
    zoomMinFit: true,
    zoomMinPxPerDay: 1,
    zoomMaxPxPerMinute: 20,
    panBounds: 'none',
    fitOnDataChange: 'auto',
    keyboard: true,
    pointer: 'primary',
  },
  locale: 'en-US',
  accessibility: { label: 'Timeline', description: '' },
};

export const LAYOUTS: Record<LayoutKey, LayoutStrategy> = {
  byFirstEvent,
  barycenter,
  explicit,
};

export const CLUSTERS: Record<ClusterKey, ClusterStrategy> = {
  bySourceTargetColumn,
  byElementPair,
  byPixelColumn,
  byDay,
};

/**
 * The engine options for a state. Every group is passed whole: `setOptions`
 * merges one level deep, so a partial group would reset its other keys.
 */
export function toTimelineOptions(s: OptionsState): TimelineOptions {
  const description = s.accessibility.description.trim();
  return {
    renderer: s.renderer,
    layout: LAYOUTS[s.layout],
    streamingLayout: s.streamingLayout,
    layoutDebounceMs: s.layoutDebounceMs,
    emptyElements: s.emptyElements,
    multiSelect: s.multiSelect,
    clustering: {
      enabled: s.clustering.enabled,
      strategy: CLUSTERS[s.clustering.strategy],
      minSeparationPx: s.clustering.minSeparationPx,
      maxMarkers: s.clustering.aggregate ? s.clustering.maxMarkers : Infinity,
    },
    lod: { eventLabelMinPxPerMs: s.lod.eventLabelPxPerDay / MS_PER_DAY },
    arrows: {
      hops: s.arrows.hops === 'auto' ? 'auto' : s.arrows.hops === 'on',
      hopRadius: s.arrows.hopRadius,
      hopBudget: s.arrows.hopBudget,
      subLaneStep: s.arrows.subLaneStep,
      subLaneMax: s.arrows.subLaneMax,
      targetDot: s.arrows.targetDot,
    },
    labels: {
      maxPerFrame: s.labels.maxPerFrame,
      avoidCollisions: s.labels.avoidCollisions,
    },
    eventLabel: { placement: s.labels.placement },
    zoom: {
      min: s.navigation.zoomMinFit
        ? 'fit'
        : s.navigation.zoomMinPxPerDay / MS_PER_DAY,
      max: s.navigation.zoomMaxPxPerMinute / MS_PER_MINUTE,
    },
    pan: { bounds: s.navigation.panBounds },
    fitOnDataChange: s.navigation.fitOnDataChange,
    keyboard: s.navigation.keyboard,
    pointer: {
      buttons: s.navigation.pointer === 'primary' ? [0] : [0, 1],
    },
    locale: s.locale,
    accessibility:
      description === ''
        ? { label: s.accessibility.label }
        : { label: s.accessibility.label, description },
  };
}

export const LOCALES = [
  { value: 'en-US', label: 'English (US)' },
  { value: 'en-GB', label: 'English (UK)' },
  { value: 'fr-FR', label: 'Français' },
  { value: 'de-DE', label: 'Deutsch' },
  { value: 'es-ES', label: 'Español' },
  { value: 'ja-JP', label: '日本語' },
  { value: 'zh-CN', label: '中文' },
] as const;
