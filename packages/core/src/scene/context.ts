// Shared types for the frame builders (DESIGN.md §4).

import type { ClusterStrategy } from '../cluster/types';
import type { RowLayout } from '../layout/positions';
import type { DataStore } from '../model/store';
import type { Camera, Viewport } from '../scale/camera';
import type { EngineConfig } from '../engine/options';
import type { StyleTable } from './styles';

/** Inclusive visible row interval, padded by one row each side (§5). */
export interface RowBand {
  firstRow: number;
  lastRow: number;
}

/**
 * Where an event's label sits relative to its arrow (DESIGN.md §11). Only the
 * position differs; the label's style (text + box) is the same in each.
 *
 * - `'midpoint'` — beside the riser, at its vertical midpoint (default).
 * - `'sourceNode'` — centred above/below the source node, direction-aware.
 */
export type EventLabelPlacement = 'midpoint' | 'sourceNode';

/** Resolved event-label placement config (DESIGN.md §11). */
export interface EventLabelConfig {
  placement: EventLabelPlacement;
}

/** Resolved level-of-detail config (§6). */
export interface LodConfig {
  /** Below this zoom, per-event labels are suppressed; markers still show. */
  eventLabelMinPxPerMs: number;
}

/** Resolved clustering config (§6). */
export interface ClusteringConfig {
  enabled: boolean;
  strategy: ClusterStrategy;
  /** Pixel separation under which same-key events collapse into a marker. */
  minSeparationPx: number;
  /** Marker budget of an aggregated (zoomed-out) frame; see ClusteringOptions. */
  maxMarkers: number;
}

/**
 * How an element's `icon` resolves for the current frame: `none` means a URL
 * icon is still loading and is skipped this frame (§1, §11).
 */
export type IconResolution =
  | { kind: 'image'; image: CanvasImageSource }
  | { kind: 'text'; text: string }
  | { kind: 'none' };

/** Everything the frame builders read for one frame. */
export interface FrameInput<TData> {
  store: DataStore<TData>;
  rows: RowLayout;
  /** Row → element slot. */
  rowSlot: Int32Array;
  /** Element slot → row, or −1 when the element has no row. */
  slotRow: Int32Array;
  camera: Camera;
  viewport: Viewport;
  dpr: number;
  band: RowBand;
  config: EngineConfig<TData>;
  styles: StyleTable<TData>;
  /** Cached text width (CSS px) for a CSS-px font. */
  measure: (text: string, font: string) => number;
  resolveIcon: (icon: string | CanvasImageSource) => IconResolution;
  /**
   * Whether the run of clustered events starting at this event index has
   * been expanded in place (spread out) by a click (§6).
   */
  isSpread: (firstEventIndex: number) => boolean;
  /** The deepest zoom; clusters never collapse there (§6). */
  maxPxPerMs: number;
}

// What each builder reads, so its real dependencies are visible in its
// signature rather than hidden in the whole frame input.

/** The time header and row separators (§8). */
export type HeaderInput<TData> = Pick<
  FrameInput<TData>,
  'camera' | 'viewport' | 'dpr' | 'config' | 'band' | 'measure'
>;

/** Element lines and their start markers (§1). */
export type ElementsInput<TData> = Pick<
  FrameInput<TData>,
  | 'store'
  | 'camera'
  | 'viewport'
  | 'band'
  | 'config'
  | 'styles'
  | 'dpr'
  | 'rowSlot'
  | 'measure'
  | 'resolveIcon'
>;

/** Event arrows and clusters (§5, §6): everything but icons. */
export type EventsInput<TData> = Omit<FrameInput<TData>, 'resolveIcon'>;

/** The label collision pass (§4). */
export type LabelsInput<TData> = Pick<
  FrameInput<TData>,
  'styles' | 'dpr' | 'config'
>;
