// CPU vertex builders for the WebGL backend (§4).
//
// Every primitive becomes triangles in one interleaved [x, y, u, v] layout
// (16 bytes/vertex) so a single shader program draws everything. The scratch
// VertexArray grows geometrically and is reused across frames — the hot path
// allocates nothing (§4 micro-optimisations).

import { arrowheadTriangle } from '../arrowGeometry';

export const FLOATS_PER_VERTEX = 4;

/** Growable interleaved vertex scratch, reused frame to frame. */
export class VertexArray {
  data = new Float32Array(1024 * FLOATS_PER_VERTEX);
  /** Floats written so far. */
  length = 0;

  get vertexCount(): number {
    return this.length / FLOATS_PER_VERTEX;
  }

  reset(): void {
    this.length = 0;
  }

  /** A view of exactly the written floats, for bufferData. */
  view(): Float32Array {
    return this.data.subarray(0, this.length);
  }

  push(x: number, y: number, u: number, v: number): void {
    if (this.length + FLOATS_PER_VERTEX > this.data.length) {
      const grown = new Float32Array(this.data.length * 2);
      grown.set(this.data);
      this.data = grown;
    }
    this.data[this.length++] = x;
    this.data[this.length++] = y;
    this.data[this.length++] = u;
    this.data[this.length++] = v;
  }
}

/** Two triangles covering an axis-aligned rectangle; UVs interpolate the given corners. */
function pushQuad(
  va: VertexArray,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  u0 = 0,
  v0 = 0,
  u1 = 0,
  v1 = 0,
): void {
  va.push(x0, y0, u0, v0);
  va.push(x1, y0, u1, v0);
  va.push(x1, y1, u1, v1);
  va.push(x0, y0, u0, v0);
  va.push(x1, y1, u1, v1);
  va.push(x0, y1, u0, v1);
}

export function pushRect(
  va: VertexArray,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  pushQuad(va, x, y, x + width, y + height);
}

/**
 * A line segment as a width-extruded quad with butt caps (the Canvas2D
 * default for the engine's independent moveTo/lineTo subpaths). Zero-length
 * segments draw nothing, matching butt-cap behaviour.
 */
export function pushLineQuad(
  va: VertexArray,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  width: number,
): void {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy);
  if (length === 0 || width <= 0) return;
  const nx = (-dy / length) * (width / 2);
  const ny = (dx / length) * (width / 2);
  va.push(x1 + nx, y1 + ny, 0, 0);
  va.push(x2 + nx, y2 + ny, 0, 0);
  va.push(x2 - nx, y2 - ny, 0, 0);
  va.push(x1 + nx, y1 + ny, 0, 0);
  va.push(x2 - nx, y2 - ny, 0, 0);
  va.push(x1 - nx, y1 - ny, 0, 0);
}

/**
 * A circle as a padded quad whose UVs are device px from the centre; the
 * fragment shader's SDF mode clips to the radius with a 1px soft edge (hence
 * the +1px padding).
 */
export function pushNodeQuad(
  va: VertexArray,
  x: number,
  y: number,
  radius: number,
): void {
  const pad = radius + 1;
  pushQuad(va, x - pad, y - pad, x + pad, y + pad, -pad, -pad, pad, pad);
}

/** One arrowhead triangle, via the geometry shared with Canvas2D (§4). */
export function pushArrowhead(
  va: VertexArray,
  x: number,
  y: number,
  angle: number,
  size: number,
): void {
  const t = arrowheadTriangle(x, y, angle, size);
  va.push(t.tipX, t.tipY, 0, 0);
  va.push(t.baseAX, t.baseAY, 0, 0);
  va.push(t.baseBX, t.baseBY, 0, 0);
}

/** A textured quad sampling [u0,v0]..[u1,v1] (text atlas entries, icons). */
export function pushTexturedQuad(
  va: VertexArray,
  x: number,
  y: number,
  width: number,
  height: number,
  u0: number,
  v0: number,
  u1: number,
  v1: number,
): void {
  pushQuad(va, x, y, x + width, y + height, u0, v0, u1, v1);
}
