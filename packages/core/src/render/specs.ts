// CSS-pixel draw primitives produced by the per-frame builders (DESIGN.md §4).
//
// Builders (elementLines, arrows) are pure functions of the camera/layout/data:
// they emit these specs in CSS pixels so the geometry is unit-testable without a
// canvas or a device-pixel ratio. A single snap pass (`render/snap.ts`) converts
// each spec into the device-pixel renderer batch of `render/types.ts`. This keeps
// the DPR convention (§3) in one place and the geometry portable.

import type { Extent } from '../model/extent';
import type { TimelineElement, TimelineEvent, Theme } from '../model/types';
import type { Camera, Viewport } from '../scale/camera';
import type { RowLayout } from '../layout/positions';

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
      /** Riser / self-loop segments. */
      segments: SpecSegment[];
      arrowhead?: { x: number; y: number };
      node?: { x: number; y: number };
      width: number;
      arrowheadSize: number;
    };

/**
 * The read-only dataset access a builder needs (ISP): a narrow view of
 * `DataStore` so builders stay decoupled from the store implementation and are
 * trivial to fake in tests.
 */
export interface DataAccess<TData = unknown> {
  getEvents(): readonly TimelineEvent<TData>[];
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

/** Everything a primitive builder reads for one frame. */
export interface BuildContext<TData = unknown> {
  camera: Camera;
  rowLayout: RowLayout;
  data: DataAccess<TData>;
  viewport: Viewport;
  theme: Theme;
  band: RowBand;
  resolveIcon: ResolveIcon;
}
