// The backend-free Renderer seam (DESIGN.md §4).
//
// The swappable-backend promise only holds if the seam is an explicit,
// backend-free interface: it exposes only primitive draw verbs in DEVICE pixels
// and leaks no Canvas2D-specific type, so a future WebGLRenderer is
// substitutable without engine changes (LSP). The engine never imports
// CanvasRenderingContext2D.
//
// The full §4 interface is declared now so the seam is stable across phases.
// Phase 1 uses drawLines / drawText; the arrow/node/image verbs are typed here
// and implemented (as no-ops) by Canvas2DRenderer until Phase 2.

export type Layer = 'base' | 'overlay';

/** Backend-neutral text metrics (no DOM TextMetrics leak). */
export interface TextMetricsLite {
  width: number;
}

// All coordinates and sizes in these batches are already in DEVICE pixels:
// the engine converts Camera CSS-px output via dpr and integer-snaps before
// building them (§3 DPR convention).

export interface LineSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Lines sharing one colour/width, drawn as a single path (§4 batch-by-style). */
export interface LineBatch {
  color: string;
  width: number;
  segments: LineSegment[];
}

export interface TextItem {
  x: number;
  y: number;
  text: string;
}

export interface TextBatch {
  color: string;
  font: string;
  baseline: 'top' | 'middle' | 'alphabetic';
  align: 'left' | 'center' | 'right';
  items: TextItem[];
}

// --- Phase 2 batch shapes (typed now to keep the seam stable) ---

export interface ArrowheadItem {
  x: number;
  y: number;
  /** Direction the arrowhead points, in radians. */
  angle: number;
}

export interface ArrowheadBatch {
  color: string;
  size: number;
  items: ArrowheadItem[];
}

export interface NodeItem {
  x: number;
  y: number;
}

export interface NodeBatch {
  color: string;
  radius: number;
  items: NodeItem[];
}

export interface ImageItem {
  x: number;
  y: number;
  size: number;
  image: HTMLImageElement;
}

export interface ImageBatch {
  items: ImageItem[];
}

export interface Renderer {
  resize(deviceWidth: number, deviceHeight: number): void;
  /** Clear/prepare a layer for drawing. */
  beginFrame(layer: Layer): void;
  drawLines(batch: LineBatch): void;
  drawArrowheads(batch: ArrowheadBatch): void;
  drawNodes(batch: NodeBatch): void;
  drawText(batch: TextBatch): void;
  drawImages(batch: ImageBatch): void;
  /** Caller caches results (§4). */
  measureText(text: string, font: string): TextMetricsLite;
  endFrame(layer: Layer): void;
}
