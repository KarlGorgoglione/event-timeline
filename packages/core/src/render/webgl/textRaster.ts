// Shared offscreen 2D rasterizer for the WebGL backend's text (§4).
//
// Text is the one primitive WebGL cannot produce natively with Canvas2D
// fidelity, so each label is rasterized by Canvas2D itself and uploaded to the
// atlas: baseline semantics, font fallback, kerning, and colour-emoji
// rendering are all delegated to the same text engine the Canvas2D backend
// uses. `measure` answers the Renderer seam's measureText with identical
// metrics, so layout and label boxes are pixel-equal across backends.
//
// Browser-only by nature; the canvas is created lazily on first use, keeping
// module load SSR-safe (the engine constructor already requires real
// canvases).

import { parseFontPx } from '../device';

export interface RasterizedText {
  /** Scratch canvas holding the rasterized label at (0,0)..(w,h). */
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  /** Offset from the drawText anchor to the bitmap's top-left, device px. */
  offsetX: number;
  offsetY: number;
  /** The text advance (measureText width), for align placement. */
  advance: number;
}

export type TextBaselineLite = 'top' | 'middle' | 'alphabetic';

export class TextRasterizer {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;

  /** The shared 2D context (lazy); also serves the colour-parse fallback. */
  context(): CanvasRenderingContext2D | null {
    if (this.ctx === null && typeof document !== 'undefined') {
      this.canvas = document.createElement('canvas');
      this.canvas.width = 256;
      this.canvas.height = 64;
      this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    }
    return this.ctx;
  }

  /** Seam measureText: same text engine as Canvas2DRenderer → same metrics. */
  measure(text: string, font: string): number {
    const ctx = this.context();
    if (ctx === null) return 0;
    ctx.font = font;
    return ctx.measureText(text).width;
  }

  /**
   * Draw `text` in its final colour and return the tight bitmap plus the
   * anchor→bitmap offset. Baseline math is not reimplemented: rasterizing with
   * the requested textBaseline bakes Canvas2D's own semantics into the offset.
   */
  rasterize(
    text: string,
    font: string,
    color: string,
    baseline: TextBaselineLite,
  ): RasterizedText | null {
    const ctx = this.context();
    if (ctx === null || text.length === 0) return null;

    ctx.font = font;
    ctx.textAlign = 'left';
    ctx.textBaseline = baseline;
    const m = ctx.measureText(text);
    const fontPx = parseFontPx(font);
    // actualBoundingBox* are anchor-relative; older engines may omit them —
    // fall back to font-size-derived bounds generous enough not to clip.
    const left = Math.ceil(m.actualBoundingBoxLeft ?? 0) + 1;
    const ascent = Math.ceil(m.actualBoundingBoxAscent ?? fontPx * 1.2) + 1;
    const right = Math.ceil(m.actualBoundingBoxRight ?? m.width) + 1;
    const descent = Math.ceil(m.actualBoundingBoxDescent ?? fontPx * 0.5) + 1;
    const width = left + right;
    const height = ascent + descent;
    if (width <= 0 || height <= 0) return null;

    this.ensureSize(width, height);
    // ensureSize may have replaced the canvas, resetting context state.
    ctx.font = font;
    ctx.textAlign = 'left';
    ctx.textBaseline = baseline;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = color;
    ctx.fillText(text, left, ascent);

    return {
      canvas: this.canvas as HTMLCanvasElement,
      width,
      height,
      offsetX: -left,
      offsetY: -ascent,
      advance: m.width,
    };
  }

  /** Pixels of the last rasterize call, for the atlas upload. */
  readPixels(width: number, height: number): ImageData | null {
    const ctx = this.ctx;
    if (ctx === null) return null;
    return ctx.getImageData(0, 0, width, height);
  }

  private ensureSize(width: number, height: number): void {
    const canvas = this.canvas as HTMLCanvasElement;
    if (canvas.width >= width && canvas.height >= height) return;
    canvas.width = Math.max(canvas.width, ceilPow2(width));
    canvas.height = Math.max(canvas.height, ceilPow2(height));
  }
}

function ceilPow2(n: number): number {
  return 2 ** Math.ceil(Math.log2(Math.max(1, n)));
}
