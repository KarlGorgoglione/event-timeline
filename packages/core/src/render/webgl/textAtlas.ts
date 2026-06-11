// Per-context text atlas for the WebGL backend (§4, §16).
//
// Rasterized labels are shelf-packed into one RGBA texture per GL context (GL
// objects don't cross contexts; the CPU-side rasterizer is shared). The entry
// key includes the colour because emoji glyphs ignore fillStyle — entries are
// rasterized in their final colour and sampled unmodified, which is what keeps
// colour-emoji element icons identical to Canvas2D. Theme colours are static
// per engine instance, so the colour-in-key duplication is bounded.
//
// Capacity policy mirrors the engine's measureCache: grow ×2 up to a cap,
// then reset wholesale and let entries re-rasterize lazily. The caller must
// flush any pending quads before `recover()` — a grow/reset moves every
// existing entry, invalidating previously computed UVs.

import { ShelfPacker } from './shelfPack';
import type { TextBaselineLite, TextRasterizer } from './textRaster';

export interface AtlasEntry {
  /** Pixel rect inside the atlas texture. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Offset from the drawText anchor to the rect's top-left, device px. */
  offsetX: number;
  offsetY: number;
  /** Text advance for align placement. */
  advance: number;
}

const INITIAL_SIZE = 512;
const MAX_SIZE = 2048;
/** 1px guard band against sampling bleed between entries. */
const PADDING = 1;

export class TextAtlas {
  private texture: WebGLTexture | null = null;
  private packer: ShelfPacker;
  private entries = new Map<string, AtlasEntry | null>();
  private size: number;
  private readonly maxSize: number;

  constructor(
    private readonly gl: WebGL2RenderingContext,
    private readonly raster: TextRasterizer,
  ) {
    this.size = INITIAL_SIZE;
    this.maxSize = Math.min(
      MAX_SIZE,
      gl.getParameter(gl.MAX_TEXTURE_SIZE) as number,
    );
    this.packer = new ShelfPacker(this.size, this.size);
  }

  /** Bind the atlas texture (creating it on first use). */
  bind(unit: number): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, this.ensureTexture());
  }

  get textureSize(): number {
    return this.size;
  }

  /**
   * Look up or rasterize+upload one label. `null` means the label can't be
   * drawn (cached, skip it); `'full'` means no space — flush pending quads,
   * call `recover()`, and retry once.
   */
  getEntry(
    text: string,
    font: string,
    color: string,
    baseline: TextBaselineLite,
  ): AtlasEntry | 'full' | null {
    const key = `${font}\u0000${baseline}\u0000${color}\u0000${text}`;
    const cached = this.entries.get(key);
    if (cached !== undefined) return cached;

    const raster = this.raster.rasterize(text, font, color, baseline);
    if (raster === null) {
      this.entries.set(key, null); // unrasterizable: don't retry every frame
      return null;
    }
    const slot = this.packer.allocate(
      raster.width + PADDING,
      raster.height + PADDING,
    );
    if (slot === null) return 'full';

    const pixels = this.raster.readPixels(raster.width, raster.height);
    if (pixels === null) return null;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.ensureTexture());
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      slot.x,
      slot.y,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      pixels,
    );

    const entry: AtlasEntry = {
      x: slot.x,
      y: slot.y,
      width: raster.width,
      height: raster.height,
      offsetX: raster.offsetX,
      offsetY: raster.offsetY,
      advance: raster.advance,
    };
    this.entries.set(key, entry);
    return entry;
  }

  /**
   * Make room after a failed allocation: grow ×2 up to the cap, else reset.
   * Either way every existing entry is dropped (and re-rasterizes lazily), so
   * the caller must have flushed quads that reference the old layout.
   */
  recover(): void {
    if (this.size < this.maxSize) this.size *= 2;
    this.packer = new ShelfPacker(this.size, this.size);
    this.entries.clear();
    if (this.texture !== null) this.gl.deleteTexture(this.texture);
    this.texture = null;
  }

  /** Forget GL objects after a context restore (they died with the context). */
  invalidate(): void {
    this.texture = null;
    this.packer.reset();
    this.entries.clear();
  }

  dispose(): void {
    if (this.texture !== null) this.gl.deleteTexture(this.texture);
    this.texture = null;
    this.entries.clear();
  }

  private ensureTexture(): WebGLTexture {
    if (this.texture !== null) return this.texture;
    const gl = this.gl;
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      this.size,
      this.size,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null,
    );
    // NEAREST: glyphs draw 1:1 at device resolution; nearest sampling avoids
    // half-texel fuzz and inter-entry bleed entirely.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.texture = texture;
    return texture;
  }
}
