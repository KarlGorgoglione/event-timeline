// Canvas2D implementation of the Renderer seam (DESIGN.md §3 DPR, §4).
//
// This is the only file in the engine allowed to touch a 2D context, and it is
// not re-exported as a type, so the engine never imports CanvasRenderingContext2D.
//
// DPR convention (§3): resize sets the backing store to device pixels and does
// NOT call ctx.scale; all incoming batch coordinates are already in device
// pixels. Drawing batches by style minimises context state changes (§4).

import { arrowheadTriangle } from './arrowGeometry';
import type {
  ArrowheadBatch,
  ImageBatch,
  Layer,
  LineBatch,
  NodeBatch,
  Renderer,
  TextBatch,
  TextMetricsLite,
} from './types';

export class Canvas2DRenderer implements Renderer {
  readonly backend = 'canvas2d' as const;
  private readonly baseCtx: CanvasRenderingContext2D;
  private readonly overlayCtx: CanvasRenderingContext2D;
  private current: CanvasRenderingContext2D;

  constructor(
    private readonly baseCanvas: HTMLCanvasElement,
    private readonly overlayCanvas: HTMLCanvasElement,
    private readonly background: string,
  ) {
    this.baseCtx = getContext(baseCanvas);
    this.overlayCtx = getContext(overlayCanvas);
    this.current = this.baseCtx;
  }

  resize(deviceWidth: number, deviceHeight: number): void {
    // Setting width/height resizes the backing store and clears it.
    this.baseCanvas.width = deviceWidth;
    this.baseCanvas.height = deviceHeight;
    this.overlayCanvas.width = deviceWidth;
    this.overlayCanvas.height = deviceHeight;
  }

  beginFrame(layer: Layer): void {
    if (layer === 'base') {
      this.current = this.baseCtx;
      this.baseCtx.fillStyle = this.background;
      this.baseCtx.fillRect(
        0,
        0,
        this.baseCanvas.width,
        this.baseCanvas.height,
      );
    } else {
      this.current = this.overlayCtx;
      this.overlayCtx.clearRect(
        0,
        0,
        this.overlayCanvas.width,
        this.overlayCanvas.height,
      );
    }
  }

  fillRect(
    x: number,
    y: number,
    width: number,
    height: number,
    color: string,
  ): void {
    const ctx = this.current;
    ctx.fillStyle = color;
    ctx.fillRect(x, y, width, height);
  }

  drawLines(batch: LineBatch): void {
    if (batch.segments.length === 0) return;
    const ctx = this.current;
    ctx.strokeStyle = batch.color;
    ctx.lineWidth = batch.width;
    const dash = batch.dash;
    const dashed = dash !== undefined && dash.length > 0;
    if (dashed) ctx.setLineDash(dash);
    ctx.beginPath();
    for (const s of batch.segments) {
      ctx.moveTo(s.x1, s.y1);
      ctx.lineTo(s.x2, s.y2);
    }
    ctx.stroke();
    // Reset so a dashed batch never bleeds into the next solid one (§4).
    if (dashed) ctx.setLineDash([]);
  }

  drawText(batch: TextBatch): void {
    if (batch.items.length === 0) return;
    const ctx = this.current;
    ctx.fillStyle = batch.color;
    ctx.font = batch.font;
    ctx.textBaseline = batch.baseline;
    ctx.textAlign = batch.align;
    for (const item of batch.items) {
      ctx.fillText(item.text, item.x, item.y);
    }
  }

  measureText(text: string, font: string): TextMetricsLite {
    this.baseCtx.font = font;
    return { width: this.baseCtx.measureText(text).width };
  }

  drawArrowheads(batch: ArrowheadBatch): void {
    if (batch.items.length === 0) return;
    const ctx = this.current;
    const { size } = batch;
    ctx.fillStyle = batch.color;
    // One path for the whole batch; triangle vertices come from the shared
    // backend geometry so Canvas2D and WebGL cannot drift (§4).
    ctx.beginPath();
    for (const { x, y, angle } of batch.items) {
      const v = arrowheadTriangle(x, y, angle, size);
      ctx.moveTo(v.tipX, v.tipY);
      ctx.lineTo(v.baseAX, v.baseAY);
      ctx.lineTo(v.baseBX, v.baseBY);
      ctx.closePath();
    }
    ctx.fill();
  }

  drawNodes(batch: NodeBatch): void {
    if (batch.items.length === 0) return;
    const ctx = this.current;
    ctx.fillStyle = batch.color;
    ctx.beginPath();
    for (const { x, y } of batch.items) {
      // moveTo before each arc so circles are not joined by a connecting line.
      ctx.moveTo(x + batch.radius, y);
      ctx.arc(x, y, batch.radius, 0, Math.PI * 2);
    }
    ctx.fill();
  }

  drawImages(batch: ImageBatch): void {
    const ctx = this.current;
    for (const { x, y, size, image } of batch.items) {
      try {
        // The seam carries an opaque RendererImage; Canvas2D narrows it to a
        // CanvasImageSource (§4). Only this backend knows the concrete type.
        ctx.drawImage(image as CanvasImageSource, x, y, size, size);
      } catch {
        // An image that failed to decode throws on draw; skip it this frame.
      }
    }
  }

  endFrame(_layer: Layer): void {
    /* Canvas2D is immediate-mode; nothing to flush. */
  }
}

function getContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d');
  if (ctx === null) {
    throw new Error('Canvas2DRenderer: failed to acquire a 2D context');
  }
  return ctx;
}
