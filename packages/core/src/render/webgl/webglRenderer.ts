// WebGL2 implementation of the Renderer seam (DESIGN.md §4).
//
// Verbs record into a FrameEncoder: geometry batches become instance records
// copied straight from the frame's typed arrays, and text and icons become
// textured rects into paged atlases. `endFrame` uploads the chunk once and
// replays it. If an atlas page used earlier in the frame must be reused, the
// draws recorded so far are flushed first, so they keep their texels.
//
// Look parity with Canvas2D: the arrowhead geometry is shared, dashes follow
// Canvas2D's phase rules (CPU expansion), polylines get joins, text is
// rasterized by Canvas2D, and blending is premultiplied source-over.

import type { OnDiagnostic } from '../../model/diagnostics';
import type {
  ArrowheadBatch,
  ImageBatch,
  LineBatch,
  NodeBatch,
  RectBatch,
  Renderer,
  TextBatch,
  TextMetricsLite,
} from '../types';
import { PagedAtlas } from './atlas';
import { ColorCache, TRANSPARENT, type PremultipliedRgba } from './color';
import { FrameEncoder, type TextureRef } from './encoder';
import {
  colorParsingContext,
  IconRasterizer,
  TextRasterizer,
} from './rasterizers';
import { GlResources } from './resources';

/** Atlas page edge in texels (capped by the context's MAX_TEXTURE_SIZE). */
const PAGE_SIZE = 1024;
const TEXT_PAGES = 4;
const ICON_PAGES = 2;

interface Glyph {
  offsetX: number;
  offsetY: number;
  advance: number;
}

export interface WebGLRendererHooks {
  /** The context came back after a loss; the host should redraw. */
  onContextRestored?: () => void;
  /** The context was lost; the host may fall back if it doesn't return. */
  onContextLost?: () => void;
  onDiagnostic?: OnDiagnostic;
  /** Rasterizers, injectable for tests. */
  text?: Pick<TextRasterizer, 'measure' | 'rasterize'>;
  icons?: Pick<IconRasterizer, 'rasterize'>;
}

export class WebGLRenderer implements Renderer {
  readonly backend = 'webgl' as const;
  private readonly resources: GlResources;
  private readonly encoder = new FrameEncoder();
  private readonly colors = new ColorCache(colorParsingContext());
  private readonly text: Pick<TextRasterizer, 'measure' | 'rasterize'>;
  private readonly icons: Pick<IconRasterizer, 'rasterize'>;
  private readonly textAtlas: PagedAtlas<Glyph>;
  private readonly iconAtlas: PagedAtlas<null>;
  private readonly imageIds = new WeakMap<object, number>();
  private nextImageId = 1;
  private clearColor: PremultipliedRgba | null = null;
  private lost = false;
  private readonly textRefs: TextureRef[] = [];
  private readonly iconRefs: TextureRef[] = [];

  constructor(
    private readonly canvas: HTMLCanvasElement,
    readonly gl: WebGL2RenderingContext,
    private readonly hooks: WebGLRendererHooks = {},
  ) {
    const pageSize = Math.min(
      PAGE_SIZE,
      gl.getParameter(gl.MAX_TEXTURE_SIZE) as number,
    );
    this.text = hooks.text ?? new TextRasterizer();
    this.icons = hooks.icons ?? new IconRasterizer();
    this.resources = new GlResources(gl, pageSize);
    this.textAtlas = new PagedAtlas(pageSize, TEXT_PAGES);
    this.iconAtlas = new PagedAtlas(pageSize, ICON_PAGES);
    canvas.addEventListener('webglcontextlost', this.handleLost);
    canvas.addEventListener('webglcontextrestored', this.handleRestored);
  }

  private readonly handleLost = (event: Event): void => {
    // preventDefault opts in to the restorable-context path.
    event.preventDefault();
    this.lost = true;
    this.hooks.onContextLost?.();
  };

  private readonly handleRestored = (): void => {
    this.textAtlas.clear();
    this.iconAtlas.clear();
    this.resources.init();
    this.lost = false;
    this.hooks.onContextRestored?.();
  };

  resize(deviceWidth: number, deviceHeight: number): void {
    this.canvas.width = deviceWidth;
    this.canvas.height = deviceHeight;
    this.resources.resize(deviceWidth, deviceHeight);
  }

  beginFrame(clearColor: string | null): void {
    this.encoder.reset();
    this.clearColor =
      clearColor === null ? TRANSPARENT : this.colors.get(clearColor);
    this.textAtlas.beginFrame();
    this.iconAtlas.beginFrame();
  }

  fillRect(
    x: number,
    y: number,
    width: number,
    height: number,
    color: string,
  ): void {
    this.encoder.rect(x, y, width, height, this.colors.get(color));
  }

  drawRects(batch: RectBatch): void {
    this.encoder.rects(batch, this.colors.get(batch.color));
  }

  drawLines(batch: LineBatch): void {
    this.encoder.lines(batch, this.colors.get(batch.color));
  }

  drawArrowheads(batch: ArrowheadBatch): void {
    this.encoder.heads(batch, this.colors.get(batch.color));
  }

  drawNodes(batch: NodeBatch): void {
    this.encoder.nodes(batch, this.colors.get(batch.color));
  }

