// WebGL2 implementation of the Renderer seam (DESIGN.md §4, §16).
//
// Substitutable for Canvas2DRenderer without engine changes (LSP): the same
// device-px batches arrive, each batch becomes one order-preserving draw call
// (painter's algorithm, the same granularity Canvas2D uses), and look parity
// comes from sharing the parity-critical pieces — arrowhead geometry, CPU
// dash expansion matching subpath phase, Canvas2D-rasterized text, and
// premultiplied source-over blending.
//
// Two GL contexts (one per canvas layer) hold the GPU resources; the CPU-side
// rasterizer, colour cache, and vertex scratch are shared. The scratch grows
// geometrically and is reused — the hot path allocates nothing (§4).

import type {
  ArrowheadBatch,
  ImageBatch,
  Layer,
  LineBatch,
  NodeBatch,
  Renderer,
  TextBatch,
  TextMetricsLite,
} from '../types';
import { ColorCache, TRANSPARENT, type PremultipliedRgba } from './color';
import { expandDashes } from './dash';
import {
  pushArrowhead,
  pushLineQuad,
  pushNodeQuad,
  pushRect,
  pushTexturedQuad,
  VertexArray,
} from './geometry';
import { ATLAS_TEXTURE, GlLayer } from './layer';
import { MODE_CIRCLE, MODE_SOLID, MODE_TEXTURED } from './shaders';
import { TextRasterizer } from './textRaster';

const WHITE: PremultipliedRgba = [1, 1, 1, 1];

export class WebGLRenderer implements Renderer {
  readonly backend = 'webgl' as const;
  private readonly raster = new TextRasterizer();
  private readonly colors = new ColorCache(() => this.raster.context());
  private readonly scratch = new VertexArray();
  private readonly layers: Record<Layer, GlLayer>;
  private current: GlLayer;

  constructor(
    baseCanvas: HTMLCanvasElement,
    baseGl: WebGL2RenderingContext,
    overlayCanvas: HTMLCanvasElement,
    overlayGl: WebGL2RenderingContext,
    private readonly background: string,
    onContextRestored?: () => void,
  ) {
    const restored = (): void => onContextRestored?.();
    this.layers = {
      base: new GlLayer(baseCanvas, baseGl, this.raster, restored),
      overlay: new GlLayer(overlayCanvas, overlayGl, this.raster, restored),
    };
    this.current = this.layers.base;
  }

  resize(deviceWidth: number, deviceHeight: number): void {
    this.layers.base.resize(deviceWidth, deviceHeight);
    this.layers.overlay.resize(deviceWidth, deviceHeight);
  }

  beginFrame(layer: Layer): void {
    this.current = this.layers[layer];
    // Base clears to the theme background (like Canvas2D's fillRect), the
    // overlay to transparent (like clearRect).
    this.current.clear(
      layer === 'base' ? this.colors.get(this.background) : TRANSPARENT,
    );
  }

  fillRect(
    x: number,
    y: number,
    width: number,
    height: number,
    color: string,
  ): void {
    this.scratch.reset();
    pushRect(this.scratch, x, y, width, height);
    this.current.draw(this.scratch, MODE_SOLID, this.colors.get(color));
  }

  drawLines(batch: LineBatch): void {
    if (batch.segments.length === 0) return;
    const dashed = batch.dash !== undefined && batch.dash.length > 0;
    const segments = dashed
      ? expandDashes(batch.segments, batch.dash as number[])
      : batch.segments;
    this.scratch.reset();
    for (const s of segments) {
      pushLineQuad(this.scratch, s.x1, s.y1, s.x2, s.y2, batch.width);
    }
    this.current.draw(this.scratch, MODE_SOLID, this.colors.get(batch.color));
  }

  drawArrowheads(batch: ArrowheadBatch): void {
    if (batch.items.length === 0) return;
    this.scratch.reset();
    for (const { x, y, angle } of batch.items) {
      pushArrowhead(this.scratch, x, y, angle, batch.size);
    }
    this.current.draw(this.scratch, MODE_SOLID, this.colors.get(batch.color));
  }

  drawNodes(batch: NodeBatch): void {
    if (batch.items.length === 0) return;
    this.scratch.reset();
    for (const { x, y } of batch.items) {
      pushNodeQuad(this.scratch, x, y, batch.radius);
    }
    this.current.draw(
      this.scratch,
      MODE_CIRCLE,
      this.colors.get(batch.color),
      batch.radius,
    );
  }

  drawText(batch: TextBatch): void {
    if (batch.items.length === 0) return;
    const layer = this.current;
    if (!layer.isDrawable) return;
    const atlas = layer.getAtlas();
    this.scratch.reset();
    const flush = (): void => {
      layer.draw(this.scratch, MODE_TEXTURED, WHITE, 0, ATLAS_TEXTURE);
      this.scratch.reset();
    };

    for (const item of batch.items) {
      let entry = atlas.getEntry(
        item.text,
        batch.font,
        batch.color,
        batch.baseline,
      );
      if (entry === 'full') {
        // Grow/reset moves every entry: draw the quads computed so far first.
        flush();
        atlas.recover();
        const retried = atlas.getEntry(
          item.text,
          batch.font,
          batch.color,
          batch.baseline,
        );
        entry = retried === 'full' ? null : retried;
      }
      if (entry === null) continue;

      const alignShift =
        batch.align === 'center'
          ? -entry.advance / 2
          : batch.align === 'right'
            ? -entry.advance
            : 0;
      // Integer-snap the quad so NEAREST sampling stays 1:1 with the
      // rasterized device pixels (crisp text, §3).
      const x = Math.round(item.x + alignShift + entry.offsetX);
      const y = Math.round(item.y + entry.offsetY);
      const size = atlas.textureSize;
      pushTexturedQuad(
        this.scratch,
        x,
        y,
        entry.width,
        entry.height,
        entry.x / size,
        entry.y / size,
        (entry.x + entry.width) / size,
        (entry.y + entry.height) / size,
      );
    }
    flush();
  }

  drawImages(batch: ImageBatch): void {
    for (const { x, y, size, image } of batch.items) {
      const texture = this.current.imageTexture(image);
      if (texture === null) continue;
      this.scratch.reset();
      pushTexturedQuad(this.scratch, x, y, size, size, 0, 0, 1, 1);
      this.current.draw(this.scratch, MODE_TEXTURED, WHITE, 0, texture);
    }
  }

  measureText(text: string, font: string): TextMetricsLite {
    return { width: this.raster.measure(text, font) };
  }

  endFrame(_layer: Layer): void {
    /* Draw calls are issued immediately; the browser flushes at rAF end. */
  }

  dispose(): void {
    this.layers.base.dispose();
    this.layers.overlay.dispose();
  }
}
