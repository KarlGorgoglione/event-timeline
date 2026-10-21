// Offscreen 2D rasterizers feeding the WebGL atlases (DESIGN.md §4).
//
// Text is the one primitive WebGL cannot produce with Canvas2D fidelity, so
// each label is drawn by Canvas2D itself into a scratch canvas and its pixels
// copied into an atlas page: baseline semantics, font fallback, kerning and
// colour emoji all come from the same text engine the Canvas2D backend uses,
// and `measure` gives identical metrics. Icons are drawn at their device size
// into a separate scratch canvas, because drawing a cross-origin image taints
// a canvas for good: a tainted icon canvas is replaced, never shared.
//
// Browser-only; the canvases are created lazily, keeping module load SSR-safe.

import { parseFontPx } from '../device';

export type TextBaselineLite = 'top' | 'middle' | 'alphabetic';

export interface RasterizedText {
  width: number;
  height: number;
  /** Offset from the text anchor to the bitmap's top-left, device px. */
  offsetX: number;
  offsetY: number;
  /** The text advance (measureText width), for alignment. */
  advance: number;
  pixels: ImageData;
}

function scratchCanvas(): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  return canvas.getContext('2d', { willReadFrequently: true });
}

function ensureSize(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const { canvas } = ctx;
  if (canvas.width >= w && canvas.height >= h) return;
  canvas.width = Math.max(canvas.width, ceilPow2(w));
  canvas.height = Math.max(canvas.height, ceilPow2(h));
}

function ceilPow2(n: number): number {
  return 2 ** Math.ceil(Math.log2(Math.max(1, n)));
}

/**
 * A lazily created 2D context for parsing CSS colours the fast parser in
 * color.ts doesn't handle (named colours, hsl(), color()).
 */
export function colorParsingContext(): () => CanvasRenderingContext2D | null {
  let ctx: CanvasRenderingContext2D | null | undefined;
  return () => {
    if (ctx === undefined) ctx = scratchCanvas();
    return ctx;
  };
}

export class TextRasterizer {
  private ctx: CanvasRenderingContext2D | null | undefined;

  private context(): CanvasRenderingContext2D | null {
    if (this.ctx === undefined) this.ctx = scratchCanvas();
    return this.ctx;
  }

  /** Same text engine as the Canvas2D backend, so the same metrics. */
  measure(text: string, font: string): number {
    const ctx = this.context();
    if (ctx === null) return 0;
    ctx.font = font;
    return ctx.measureText(text).width;
  }

  /**
   * Draw `text` in its final colour and return its tight pixels plus the
   * anchor-to-bitmap offset. Rasterizing with the requested baseline bakes
   * Canvas2D's own baseline semantics into the offset.
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
    // actualBoundingBox* are anchor-relative; fall back to font-size-derived
    // bounds generous enough not to clip where they are missing.
    const left = Math.ceil(m.actualBoundingBoxLeft ?? 0) + 1;
    const ascent = Math.ceil(m.actualBoundingBoxAscent ?? fontPx * 1.2) + 1;
    const right = Math.ceil(m.actualBoundingBoxRight ?? m.width) + 1;
    const descent = Math.ceil(m.actualBoundingBoxDescent ?? fontPx * 0.5) + 1;
    const width = left + right;
    const height = ascent + descent;
    if (width <= 0 || height <= 0) return null;
    ensureSize(ctx, width, height);
    // Resizing resets the context state.
    ctx.font = font;
    ctx.textAlign = 'left';
    ctx.textBaseline = baseline;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = color;
    ctx.fillText(text, left, ascent);
    return {
      width,
      height,
      offsetX: -left,
      offsetY: -ascent,
      advance: m.width,
      pixels: ctx.getImageData(0, 0, width, height),
    };
  }
}

export class IconRasterizer {
  private ctx: CanvasRenderingContext2D | null | undefined;

  /**
   * The image's pixels at `size × size` device px. Throws a SecurityError
   * for a cross-origin image without CORS; the tainted canvas is dropped so
   * later icons are unaffected.
   */
  rasterize(image: CanvasImageSource, size: number): ImageData | null {
    if (this.ctx === undefined) this.ctx = scratchCanvas();
    const ctx = this.ctx;
    if (ctx === null || size <= 0) return null;
    ensureSize(ctx, size, size);
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(image, 0, 0, size, size);
    try {
      return ctx.getImageData(0, 0, size, size);
    } catch (error) {
      this.ctx = undefined;
      throw error;
    }
  }
}
