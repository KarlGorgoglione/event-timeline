// Canvas2D implementation of the Renderer seam (DESIGN.md §3 DPR, §4).
//
// One instance draws one canvas layer. It is the only renderer allowed to touch
// a 2D context for drawing, and it is not re-exported as a type, so the engine
// never imports CanvasRenderingContext2D.
//
// DPR convention (§3): resize sets the backing store to device pixels and does
// NOT call ctx.scale; all incoming batch coordinates are already in device
// pixels. Each batch is one path or one fill, minimising state changes (§4).

import { arrowheadTriangle } from './arrowGeometry';
import type {
  ArrowheadBatch,
  ImageBatch,
  LineBatch,
  NodeBatch,
  RectBatch,
  Renderer,
  TextBatch,
  TextMetricsLite,
} from './types';

export class Canvas2DRenderer implements Renderer {
  readonly backend = 'canvas2d' as const;
  private readonly ctx: CanvasRenderingContext2D;

  /** Throws when the canvas yields no 2D context (use {@link tryCanvas2D}). */
  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (ctx === null) {
      throw new Error('Canvas2DRenderer: failed to acquire a 2D context');
    }
    this.ctx = ctx;
  }

  resize(deviceWidth: number, deviceHeight: number): void {
    // Setting width/height resizes the backing store and clears it.
    this.canvas.width = deviceWidth;
    this.canvas.height = deviceHeight;
  }

  beginFrame(clearColor: string | null): void {
    const { ctx, canvas } = this;
    // Clear first so a translucent background doesn't accumulate.
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (clearColor !== null) {
      ctx.fillStyle = clearColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }

  fillRect(
    x: number,
    y: number,
    width: number,
    height: number,
    color: string,
  ): void {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x, y, width, height);
  }

  drawRects(batch: RectBatch): void {
    if (batch.count === 0) return;
    const { ctx } = this;
    const c = batch.coords;
    ctx.fillStyle = batch.color;
    ctx.beginPath();
    for (let i = 0; i < batch.count * 4; i += 4) {
      ctx.rect(
        c[i] as number,
        c[i + 1] as number,
        c[i + 2] as number,
        c[i + 3] as number,
      );
    }
    ctx.fill();
  }

  drawLines(batch: LineBatch): void {
    if (batch.count === 0) return;
    const { ctx } = this;
    const c = batch.coords;
    const joins = batch.joins;
    ctx.strokeStyle = batch.color;
    ctx.lineWidth = batch.width;
    const dashed = batch.dash !== undefined && batch.dash.length > 0;
    if (dashed) ctx.setLineDash(batch.dash as number[]);
    ctx.beginPath();
    for (let s = 0; s < batch.count; s++) {
      const i = s * 4;
      // A joined segment continues the previous one: one subpath, so the
      // stroke gets a proper join instead of two butt caps (no notches).
      if (joins === undefined || joins[s] !== 1) {
        ctx.moveTo(c[i] as number, c[i + 1] as number);
      }
      ctx.lineTo(c[i + 2] as number, c[i + 3] as number);
    }
    ctx.stroke();
    // Reset so a dashed batch never bleeds into the next solid one (§4).
    if (dashed) ctx.setLineDash([]);
  }

  drawText(batch: TextBatch): void {
    if (batch.count === 0) return;
    const { ctx } = this;
    ctx.fillStyle = batch.color;
    ctx.font = batch.font;
    ctx.textBaseline = batch.baseline;
    ctx.textAlign = batch.align;
    for (let i = 0; i < batch.count; i++) {
      ctx.fillText(
        batch.texts[i] as string,
        batch.xs[i] as number,
        batch.ys[i] as number,
      );
    }
  }

  measureText(text: string, font: string): TextMetricsLite {
    this.ctx.font = font;
    return { width: this.ctx.measureText(text).width };
  }

  drawArrowheads(batch: ArrowheadBatch): void {
    if (batch.count === 0) return;
    const { ctx } = this;
    const c = batch.coords;
    ctx.fillStyle = batch.color;
    // One path for the batch; triangle vertices come from the geometry shared
    // with the WebGL backend so the two cannot drift (§4). No closePath: fill()
    // closes each subpath itself, and closePath per triangle is very costly.
    ctx.beginPath();
    for (let i = 0; i < batch.count * 3; i += 3) {
      const v = arrowheadTriangle(
        c[i] as number,
        c[i + 1] as number,
        c[i + 2] as number,
        batch.size,
      );
      ctx.moveTo(v.tipX, v.tipY);
      ctx.lineTo(v.baseAX, v.baseAY);
      ctx.lineTo(v.baseBX, v.baseBY);
    }
    ctx.fill();
  }

  drawNodes(batch: NodeBatch): void {
    if (batch.count === 0) return;
    const { ctx } = this;
    const c = batch.coords;
    const r = batch.radius;
    ctx.fillStyle = batch.color;
    ctx.beginPath();
    for (let i = 0; i < batch.count * 2; i += 2) {
      const x = c[i] as number;
      const y = c[i + 1] as number;
      // moveTo before each arc so circles are not joined by a connecting line.
      ctx.moveTo(x + r, y);
      ctx.arc(x, y, r, 0, Math.PI * 2);
    }
    ctx.fill();
  }

  drawImages(batch: ImageBatch): void {
    const { ctx } = this;
    let failed = false;
    let failure: unknown;
    for (const { x, y, size, image } of batch.items) {
      try {
        // The seam carries an opaque RendererImage; Canvas2D narrows it to a
        // CanvasImageSource (§4). Only this backend knows the concrete type.
        ctx.drawImage(image as CanvasImageSource, x, y, size, size);
      } catch (error) {
        // A broken image throws on draw: skip it, draw the rest, then report
        // the first failure (the guarded seam turns it into a diagnostic).
        if (!failed) {
          failed = true;
          failure = error;
        }
      }
    }
    if (failed) throw failure;
  }

  endFrame(): void {
    /* Canvas2D is immediate-mode; nothing to flush. */
  }
}

/** A Canvas2D renderer for `canvas`, or null when no 2D context exists (jsdom). */
export function tryCanvas2D(
  canvas: HTMLCanvasElement,
): Canvas2DRenderer | null {
  try {
    return new Canvas2DRenderer(canvas);
  } catch {
    return null;
  }
}
