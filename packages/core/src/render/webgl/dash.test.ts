import { describe, expect, it } from 'vitest';
import { expandDashes } from './dash';

type Seg = [number, number, number, number];

function dashes(segs: Seg[], pattern: number[], joins?: number[]) {
  const coords = Float32Array.from(segs.flat());
  const { coords: out, count } = expandDashes(
    coords,
    segs.length,
    joins ? Uint8Array.from(joins) : undefined,
    pattern,
  );
  const list: Seg[] = [];
  for (let i = 0; i < count; i++) {
    list.push([out[i * 4]!, out[i * 4 + 1]!, out[i * 4 + 2]!, out[i * 4 + 3]!]);
  }
  return list.map((s) => s.map((v) => Math.round(v * 1000) / 1000));
}

describe('expandDashes (§4 Canvas2D dash parity)', () => {
  it('splits a segment into on-runs, phase starting at the segment', () => {
    expect(dashes([[0, 0, 10, 0]], [4, 4])).toEqual([
      [0, 0, 4, 0],
      [8, 0, 10, 0],
    ]);
  });

  it('restarts the phase at each unjoined segment (separate subpaths)', () => {
    expect(
      dashes(
        [
          [0, 0, 6, 0],
          [0, 10, 6, 10],
        ],
        [4, 4],
      ),
    ).toEqual([
      [0, 0, 4, 0],
      [0, 10, 4, 10],
    ]);
  });

  it('carries the phase across joined segments, like one Canvas2D subpath', () => {
    // 6 px then 6 px joined: on 0–4, off 4–8 straddles the corner, on 8–12.
    expect(
      dashes(
        [
          [0, 0, 6, 0],
          [6, 0, 6, 6],
        ],
        [4, 4],
        [0, 1],
      ),
    ).toEqual([
      [0, 0, 4, 0],
      [6, 2, 6, 6],
    ]);
  });

  it('doubles odd-length patterns per the canvas spec', () => {
    expect(dashes([[0, 0, 9, 0]], [3])).toEqual([
      [0, 0, 3, 0],
      [6, 0, 9, 0],
    ]);
  });

  it('follows the segment direction for diagonal lines', () => {
    expect(dashes([[0, 0, 6, 8]], [5, 5])).toEqual([[0, 0, 3, 4]]);
  });

  it.each([
    ['empty', [] as number[]],
    ['all-zero', [0, 0]],
    ['negative entry', [4, -1]],
    ['non-finite entry', [4, Number.NaN]],
  ])('treats a %s pattern as solid', (_name, pattern) => {
    expect(dashes([[0, 0, 10, 0]], pattern)).toEqual([[0, 0, 10, 0]]);
  });

  it('emits nothing for zero-on patterns and zero-length segments', () => {
    expect(dashes([[0, 0, 10, 0]], [0, 4])).toEqual([]);
    expect(dashes([[5, 5, 5, 5]], [4, 4])).toEqual([]);
  });
});

describe('expandDashes joins (W-04)', () => {
  it('keeps a dash that runs on across a joined corner joined', () => {
    // 6 px then 6 px joined, pattern [8, 4]: the first dash straddles the corner.
    const { joins, count } = expandDashes(
      Float32Array.from([0, 0, 6, 0, 6, 0, 6, 6]),
      2,
      Uint8Array.from([0, 1]),
      [8, 4],
    );
    expect(count).toBe(2);
    expect(Array.from(joins.subarray(0, count))).toEqual([0, 1]);
  });

  it('does not join a dash that starts fresh at a corner', () => {
    // [6, 6]: the first dash ends exactly at the corner, the gap follows.
    const { joins, count } = expandDashes(
      Float32Array.from([0, 0, 6, 0, 6, 0, 6, 12, 6, 12, 12, 12]),
      3,
      Uint8Array.from([0, 1, 1]),
      [6, 6],
    );
    expect(Array.from(joins.subarray(0, count))).toEqual([0, 0]);
  });

  it('passes solid segments through with their joins', () => {
    const joins = Uint8Array.from([0, 1]);
    const out = expandDashes(
      Float32Array.from([0, 0, 1, 0, 1, 0, 1, 1]),
      2,
      joins,
      [],
    );
    expect(out.joins).toBe(joins);
    expect(out.count).toBe(2);
  });
});
