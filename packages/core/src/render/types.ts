// The backend-free Renderer seam (DESIGN.md §4).
//
// A Renderer draws one canvas layer. It exposes only primitive draw verbs in
// DEVICE pixels and leaks no Canvas2D or WebGL type, so backends (and headless
// or test renderers) are interchangeable without engine changes. Batches carry
// their geometry in reusable typed arrays — only the first `count` entries are
// valid — so a frame allocates nothing per primitive, and a GPU backend can
// upload the arrays as they are.

/** The built-in backends (§4). */
export type RendererBackend = 'canvas2d' | 'webgl';

/**
 * Host preference for the base layer's backend (§4). `'auto'` (the default)
 * picks WebGL2 when it is hardware-accelerated and falls back to Canvas2D;
 * `'webgl'` forces WebGL2 whenever the API exists (even software-rendered);
 * `'canvas2d'` skips WebGL entirely. The overlay layer is always Canvas2D.
 */
export type RendererPreference = 'auto' | RendererBackend;

/** Backend-neutral text metrics (no DOM TextMetrics leak). */
export interface TextMetricsLite {
  width: number;
}

/**
 * Line segments sharing one colour, width and dash: `coords` holds
 * `x1, y1, x2, y2` per segment. When `joins[i]` is 1, segment `i` continues
 * the previous one (a polyline), so backends draw a join instead of two
 * separate caps.
 */
export interface LineBatch {
  color: string;
  width: number;
  /** Dash pattern in device px; omitted or empty means solid. */
  dash?: readonly number[];
  coords: Float32Array;
  joins?: Uint8Array;
  count: number;
}

/** Filled circles sharing one colour and radius: `coords` holds `x, y`. */
export interface NodeBatch {
  color: string;
  radius: number;
  coords: Float32Array;
  count: number;
}

/**
 * Filled triangles sharing one colour and size: `coords` holds `x, y, angle`
 * — the anchor (base centre) and the direction the tip points, in radians.
 */
export interface ArrowheadBatch {
  color: string;
  size: number;
  coords: Float32Array;
  count: number;
}

/** Text runs sharing one colour, font and alignment. */
export interface TextBatch {
  color: string;
  font: string;
  baseline: 'top' | 'middle' | 'alphabetic';
  align: 'left' | 'center' | 'right';
  xs: Float32Array;
  ys: Float32Array;
  texts: readonly string[];
  count: number;
}

/** Filled rectangles sharing one colour: `coords` holds `x, y, w, h`. */
export interface RectBatch {
  color: string;
  coords: Float32Array;
  count: number;
}

/**
 * An opaque image handle (§4). The seam treats icons as black boxes so it
 * leaks no DOM type: the Canvas2D backend narrows it to a `CanvasImageSource`,
 * the WebGL backend uploads it as a texture.
 */
export type RendererImage = unknown;

export interface ImageItem {
  x: number;
  y: number;
  size: number;
  image: RendererImage;
}

export interface ImageBatch {
  items: readonly ImageItem[];
}

export interface Renderer {
  /** Which backend this is (`'canvas2d'`, `'webgl'`, or a custom name). */
  readonly backend: string;
  resize(deviceWidth: number, deviceHeight: number): void;
  /**
   * Start a frame: clear to `clearColor` (the theme background for the base
   * layer), or to transparent when `null` (the overlay).
   */
  beginFrame(clearColor: string | null): void;
  /** Fill one device-px rectangle (e.g. the header mask, §4). */
  fillRect(
    x: number,
    y: number,
    width: number,
    height: number,
    color: string,
  ): void;
  drawRects(batch: RectBatch): void;
  drawLines(batch: LineBatch): void;
  drawArrowheads(batch: ArrowheadBatch): void;
  drawNodes(batch: NodeBatch): void;
  drawText(batch: TextBatch): void;
  drawImages(batch: ImageBatch): void;
  /** Caller caches results (§4). */
  measureText(text: string, font: string): TextMetricsLite;
  endFrame(): void;
  /** Release backend resources (GPU memory, listeners). */
  dispose?(): void;
}

/**
 * Renderers for the two layers, supplied by the host instead of a backend
 * preference: for headless rendering, tests, or a custom backend. The engine
 * then creates no canvases of its own.
 */
export interface RendererLayers {
  base: Renderer;
  overlay: Renderer;
}
