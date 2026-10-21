import { describe, expect, it } from 'vitest';
import { ClusterRuns, fastKeyFunction } from './cluster';
import {
  fastKeyKind,
  byDay,
  byElementPair,
  byPixelColumn,
  bySourceTargetColumn,
} from './strategies';

function runs(xs: number[], keys: (number | string)[], minSep = 12) {
  const r = new ClusterRuns();
  r.build(xs.length, Float64Array.from(xs), (k) => keys[k]!, minSep);
  const out: number[][] = [];
  for (let i = 0; i < r.count; i++) {
    out.push(
      Array.from(r.members.subarray(r.start[i], r.start[i]! + r.size[i]!)),
    );
  }
  return out;
}

describe('ClusterRuns (§6)', () => {
  it('merges same-key candidates within the separation of the run start', () => {
    expect(runs([0, 5, 10], [1, 1, 1])).toEqual([[0, 1, 2]]);
  });

  it('keeps a lone candidate as its own run', () => {
    expect(runs([0], [1])).toEqual([[0]]);
  });

  it('never merges across keys', () => {
    expect(runs([0, 1, 2], [1, 2, 1])).toEqual([[0, 2], [1]]);
  });

  it('measures from the first member, so a chain of near neighbours splits (B-11)', () => {
    expect(runs([0, 8, 16, 24], [1, 1, 1, 1])).toEqual([
      [0, 1],
      [2, 3],
    ]);
  });

  it('makes every candidate its own run with a negative separation', () => {
    expect(runs([0, 0, 0], [1, 1, 1], -1)).toEqual([[0], [1], [2]]);
  });

  it('handles an empty input and reuses its buffers', () => {
    const r = new ClusterRuns();
    r.build(0, new Float64Array(0), () => 0, 12);
    expect(r.count).toBe(0);
    r.build(500, new Float64Array(500), () => 0, 12);
    expect(r.count).toBe(1);
    expect(r.size[0]).toBe(500);
  });
});

describe('fast numeric keys match the built-in strategies (§6, P-04)', () => {
  const x = Float64Array.from([0, 5, 25, 25]);
  const time = Float64Array.from([
    0,
    86_400_000 - 1,
    86_400_000,
    2 * 86_400_000,
  ]);
  const source = Int32Array.from([0, 0, 0, 1]);
  const target = Int32Array.from([1, 1, 1, 0]);
  const input = {
    x,
    time,
    source,
    target,
    elementCount: 2,
    minSeparationPx: 10,
  };
  const groups = (key: (k: number) => number) => [0, 1, 2, 3].map(key);

  it('registers every built-in with its fast kind', () => {
    expect(fastKeyKind(byPixelColumn)).toBe('column');
    expect(fastKeyKind(byElementPair)).toBe('pair');
    expect(fastKeyKind(byDay)).toBe('day');
    expect(fastKeyKind(bySourceTargetColumn)).toBe('pair-column');
    expect(fastKeyKind({ key: () => 0 })).toBeUndefined();
  });

  it('groups like the string keys do', () => {
    const [a, b, c, d] = groups(fastKeyFunction('pair-column', input));
    expect(a).toBe(b); // same pair, same column
    expect(a).not.toBe(c); // same pair, other column
    expect(c).not.toBe(d); // same column, reversed pair
    const [p0, p1, , p3] = groups(fastKeyFunction('pair', input));
    expect(p0).toBe(p1);
    expect(p0).not.toBe(p3);
    expect(groups(fastKeyFunction('day', input))).toEqual([0, 0, 1, 2]);
    expect(groups(fastKeyFunction('column', input))).toEqual([0, 0, 2, 2]);
  });

  it('keeps pair-column keys injective for negative columns', () => {
    const key = fastKeyFunction('pair-column', {
      ...input,
      x: Float64Array.from([-30, 30, 0, 0]),
    });
    expect(key(0)).not.toBe(key(1));
  });
});
