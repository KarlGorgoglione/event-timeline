// Canvas2D implementation of the Renderer seam (DESIGN.md §3 DPR, §4).
//
// This is the only file in the engine allowed to touch a 2D context, and it is
// not re-exported as a type, so the engine never imports CanvasRenderingContext2D.
//
// DPR convention (§3): resize sets the backing store to device pixels and does
// NOT call ctx.scale; all incoming batch coordinates are already in device
// pixels. Drawing batches by style minimises context state changes (§4).

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
  private readonly baseCtx: CanvasRenderingContext2D;
  private readonly overlayCtx: CanvasRenderingContext2D;
  private current: CanvasRenderingContext2D;

  constructor(
    private readonly baseCanvas: HTMLCanvasElement,
    private readonly overlayCanvas: HTMLCanvasElement,
    private background: string,
  ) {
    this.baseCtx = getContext(baseCanvas);
    this.overlayCtx = getContext(overlayCanvas);
    this.current = this.baseCtx;
  }

  setBackground(background: string): void {
    this.background = background;
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

  drawLines(batch: LineBatch): void {
    if (batch.segments.length === 0) return;
    const ctx = this.current;
    ctx.strokeStyle = batch.color;
    ctx.lineWidth = batch.width;
    ctx.beginPath();
    for (const s of batch.segments) {
      ctx.moveTo(s.x1, s.y1);
      ctx.lineTo(s.x2, s.y2);
    }
    ctx.stroke();
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

  // --- Phase 2 verbs: typed by the seam, implemented later. ---
  drawArrowheads(_batch: ArrowheadBatch): void {
    /* Phase 2 */
  }
  drawNodes(_batch: NodeBatch): void {
    /* Phase 2 */
  }
  drawImages(_batch: ImageBatch): void {
    /* Phase 2 */
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
