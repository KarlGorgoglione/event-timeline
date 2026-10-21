// CPU-side recording of one WebGL frame (DESIGN.md §4).
//
// Draw verbs append fixed-size instance records to one growable staging array
// and a command per batch (program, record range, uniforms, texture), in call
// order. At the end of the frame — or at a mid-frame flush, when an atlas page
// must be reused — the whole chunk is uploaded once and its commands replayed,
// so a frame costs one buffer upload instead of one per batch. Adjacent
// commands with the same program, uniforms and texture merge into one draw.
// Pure (no GL), so batching is unit-testable.

import type { ArrowheadBatch, LineBatch, NodeBatch, RectBatch } from '../types';
import type { PremultipliedRgba } from './color';
import { expandDashes } from './dash';
import { recordFloats, type ProgramName } from './programs';

/** Which atlas page a textured command samples. */
export interface TextureRef {
  atlas: 'text' | 'icon';
  page: number;
}

export interface DrawCommand {
  program: ProgramName;
  /** First float of the command's records in the chunk's staging array. */
  offset: number;
  instances: number;
  /** Premultiplied colour (unused by the textured program). */
  color: PremultipliedRgba;
  /** Half line width, node radius or arrowhead size, by program. */
  size: number;
  texture: TextureRef | null;
}

const NO_COLOR: PremultipliedRgba = [0, 0, 0, 0];
const LINE = recordFloats('line');
const NODE = recordFloats('node');
const HEAD = recordFloats('head');
const RECT = recordFloats('rect');
const TEXTURED = recordFloats('texture');

export class FrameEncoder {
  staging = new Float32Array(4096);
  /** Floats written in the current chunk. */
  length = 0;
  private readonly pool: DrawCommand[] = [];
  /** Commands in the current chunk. */
  count = 0;

  /** Start a new chunk (a frame, or the remainder after a flush). */
  reset(): void {
    this.length = 0;
    this.count = 0;
  }

  command(index: number): DrawCommand {
    return this.pool[index] as DrawCommand;
  }

  lines(batch: LineBatch, color: PremultipliedRgba): void {
    if (batch.count === 0) return;
    const dashed = batch.dash !== undefined && batch.dash.length > 0;
    const { coords, joins, count } = dashed
      ? expandDashes(
          batch.coords,
          batch.count,
          batch.joins,
          batch.dash as number[],
        )
      : { coords: batch.coords, joins: batch.joins, count: batch.count };
    if (count === 0) return;
    const at = this.reserve(count * LINE);
    const out = this.staging;
    for (let s = 0; s < count; s++) {
      const i = s * 4;
      const o = at + s * LINE;
      out[o] = coords[i] as number;
      out[o + 1] = coords[i + 1] as number;
      out[o + 2] = coords[i + 2] as number;
      out[o + 3] = coords[i + 3] as number;
      // bit 0: the start joins the previous segment; bit 1: the end joins the
      // next one (none after the last segment).
      const start = joins !== undefined && joins[s] === 1 ? 1 : 0;
      const end =
        joins !== undefined && s + 1 < count && joins[s + 1] === 1 ? 2 : 0;
      out[o + 4] = start + end;
    }
    this.push('line', at, count, color, batch.width / 2, null);
  }

  nodes(batch: NodeBatch, color: PremultipliedRgba): void {
    if (batch.count === 0) return;
    const at = this.copy(batch.coords, batch.count * NODE);
    this.push('node', at, batch.count, color, batch.radius, null);
  }

  heads(batch: ArrowheadBatch, color: PremultipliedRgba): void {
    if (batch.count === 0) return;
    const at = this.copy(batch.coords, batch.count * HEAD);
    this.push('head', at, batch.count, color, batch.size, null);
  }

  rects(batch: RectBatch, color: PremultipliedRgba): void {
    if (batch.count === 0) return;
    const at = this.copy(batch.coords, batch.count * RECT);
    this.push('rect', at, batch.count, color, 0, null);
  }

  rect(
    x: number,
    y: number,
    w: number,
    h: number,
    color: PremultipliedRgba,
  ): void {
    const at = this.reserve(RECT);
    this.staging[at] = x;
    this.staging[at + 1] = y;
    this.staging[at + 2] = w;
    this.staging[at + 3] = h;
    this.push('rect', at, 1, color, 0, null);
  }

  /** One textured rect: screen `x, y, w, h`, atlas UVs `u0, v0, u1, v1`. */
  textured(
    texture: TextureRef,
    x: number,
    y: number,
    w: number,
    h: number,
    u0: number,
    v0: number,
    u1: number,
    v1: number,
  ): void {
    const at = this.reserve(TEXTURED);
    const out = this.staging;
    out[at] = x;
    out[at + 1] = y;
    out[at + 2] = w;
    out[at + 3] = h;
    out[at + 4] = u0;
    out[at + 5] = v0;
    out[at + 6] = u1;
    out[at + 7] = v1;
    this.push('texture', at, 1, NO_COLOR, 0, texture);
  }

  /** Append `floats` floats of `source` to the staging array. */
  private copy(source: Float32Array, floats: number): number {
    const at = this.reserve(floats);
    this.staging.set(source.subarray(0, floats), at);
    return at;
  }

  private reserve(floats: number): number {
    const at = this.length;
    const needed = at + floats;
    if (needed > this.staging.length) {
      const next = new Float32Array(Math.max(needed, this.staging.length * 2));
      next.set(this.staging.subarray(0, at));
      this.staging = next;
    }
    this.length = needed;
    return at;
  }

  /** Add a command, or extend the previous one when it draws alike. */
  private push(
    program: ProgramName,
    offset: number,
    instances: number,
    color: PremultipliedRgba,
    size: number,
    texture: TextureRef | null,
  ): void {
    const last = this.count > 0 ? this.command(this.count - 1) : null;
    if (
      last !== null &&
      last.program === program &&
      last.size === size &&
      sameColor(last.color, color) &&
      sameTexture(last.texture, texture) &&
      last.offset + last.instances * recordFloats(program) === offset
    ) {
      last.instances += instances;
      return;
    }
    let command = this.pool[this.count];
    if (command === undefined) {
      command = { program, offset, instances, color, size, texture };
      this.pool.push(command);
    } else {
      command.program = program;
      command.offset = offset;
      command.instances = instances;
      command.color = color;
      command.size = size;
      command.texture = texture;
    }
    this.count++;
  }
}

function sameColor(a: PremultipliedRgba, b: PremultipliedRgba): boolean {
  return (
    a === b ||
    (a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3])
  );
}

function sameTexture(a: TextureRef | null, b: TextureRef | null): boolean {
  return (
    a === b ||
    (a !== null && b !== null && a.atlas === b.atlas && a.page === b.page)
  );
}
