// Per-canvas GL state for the WebGL backend (§4, §16).
//
// Each canvas layer ('base'/'overlay') owns its own WebGL2 context — GL
// objects don't cross contexts — so program, VAO, vertex buffer, text atlas,
// and image textures live here, while CPU-side work (rasterizer, colour
// cache, vertex scratch) is shared by the renderer. Context loss is handled
// per layer: verbs no-op while lost, and restore rebuilds the GL objects and
// invalidates the texture caches.

import { TextAtlas } from './textAtlas';
import type { TextRasterizer } from './textRaster';
import { compileProgram, MODE_TEXTURED, type ProgramInfo } from './shaders';
import { FLOATS_PER_VERTEX, type VertexArray } from './geometry';
import type { PremultipliedRgba } from './color';

/**
 * Shared context attributes (§4 compositing parity with Canvas2D):
 * - alpha: the theme background may be semi-transparent, and the overlay
 *   composites over the base exactly like a cleared 2D canvas;
 * - premultipliedAlpha + (ONE, ONE_MINUS_SRC_ALPHA) blending: all colours and
 *   texture uploads are premultiplied;
 * - preserveDrawingBuffer false is safe: each layer is fully redrawn within a
 *   single rAF callback (the engine's drawFrame);
 * - no depth/stencil: painter's-algorithm 2D.
 *
 * `failIfMajorPerformanceCaveat` is decided by the factory per preference.
 */
export const GL_CONTEXT_ATTRIBUTES: WebGLContextAttributes = {
  alpha: true,
  antialias: true,
  premultipliedAlpha: true,
  preserveDrawingBuffer: false,
  depth: false,
  stencil: false,
};

/** Marker for `draw` to bind this layer's text atlas as the texture. */
export const ATLAS_TEXTURE = 'atlas';

export class GlLayer {
  lost = false;
  private program!: ProgramInfo;
  private vao: WebGLVertexArrayObject | null = null;
  private buffer: WebGLBuffer | null = null;
  private atlas: TextAtlas | null = null;
  private imageTextures = new WeakMap<object, WebGLTexture | null>();
  /** Iterable shadow of imageTextures' values, for dispose/restore cleanup. */
  private createdTextures = new Set<WebGLTexture>();
  private deviceWidth = 0;
  private deviceHeight = 0;

  private readonly handleLost = (event: Event): void => {
    // preventDefault opts in to the restorable-context path.
    event.preventDefault();
    this.lost = true;
  };

  private readonly handleRestored = (): void => {
    this.atlas?.invalidate();
    this.imageTextures = new WeakMap();
    this.createdTextures.clear(); // the old textures died with the context
    this.init();
    // State reset with the context; re-apply the stored size.
    this.resize(this.deviceWidth, this.deviceHeight);
    this.lost = false;
    this.onRestored();
  };

  constructor(
    private readonly canvas: HTMLCanvasElement,
    readonly gl: WebGL2RenderingContext,
    private readonly raster: TextRasterizer,
    private readonly onRestored: () => void,
  ) {
    canvas.addEventListener('webglcontextlost', this.handleLost);
    canvas.addEventListener('webglcontextrestored', this.handleRestored);
    this.init();
  }

