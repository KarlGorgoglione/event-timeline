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

/** The concrete backend behind the seam (§4). */
export type RendererBackend = 'canvas2d' | 'webgl';

/**
 * Host preference for backend selection (§4, §16). `'auto'` (the default)
 * picks WebGL2 when it is hardware-accelerated and falls back to Canvas2D;
 * `'webgl'` forces WebGL2 whenever the API exists (even software-rendered);
 * `'canvas2d'` skips probing entirely.
 */
export type RendererPreference = 'auto' | RendererBackend;

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

/** Lines sharing one colour/width/dash, drawn as a single path (§4 batch-by-style). */
export interface LineBatch {
  color: string;
  width: number;
  /**
   * Dash pattern in DEVICE pixels (already dpr-scaled, §3). Omitted or empty
   * means a solid line; the backend resets its dash state afterwards so it never
   * bleeds into the next batch.
   */
  dash?: number[];
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

/**
 * An opaque, backend-specific image handle (§4, §16). The seam treats element
 * icons as black boxes so it leaks no DOM type: `Canvas2DRenderer` narrows this
 * to a `CanvasImageSource`, while a future `WebGLRenderer` would upload it as a
 * texture. Engine-internal icon code (the icon cache) supplies `HTMLImageElement`,
 * which widens to this handle at the snap boundary.
 */
export type RendererImage = unknown;

export interface ImageItem {
  x: number;
  y: number;
  size: number;
  image: RendererImage;
}

export interface ImageBatch {
  items: ImageItem[];
}

export interface Renderer {
  /** Which backend this instance is (§4) — e.g. for host diagnostics. */
  readonly backend: RendererBackend;
  resize(deviceWidth: number, deviceHeight: number): void;
  /** Clear/prepare a layer for drawing. */
  beginFrame(layer: Layer): void;
  /** Fill a device-px rectangle with a solid colour (e.g. the header mask, §4). */
  fillRect(
    x: number,
    y: number,
    width: number,
    height: number,
    color: string,
  ): void;
  drawLines(batch: LineBatch): void;
  drawArrowheads(batch: ArrowheadBatch): void;
  drawNodes(batch: NodeBatch): void;
  drawText(batch: TextBatch): void;
  drawImages(batch: ImageBatch): void;
  /** Caller caches results (§4). */
  measureText(text: string, font: string): TextMetricsLite;
  endFrame(layer: Layer): void;
  /** Release backend resources (GPU memory, listeners). Optional: Canvas2D has none. */
  dispose?(): void;
}
