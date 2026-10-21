import { describe, expect, it } from 'vitest';
import {
  ArrowheadBuffer,
  LineBuffer,
  NodeBuffer,
  RectBuffer,
} from '../../scene/buffers';
import type { PremultipliedRgba } from './color';
import { FrameEncoder } from './encoder';

const red: PremultipliedRgba = [1, 0, 0, 1];
const blue: PremultipliedRgba = [0, 0, 1, 1];

function line(width: number, segs: number[][], joins: boolean[] = []) {
  const b = new LineBuffer('#000', width);
  segs.forEach((s, i) => b.push(s[0]!, s[1]!, s[2]!, s[3]!, joins[i] ?? false));
  return b;
}

describe('FrameEncoder (§4, W-02)', () => {
  it('records each batch as one instanced command over shared staging', () => {
    const e = new FrameEncoder();
    e.lines(line(2, [[0, 0, 10, 0]]), red);
    const nodes = new NodeBuffer('#000', 3);
    nodes.push(1, 2);
    nodes.push(3, 4);
    e.nodes(nodes, red);
    expect(e.count).toBe(2);
    expect(e.command(0)).toMatchObject({
      program: 'line',
      offset: 0,
      instances: 1,
      size: 1,
    });
    expect(e.command(1)).toMatchObject({
      program: 'node',
      offset: 5,
      instances: 2,
      size: 3,
    });
    expect(Array.from(e.staging.subarray(5, e.length))).toEqual([1, 2, 3, 4]);
  });

  it('encodes join flags: bit 0 joined start, bit 1 joined end', () => {
    const e = new FrameEncoder();
    e.lines(
      line(
        1,
        [
          [0, 0, 1, 0],
          [1, 0, 1, 1],
          [1, 1, 2, 1],
          [9, 9, 9, 10],
        ],
        [false, true, true, false],
      ),
      red,
    );
    const flags = [4, 9, 14, 19].map((i) => e.staging[i]);
    expect(flags).toEqual([2, 3, 1, 0]);
  });

  it('expands dashes on the CPU before recording', () => {
    const e = new FrameEncoder();
    const dashed = new LineBuffer('#000', 1, [4, 4]);
    dashed.push(0, 0, 10, 0);
    e.lines(dashed, red);
    expect(e.command(0).instances).toBe(2);
  });

  it('merges adjacent commands that draw alike, and only those', () => {
    const e = new FrameEncoder();
    e.lines(line(2, [[0, 0, 1, 0]]), red);
    e.lines(line(2, [[0, 1, 1, 1]]), red); // same colour + width → merged
    e.lines(line(2, [[0, 2, 1, 2]]), blue); // new colour
    e.lines(line(4, [[0, 3, 1, 3]]), blue); // new width
    expect(e.count).toBe(3);
    expect(e.command(0).instances).toBe(2);
  });

  it('keeps textured rects of different pages apart', () => {
    const e = new FrameEncoder();
    e.textured({ atlas: 'text', page: 0 }, 0, 0, 1, 1, 0, 0, 1, 1);
    e.textured({ atlas: 'text', page: 0 }, 1, 0, 1, 1, 0, 0, 1, 1);
    e.textured({ atlas: 'text', page: 1 }, 2, 0, 1, 1, 0, 0, 1, 1);
    e.textured({ atlas: 'icon', page: 1 }, 3, 0, 1, 1, 0, 0, 1, 1);
    expect(e.count).toBe(3);
    expect(e.command(0).instances).toBe(2);
  });

  it('records heads and rects, and grows its staging array', () => {
    const e = new FrameEncoder();
    const heads = new ArrowheadBuffer('#000', 6);
    for (let i = 0; i < 2000; i++) heads.push(i, i, 1);
    e.heads(heads, red);
    const rects = new RectBuffer('#000');
    rects.push(1, 2, 3, 4);
    e.rects(rects, blue);
    e.rect(5, 6, 7, 8, blue); // merges with the rect batch
    expect(e.length).toBe(2000 * 3 + 8);
    expect(e.count).toBe(2);
    expect(e.command(1)).toMatchObject({ program: 'rect', instances: 2 });
  });

  it('reset starts a fresh chunk, reusing its command records', () => {
    const e = new FrameEncoder();
    e.lines(line(1, [[0, 0, 1, 0]]), red);
    const first = e.command(0);
    e.reset();
    expect([e.count, e.length]).toEqual([0, 0]);
    e.nodes(Object.assign(new NodeBuffer('#000', 2), {}), red); // empty: no command
    expect(e.count).toBe(0);
    e.lines(line(1, [[0, 0, 1, 0]]), blue);
    expect(e.command(0)).toBe(first);
  });
});