  private init(): void {
    const gl = this.gl;
    this.program = compileProgram(gl);
    this.vao = gl.createVertexArray();
    this.buffer = gl.createBuffer();
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    const stride = FLOATS_PER_VERTEX * 4;
    gl.enableVertexAttribArray(this.program.attribs.pos);
    gl.vertexAttribPointer(
      this.program.attribs.pos,
      2,
      gl.FLOAT,
      false,
      stride,
      0,
    );
    gl.enableVertexAttribArray(this.program.attribs.uv);
    gl.vertexAttribPointer(
      this.program.attribs.uv,
      2,
      gl.FLOAT,
      false,
      stride,
      8,
    );
    gl.useProgram(this.program.program);
    gl.uniform1i(this.program.uniforms.tex, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    // Every upload (atlas ImageData, icon images) wants premultiplied alpha.
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  }

  get isDrawable(): boolean {
    return !this.lost && this.deviceWidth > 0 && this.deviceHeight > 0;
  }

  resize(deviceWidth: number, deviceHeight: number): void {
    this.deviceWidth = deviceWidth;
    this.deviceHeight = deviceHeight;
    this.canvas.width = deviceWidth;
    this.canvas.height = deviceHeight;
    if (deviceWidth > 0 && deviceHeight > 0) {
      this.gl.viewport(0, 0, deviceWidth, deviceHeight);
    }
  }

  clear(color: PremultipliedRgba): void {
    if (!this.isDrawable) return;
    const gl = this.gl;
    gl.clearColor(color[0], color[1], color[2], color[3]);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  /** One style-uniform batch → one draw call (§4 batching granularity). */
  draw(
    vertices: VertexArray,
    mode: number,
    color: PremultipliedRgba,
    radius = 0,
    texture?: WebGLTexture | typeof ATLAS_TEXTURE,
  ): void {
    if (!this.isDrawable || vertices.vertexCount === 0) return;
    const gl = this.gl;
    gl.useProgram(this.program.program);
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    // Full re-specification each draw → driver-side orphaning, no sync stall.
    gl.bufferData(gl.ARRAY_BUFFER, vertices.view(), gl.DYNAMIC_DRAW);
    gl.uniform2f(
      this.program.uniforms.resolution,
      this.deviceWidth,
      this.deviceHeight,
    );
    gl.uniform1i(this.program.uniforms.mode, mode);
    gl.uniform4f(
      this.program.uniforms.color,
      color[0],
      color[1],
      color[2],
      color[3],
    );
    gl.uniform1f(this.program.uniforms.radius, radius);
    if (mode === MODE_TEXTURED) {
      if (texture === ATLAS_TEXTURE) {
        this.getAtlas().bind(0);
      } else if (texture !== undefined) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
      }
    }
    gl.drawArrays(gl.TRIANGLES, 0, vertices.vertexCount);
  }

  getAtlas(): TextAtlas {
    this.atlas ??= new TextAtlas(this.gl, this.raster);
    return this.atlas;
  }

  /**
   * Texture for an opaque RendererImage handle (§4): the WebGL backend
   * narrows it to HTMLImageElement (what the icon cache supplies) and uploads
   * it once. Undecoded/broken images cache as null and simply skip — the
   * engine's icon cache re-marks the frame dirty when decoding finishes.
   */
  imageTexture(image: unknown): WebGLTexture | null {
    if (
      typeof HTMLImageElement === 'undefined' ||
      !(image instanceof HTMLImageElement)
    ) {
      return null;
    }
    const cached = this.imageTextures.get(image);
    if (cached !== undefined) return cached;
    let texture: WebGLTexture | null = null;
    if (image.complete && image.naturalWidth > 0) {
      const gl = this.gl;
      texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        image,
      );
      // LINEAR: icons are scaled to iconSize, matching Canvas2D smoothing.
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this.imageTextures.set(image, texture);
      this.createdTextures.add(texture);
    }
    // Not decoded yet: don't cache, so the post-decode redraw retries.
    return texture;
  }

  dispose(): void {
    this.canvas.removeEventListener('webglcontextlost', this.handleLost);
    this.canvas.removeEventListener(
      'webglcontextrestored',
      this.handleRestored,
    );
    const gl = this.gl;
    this.atlas?.dispose();
    if (this.vao !== null) gl.deleteVertexArray(this.vao);
    if (this.buffer !== null) gl.deleteBuffer(this.buffer);
    gl.deleteProgram(this.program.program);
    for (const texture of this.createdTextures) gl.deleteTexture(texture);
    this.createdTextures.clear();
    // Deliberately NO loseContext(): the canvas keeps this context for life,
    // and a remount on the same canvas (e.g. React StrictMode) re-acquires it
    // — a lost context would be unusable forever. Deleting the objects above
    // releases the GPU memory that matters.
  }
}
