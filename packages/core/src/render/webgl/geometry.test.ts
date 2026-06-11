import { describe, expect, it } from 'vitest';
import { arrowheadTriangle } from '../arrowGeometry';
import {
  FLOATS_PER_VERTEX,
  pushArrowhead,
  pushLineQuad,
  pushNodeQuad,
  pushRect,
  pushTexturedQuad,
  VertexArray,
} from './geometry';

/** Decode the written floats into per-vertex tuples for assertions. */
function vertices(va: VertexArray): number[][] {
  const out: number[][] = [];
  const data = va.view();
  for (let i = 0; i < data.length; i += FLOATS_PER_VERTEX) {
    out.push([...data.subarray(i, i + FLOATS_PER_VERTEX)]);
  }
  return out;
}

describe('VertexArray', () => {
  it('grows past its initial capacity and survives reset', () => {
    const va = new VertexArray();
    const initialCapacity = va.data.length;
    for (let i = 0; i < initialCapacity; i++) va.push(i, i, 0, 0);
    expect(va.data.length).toBeGreaterThan(initialCapacity);
    expect(va.vertexCount).toBe(initialCapacity);
    expect(va.view()[0]).toBe(0);
    va.reset();
    expect(va.vertexCount).toBe(0);
  });
});

describe('pushRect', () => {
  it('emits two triangles covering the rectangle', () => {
    const va = new VertexArray();
    pushRect(va, 10, 20, 30, 40);
    const verts = vertices(va);
    expect(verts).toHaveLength(6);
    const xs = verts.map((v) => v[0]);
    const ys = verts.map((v) => v[1]);
    expect(Math.min(...(xs as number[]))).toBe(10);
    expect(Math.max(...(xs as number[]))).toBe(40);
    expect(Math.min(...(ys as number[]))).toBe(20);
    expect(Math.max(...(ys as number[]))).toBe(60);
  });
});

describe('pushLineQuad', () => {
  it('extrudes a horizontal segment vertically by half the width', () => {
    const va = new VertexArray();
    pushLineQuad(va, 0, 10, 100, 10, 4);
    const ys = vertices(va).map((v) => v[1] as number);
    expect(Math.min(...ys)).toBe(8);
    expect(Math.max(...ys)).toBe(12);
    const xs = vertices(va).map((v) => v[0] as number);
    expect(Math.min(...xs)).toBe(0); // butt caps: no extension past endpoints
    expect(Math.max(...xs)).toBe(100);
  });

  it('extrudes perpendicular to a diagonal segment', () => {
    const va = new VertexArray();
    pushLineQuad(va, 0, 0, 10, 10, 2 * Math.SQRT2);
    const verts = vertices(va);
    // Perpendicular to (1,1)/√2 scaled by width/2=√2 → offset (−1, 1).
    expect(verts[0]![0]).toBeCloseTo(-1);
    expect(verts[0]![1]).toBeCloseTo(1);
  });

  it('emits nothing for zero-length or zero-width segments', () => {
    const va = new VertexArray();
    pushLineQuad(va, 5, 5, 5, 5, 4);
    pushLineQuad(va, 0, 0, 10, 0, 0);
    expect(va.vertexCount).toBe(0);
  });
});

describe('pushNodeQuad', () => {
  it('pads the quad by 1px and carries px-from-centre UVs', () => {
    const va = new VertexArray();
    pushNodeQuad(va, 50, 60, 5);
    const verts = vertices(va);
    expect(verts[0]).toEqual([44, 54, -6, -6]);
    const maxU = Math.max(...verts.map((v) => v[2] as number));
    expect(maxU).toBe(6);
  });
});

describe('pushArrowhead', () => {
  it('matches the shared Canvas2D arrowhead geometry exactly', () => {
    const va = new VertexArray();
    pushArrowhead(va, 12, 34, Math.PI / 3, 9);
    const t = arrowheadTriangle(12, 34, Math.PI / 3, 9);
    const verts = vertices(va);
    expect(verts).toHaveLength(3);
    expect(verts[0]![0]).toBeCloseTo(t.tipX);
    expect(verts[0]![1]).toBeCloseTo(t.tipY);
    expect(verts[1]![0]).toBeCloseTo(t.baseAX);
    expect(verts[1]![1]).toBeCloseTo(t.baseAY);
    expect(verts[2]![0]).toBeCloseTo(t.baseBX);
    expect(verts[2]![1]).toBeCloseTo(t.baseBY);
  });
});

describe('pushTexturedQuad', () => {
  it('interpolates the given UV corners across the quad', () => {
    const va = new VertexArray();
    pushTexturedQuad(va, 0, 0, 10, 10, 0.25, 0.5, 0.75, 1.0);
    const verts = vertices(va);
    expect(verts[0]!.slice(2)).toEqual([0.25, 0.5]); // top-left
    expect(verts[2]!.slice(2)).toEqual([0.75, 1.0]); // bottom-right
  });
});
