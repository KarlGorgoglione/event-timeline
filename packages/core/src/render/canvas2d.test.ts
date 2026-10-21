import { describe, expect, it } from 'vitest';
import {
  LineBuffer,
  NodeBuffer,
  RectBuffer,
  TextBuffer,
} from '../scene/buffers';
import { Canvas2DRenderer } from './canvas2d';

// The node test env has no real 2D context, so inject one that records calls.

function recordingContext() {
  const calls: unknown[][] = [];
  const state: Record<string, unknown> = {};
  const ctx = new Proxy(state, {
    get: (target, key) =>
      key in target
        ? target[key as string]
        : (...args: unknown[]) => calls.push([String(key), ...args]),
    set: (target, key, value) => {
      target[key as string] = value;
      calls.push([`set ${String(key)}`, value]);
      return true;
    },
  });
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ctx,
  } as unknown as HTMLCanvasElement;
  return { renderer: new Canvas2DRenderer(canvas), calls };
}

const named = (calls: unknown[][], name: string) =>
  calls.filter((c) => c[0] === name);

describe('Canvas2DRenderer (§4)', () => {
  it('clears, then paints the background on the base layer only', () => {
    const { renderer, calls } = recordingContext();
    renderer.beginFrame('#000');
    expect(calls.map((c) => c[0])).toEqual([
      'clearRect',
      'set fillStyle',
      'fillRect',
    ]);
    calls.length = 0;
    renderer.beginFrame(null);
    expect(calls.map((c) => c[0])).toEqual(['clearRect']);
  });

  it('draws joined segments as one subpath (no notches, W-04)', () => {
    const { renderer, calls } = recordingContext();
    const line = new LineBuffer('#fff', 1);
    line.push(0, 0, 10, 0);
    line.push(10, 0, 10, 10, true);
    line.push(50, 50, 60, 50);
    renderer.drawLines(line);
    expect(named(calls, 'moveTo')).toEqual([
      ['moveTo', 0, 0],
      ['moveTo', 50, 50],
    ]);
    expect(named(calls, 'lineTo')).toHaveLength(3);
    expect(named(calls, 'stroke')).toHaveLength(1);
  });

  it('applies a dash then resets it so the next batch is solid', () => {
    const { renderer, calls } = recordingContext();
    const dashed = new LineBuffer('#fff', 1, [8, 4]);
    dashed.push(0, 0, 10, 0);
    renderer.drawLines(dashed);
    expect(named(calls, 'setLineDash')).toEqual([
      ['setLineDash', [8, 4]],
      ['setLineDash', []],
    ]);
    calls.length = 0;
    const solid = new LineBuffer('#fff', 1);
    solid.push(0, 0, 10, 0);
    renderer.drawLines(solid);
    expect(named(calls, 'setLineDash')).toEqual([]);
  });

  it('fills every node of a batch in one path', () => {
    const { renderer, calls } = recordingContext();
    const nodes = new NodeBuffer('#f00', 3);
    nodes.push(10, 10);
    nodes.push(20, 20);
    renderer.drawNodes(nodes);
    expect(named(calls, 'arc')).toHaveLength(2);
    expect(named(calls, 'fill')).toHaveLength(1);
  });

  it('draws text and rects from their typed buffers', () => {
    const { renderer, calls } = recordingContext();
    const text = new TextBuffer('#fff', '12px x', 'left');
    text.push(5, 6, 'hello');
    renderer.drawText(text);
    expect(named(calls, 'fillText')).toEqual([['fillText', 'hello', 5, 6]]);
    const rects = new RectBuffer('#123');
    rects.push(1, 2, 3, 4);
    renderer.drawRects(rects);
    expect(named(calls, 'rect')).toEqual([['rect', 1, 2, 3, 4]]);
  });

  it('draws the other images when one throws, then reports the failure', () => {
    const drawn: unknown[] = [];
    const bad = { bad: true };
    const good = { good: true };
    const ctx = {
      drawImage: (image: unknown) => {
        if (image === bad) throw new Error('undecoded image');
        drawn.push(image);
      },
    };
    const renderer = new Canvas2DRenderer({
      width: 0,
      height: 0,
      getContext: () => ctx,
    } as unknown as HTMLCanvasElement);
    expect(() =>
      renderer.drawImages({
        items: [
          { x: 0, y: 0, size: 8, image: bad },
          { x: 0, y: 0, size: 8, image: good },
        ],
      }),
    ).toThrow('undecoded image');
    expect(drawn).toEqual([good]);
  });
});
