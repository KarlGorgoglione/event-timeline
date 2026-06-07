// The single CSS-px → device-px pass (DESIGN.md §3, §4).
//
// Builders emit specs in CSS pixels; this is the one place the DPR convention is
// applied — coordinates multiplied by dpr and snapped to integer device pixels,
// with a 0.5px hairline offset so odd-width strokes stay crisp, and fonts scaled
// to match the un-prescaled context. Keeping it here means the geometry builders
// never touch dpr and the snapping rule has a single definition.

import { hairlineOffset, scaleFontToDevice, snapDevice } from './device';
import type {
  ArrowheadSpec,
  IconSpec,
  LabelSpec,
  LineSpec,
  NodeSpec,
} from './specs';
import type {
  ArrowheadBatch,
  ImageBatch,
  LineBatch,
  NodeBatch,
  TextBatch,
} from './types';

/**
 * Scale a CSS-px dash pattern to device px (length along the path — not snapped
 * to integers, so sub-pixel dashes stay drift-free). Returns `undefined` for an
 * empty/omitted pattern so the renderer draws a solid line. This is the single
 * dash-scaling rule, reused by `snapLines` and by the engine's gridlines (which
 * build directly in device px and so call it inline).
 */
export function scaleDash(
  dash: number[] | undefined,
  dpr: number,
): number[] | undefined {
  return dash !== undefined && dash.length > 0
    ? dash.map((d) => d * dpr)
    : undefined;
}

export function snapLines(spec: LineSpec, dpr: number): LineBatch {
  const width = Math.max(1, snapDevice(spec.width, dpr));
  const off = hairlineOffset(width);
  return {
    color: spec.color,
    width,
    dash: scaleDash(spec.dash, dpr),
    segments: spec.segments.map((s) => ({
      x1: snapDevice(s.x1, dpr) + off,
      y1: snapDevice(s.y1, dpr) + off,
      x2: snapDevice(s.x2, dpr) + off,
      y2: snapDevice(s.y2, dpr) + off,
    })),
  };
}

export function snapNodes(spec: NodeSpec, dpr: number): NodeBatch {
  return {
    color: spec.color,
    radius: Math.max(1, snapDevice(spec.radius, dpr)),
    items: spec.items.map((i) => ({
      x: snapDevice(i.x, dpr),
      y: snapDevice(i.y, dpr),
    })),
  };
}

export function snapArrowheads(
  spec: ArrowheadSpec,
  dpr: number,
): ArrowheadBatch {
  return {
    color: spec.color,
    size: Math.max(1, snapDevice(spec.size, dpr)),
    items: spec.items.map((i) => ({
      x: snapDevice(i.x, dpr),
      y: snapDevice(i.y, dpr),
      angle: i.angle, // direction is dpr-invariant
    })),
  };
}

export function snapLabels(spec: LabelSpec, dpr: number): TextBatch {
  return {
    color: spec.color,
    font: scaleFontToDevice(spec.font, dpr),
    baseline: spec.baseline,
    align: spec.align,
    items: spec.items.map((i) => ({
      x: snapDevice(i.x, dpr),
      y: snapDevice(i.y, dpr),
      text: i.text,
    })),
  };
}

export function snapIcons(spec: IconSpec, dpr: number): ImageBatch {
  return {
    items: spec.items.map((i) => ({
      x: snapDevice(i.x, dpr),
      y: snapDevice(i.y, dpr),
      size: snapDevice(i.size, dpr),
      image: i.image,
    })),
  };
}
