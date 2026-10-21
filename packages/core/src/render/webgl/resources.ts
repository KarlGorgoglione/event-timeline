// GL objects of the WebGL2 backend and the replay of recorded frames
// (DESIGN.md §4).
//
// One context per timeline (the overlay is Canvas2D). The programs, one
// instance buffer and the atlas page textures live here. A recorded chunk is
// uploaded with a single buffer write (the buffer is only reallocated when it
// must grow) and replayed command by command, re-pointing the instance
// attributes at each command's records.

import type { PremultipliedRgba } from './color';
import type { FrameEncoder, TextureRef } from './encoder';
import {
  compileProgram,
  PROGRAMS,
  type CompiledProgram,
  type ProgramName,
} from './programs';

/**
 * Context attributes (§4 compositing parity with Canvas2D): an alpha canvas
 * with premultiplied colour (the theme background may be translucent), no
 * depth or stencil (painter's algorithm), MSAA for triangle edges, and no
 * preserved buffer — every frame is fully redrawn.
 */
export const GL_CONTEXT_ATTRIBUTES: WebGLContextAttributes = {
  alpha: true,
  antialias: true,
  premultipliedAlpha: true,
  preserveDrawingBuffer: false,
  depth: false,
  stencil: false,
};

export class GlResources {
  private programs!: Record<ProgramName, CompiledProgram>;
  private buffer!: WebGLBuffer;
  private capacity = 0;
  private readonly pages = new Map<string, WebGLTexture>();
  private width = 0;
  private height = 0;

  constructor(
    readonly gl: WebGL2RenderingContext,
    readonly pageSize: number,
  ) {
    this.init();
  }

  /** Create every GL object (at start, and again after a context restore). */
  init(): void {
    const gl = this.gl;
    this.buffer = gl.createBuffer();
    this.capacity = 0;
    this.pages.clear();
    const programs = {} as Record<ProgramName, CompiledProgram>;
    for (const name of Object.keys(PROGRAMS) as ProgramName[]) {
      programs[name] = compileProgram(gl, PROGRAMS[name], this.buffer);
    }
    this.programs = programs;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    if (this.width > 0) gl.viewport(0, 0, this.width, this.height);
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    if (width > 0 && height > 0) this.gl.viewport(0, 0, width, height);
  }

  /** Copy pixels into an atlas page, creating the page texture on first use. */
  upload(ref: TextureRef, x: number, y: number, pixels: ImageData): void {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.page(ref));
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      x,
      y,
      pixels.width,
      pixels.height,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      pixels.data,
    );
  }

  /**
   * Upload a recorded chunk and replay it. `clear` (the first chunk of a
   * frame only) clears to that premultiplied colour first.
   */
  execute(encoder: FrameEncoder, clear: PremultipliedRgba | null): void {
    const gl = this.gl;
    if (clear !== null) {
      gl.clearColor(clear[0], clear[1], clear[2], clear[3]);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    if (encoder.count === 0 || this.width <= 0) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    const bytes = encoder.length * 4;
    if (bytes > this.capacity) {
      this.capacity = Math.max(bytes, this.capacity * 2);
      gl.bufferData(gl.ARRAY_BUFFER, this.capacity, gl.DYNAMIC_DRAW);
    }
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, encoder.staging, 0, encoder.length);

    let current: CompiledProgram | null = null;
    for (let i = 0; i < encoder.count; i++) {
      const command = encoder.command(i);
      const program = this.programs[command.program];
      if (program !== current) {
        current = program;
        gl.useProgram(program.program);
        gl.bindVertexArray(program.vao);
        gl.uniform2f(
          program.uniforms.get('u_resolution') ?? null,
          this.width,
          this.height,
        );
        gl.uniform1i(program.uniforms.get('u_texture') ?? null, 0);
      }
      let offset = command.offset * 4;
      for (const attribute of program.attributes) {
        gl.vertexAttribPointer(
          attribute.location,
          attribute.size,
          gl.FLOAT,
          false,
          program.stride,
          offset,
        );
        offset += attribute.size * 4;
      }
      const c = command.color;
      gl.uniform4f(
        program.uniforms.get('u_color') ?? null,
        c[0],
        c[1],
        c[2],
        c[3],
      );
      const size = command.size;
      gl.uniform1f(program.uniforms.get('u_halfWidth') ?? null, size);
      gl.uniform1f(program.uniforms.get('u_radius') ?? null, size);
      gl.uniform1f(program.uniforms.get('u_size') ?? null, size);
      if (command.texture !== null) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.page(command.texture));
      }
      gl.drawArraysInstanced(
        gl.TRIANGLES,
        0,
        program.vertices,
        command.instances,
      );
    }
    gl.bindVertexArray(null);
  }

  dispose(): void {
    const gl = this.gl;
    for (const program of Object.values(this.programs)) {
      gl.deleteVertexArray(program.vao);
      gl.deleteProgram(program.program);
    }
    gl.deleteBuffer(this.buffer);
    for (const texture of this.pages.values()) gl.deleteTexture(texture);
    this.pages.clear();
  }

  private page(ref: TextureRef): WebGLTexture {
    const key = `${ref.atlas}:${ref.page}`;
    let texture = this.pages.get(key);
    if (texture === undefined) {
      const gl = this.gl;
      texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, this.pageSize, this.pageSize);
      // Entries are drawn 1:1 in device px: nearest sampling stays crisp and
      // never bleeds into a neighbour.
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this.pages.set(key, texture);
    }
    return texture;
  }
}