  drawText(batch: TextBatch): void {
    if (this.lost) return;
    const size = this.resources.pageSize;
    for (let i = 0; i < batch.count; i++) {
      const text = batch.texts[i] as string;
      const glyph = this.glyph(text, batch.font, batch.color, batch.baseline);
      if (glyph === null) continue;
      const { offsetX, offsetY, advance } = glyph.value;
      const shift =
        batch.align === 'center'
          ? -advance / 2
          : batch.align === 'right'
            ? -advance
            : 0;
      // Integer-snap the quad so nearest sampling stays 1:1 with the
      // rasterized device pixels.
      const x = Math.round((batch.xs[i] as number) + shift + offsetX);
      const y = Math.round((batch.ys[i] as number) + offsetY);
      this.encoder.textured(
        this.ref(this.textRefs, 'text', glyph.page),
        x,
        y,
        glyph.width,
        glyph.height,
        glyph.x / size,
        glyph.y / size,
        (glyph.x + glyph.width) / size,
        (glyph.y + glyph.height) / size,
      );
    }
  }

  drawImages(batch: ImageBatch): void {
    if (this.lost) return;
    const size = this.resources.pageSize;
    let failed = false;
    let failure: unknown;
    for (const { x, y, size: side, image } of batch.items) {
      let slot;
      try {
        slot = this.icon(image, side);
      } catch (error) {
        if (!failed) {
          failed = true;
          failure = error;
        }
        continue;
      }
      if (slot === null) continue;
      this.encoder.textured(
        this.ref(this.iconRefs, 'icon', slot.page),
        x,
        y,
        side,
        side,
        slot.x / size,
        slot.y / size,
        (slot.x + side) / size,
        (slot.y + side) / size,
      );
    }
    // Report the first failure (the guarded seam turns it into a diagnostic).
    if (failed) throw failure;
  }

  measureText(text: string, font: string): TextMetricsLite {
    return { width: this.text.measure(text, font) };
  }

  endFrame(): void {
    this.flush();
  }

  dispose(): void {
    this.canvas.removeEventListener('webglcontextlost', this.handleLost);
    this.canvas.removeEventListener(
      'webglcontextrestored',
      this.handleRestored,
    );
    if (!this.lost) this.resources.dispose();
    // The engine discards this canvas: release the context slot now rather
    // than at garbage collection, since browsers cap live contexts per page.
    this.gl.getExtension('WEBGL_lose_context')?.loseContext();
  }

  /** Replay what was recorded so far; only the frame's first chunk clears. */
  private flush(): void {
    if (!this.lost) this.resources.execute(this.encoder, this.clearColor);
    this.clearColor = null;
    this.encoder.reset();
  }

  /** A text entry, rasterized and uploaded on first use. */
  private glyph(
    text: string,
    font: string,
    color: string,
    baseline: TextBatch['baseline'],
  ) {
    const key = `${font}\u0000${baseline}\u0000${color}\u0000${text}`;
    const cached = this.textAtlas.get(key);
    if (cached !== undefined) return cached;
    if (this.textAtlas.hasFailed(key)) return null;
    const raster = this.text.rasterize(text, font, color, baseline);
    if (raster === null) {
      this.textAtlas.markFailed(key);
      return null;
    }
    const slot = this.textAtlas.allocate(
      key,
      raster.width,
      raster.height,
      {
        offsetX: raster.offsetX,
        offsetY: raster.offsetY,
        advance: raster.advance,
      },
      (_page, usedThisFrame) => {
        if (usedThisFrame) this.flush();
      },
    );
    if (slot === null) {
      this.textAtlas.markFailed(key);
      this.hooks.onDiagnostic?.({
        code: 'render-error',
        kind: 'renderer',
        reason: `label "${text.slice(0, 40)}" is too large for the WebGL text atlas`,
      });
      return null;
    }
    this.resources.upload(
      { atlas: 'text', page: slot.page },
      slot.x,
      slot.y,
      raster.pixels,
    );
    return slot;
  }

  /** An icon entry at `side` device px, rasterized and uploaded on first use. */
  private icon(image: unknown, side: number) {
    if (typeof image !== 'object' || image === null) return null;
    let id = this.imageIds.get(image);
    if (id === undefined) {
      id = this.nextImageId++;
      this.imageIds.set(image, id);
    }
    const key = `${id}\u0000${side}`;
    const cached = this.iconAtlas.get(key);
    if (cached !== undefined) return cached;
    if (this.iconAtlas.hasFailed(key)) return null;
    let pixels: ImageData | null;
    try {
      pixels = this.icons.rasterize(image as CanvasImageSource, side);
    } catch (error) {
      // A cross-origin image without CORS: skip it from now on, report once.
      this.iconAtlas.markFailed(key);
      throw error;
    }
    if (pixels === null) return null;
    const slot = this.iconAtlas.allocate(key, side, side, null, (_p, used) => {
      if (used) this.flush();
    });
    if (slot === null) {
      this.iconAtlas.markFailed(key);
      return null;
    }
    this.resources.upload(
      { atlas: 'icon', page: slot.page },
      slot.x,
      slot.y,
      pixels,
    );
    return slot;
  }

  /** A stable TextureRef per (atlas, page), so commands can merge. */
  private ref(
    refs: TextureRef[],
    atlas: TextureRef['atlas'],
    page: number,
  ): TextureRef {
    let ref = refs[page];
    if (ref === undefined) {
      ref = { atlas, page };
      refs[page] = ref;
    }
    return ref;
  }
}
