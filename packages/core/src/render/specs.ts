// CSS-pixel draw primitives produced by the per-frame builders (DESIGN.md §4).
//
// Builders (elementLines, arrows) are pure functions of the camera/layout/data:
// they emit these specs in CSS pixels so the geometry is unit-testable without a
// canvas or a device-pixel ratio. A single snap pass (`render/snap.ts`) converts
// each spec into the device-pixel renderer batch of `render/types.ts`. This keeps
// the DPR convention (§3) in one place and the geometry portable.

import type { Extent } from '../model/extent';
import type {
  ElementStyle,
  EventStyle,
  Time,
  TimelineElement,
  TimelineEvent,
  Theme,
} from '../model/types';
import type { Camera, Viewport } from '../scale/camera';
import type { RowLayout } from '../layout/positions';
import type { ClusterStrategy } from '../cluster/types';

/** A line segment in CSS pixels. */
export interface SpecSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Lines sharing one colour/width (snapped into a single path, §4). */
export interface LineSpec {
  color: string;
  width: number;
  segments: SpecSegment[];
}

/** Filled circles sharing one colour/radius (source dots, §1). */
export interface NodeSpec {
  color: string;
  radius: number;
  items: { x: number; y: number }[];
}

/** Filled triangles sharing one colour/size; `angle` points source→target (§1). */
export interface ArrowheadSpec {
  color: string;
  size: number;
  items: { x: number; y: number; angle: number }[];
}

/** Text sharing one colour/font/alignment. */
export interface LabelSpec {
  color: string;
  font: string;
  baseline: 'top' | 'middle' | 'alphabetic';
  align: 'left' | 'center' | 'right';
  items: { x: number; y: number; text: string }[];
}

/** Icon images, drawn at a square size in CSS pixels. */
export interface IconSpec {
  items: { x: number; y: number; size: number; image: HTMLImageElement }[];
}

/** Inclusive visible row interval, padded by one row each side (§5, §16). */
export interface RowBand {
  firstRow: number;
  lastRow: number;
}

/**
 * Identity-carrying geometry for one visible primitive, in CSS pixels (§5).
 * Emitted by the builders alongside the style-batched draw specs from the *same*
 * computed coordinates (DRY), so the hit-test grid and the overlay highlight
 * both reuse it without recomputing positions. Each target holds the source
 * element/event reference directly, so a hit needs no store lookup to build its
 * `HitResult`.
 */
export type HitTarget<TData = unknown> =
  | {
      kind: 'element';
      element: TimelineElement<TData>;
      /** Horizontal line: y, and the visible x-extent. */
      y: number;
      x1: number;
      x2: number;
      width: number;
    }
  | {
      kind: 'event';
      event: TimelineEvent<TData>;
      /** Riser / self-loop segments (with hop arcs over crossed lines, §16). */
      segments: SpecSegment[];
      /** Arrowhead *anchor* (its base); the tip sits `arrowheadSize` beyond it. */
      arrowhead?: { x: number; y: number };
      /** Source dot, on the source line. */
      node?: { x: number; y: number };
      /** Target dot, on the target line at the landing point (§1). */
      targetNode?: { x: number; y: number };
      width: number;
      arrowheadSize: number;
    }
  | {
      kind: 'cluster';
      /** The collapsed members, surfaced verbatim in the hit `HitResult` (§6). */
      events: TimelineEvent<TData>[];
      /** Riser spanning the cluster's row interval. */
      segments: SpecSegment[];
      /** Count marker centre; its half-extent for square hit containment. */
      marker: { x: number; y: number };
      markerSize: number;
      width: number;
    };

/**
 * The read-only dataset access a builder needs (ISP): a narrow view of
 * `DataStore` so builders stay decoupled from the store implementation and are
 * trivial to fake in tests.
 */
export interface DataAccess<TData = unknown> {
  getEvents(): readonly TimelineEvent<TData>[];
  /** Events with `time` in `[tStart, tEnd]` via the temporal index (§5). */
  getEventsInRange(tStart: Time, tEnd: Time): readonly TimelineEvent<TData>[];
  getElements(): readonly TimelineElement<TData>[];
  getElementById(id: string): TimelineElement<TData> | undefined;
  getExtent(id: string): Extent | undefined;
}

/**
 * How an element's `icon` resolves for the current frame. Injected into builders
 * (rather than importing the icon cache / DOM) so they stay pure: `none` means a
 * URL icon is still loading and should be skipped this frame (§1, §11).
 */
export type IconResolution =
  | { kind: 'image'; image: HTMLImageElement }
  | { kind: 'text'; text: string }
  | { kind: 'none' };

export type ResolveIcon = (icon: string | HTMLImageElement) => IconResolution;

/** Resolved level-of-detail config for one frame (§6). */
export interface LodConfig {
  /** Below this zoom, per-event labels are suppressed; markers still show. */
  eventLabelMinPxPerMs: number;
}

/** Resolved clustering config for one frame (§6). */
export interface ClusteringConfig {
  enabled: boolean;
  strategy: ClusterStrategy;
  /** Pixel separation under which same-key events collapse into a marker. */
  minSeparationPx: number;
}

/** Everything a primitive builder reads for one frame. */
export interface BuildContext<TData = unknown> {
  camera: Camera;
  rowLayout: RowLayout;
  data: DataAccess<TData>;
  viewport: Viewport;
  theme: Theme;
  band: RowBand;
  resolveIcon: ResolveIcon;
  lod: LodConfig;
  clustering: ClusteringConfig;
  /**
   * Fully resolved per-item styles, following the §11 order (per-item `style` →
   * resolver → theme). The engine binds these from its theme + style resolvers so
   * the builders stay pure and the resolution lives in exactly one place.
   */
  resolveElementStyle: (element: TimelineElement<TData>) => ElementStyle;
  resolveEventStyle: (event: TimelineEvent<TData>) => EventStyle;
  /**
   * Label text formatters (§11). The engine supplies defaults that echo the raw
   * label, so a builder never branches on whether a formatter was provided.
   * `formatEventLabel` may return `undefined`/empty for an event with no label.
   */
  formatElementLabel: (element: TimelineElement<TData>) => string;
  formatEventLabel: (event: TimelineEvent<TData>) => string | undefined;
}
