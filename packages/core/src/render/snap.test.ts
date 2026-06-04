import { describe, expect, it } from 'vitest';
import {
  snapArrowheads,
  snapIcons,
  snapLabels,
  snapLines,
  snapNodes,
} from './snap';

describe('snap CSS→device pass (§3)', () => {
  it('snapLines scales width and applies the hairline offset to a 1px stroke', () => {
    const batch = snapLines(
      {
        color: '#fff',
        width: 1,
        segments: [{ x1: 10, y1: 20, x2: 10, y2: 40 }],
      },
      2,
    );
    expect(batch.width).toBe(2); // even width -> no hairline offset
    expect(batch.segments[0]).toEqual({ x1: 20, y1: 40, x2: 20, y2: 80 });
  });

  it('snapLines offsets odd device widths by 0.5px for crisp hairlines', () => {
    const batch = snapLines(
      {
        color: '#fff',
        width: 1,
        segments: [{ x1: 10, y1: 20, x2: 30, y2: 20 }],
      },
      1,
    );
    expect(batch.width).toBe(1);
    expect(batch.segments[0]).toEqual({
      x1: 10.5,
      y1: 20.5,
      x2: 30.5,
      y2: 20.5,
    });
  });

  it('snapNodes snaps coordinates and radius to device px', () => {
    const batch = snapNodes(
      { color: '#fff', radius: 3, items: [{ x: 5, y: 7 }] },
      2,
    );
    expect(batch.radius).toBe(6);
    expect(batch.items[0]).toEqual({ x: 10, y: 14 });
  });

  it('snapArrowheads scales size but leaves the angle untouched', () => {
    const batch = snapArrowheads(
      { color: '#fff', size: 6, items: [{ x: 4, y: 8, angle: Math.PI / 2 }] },
      2,
    );
    expect(batch.size).toBe(12);
    expect(batch.items[0]!.angle).toBe(Math.PI / 2);
    expect(batch.items[0]).toMatchObject({ x: 8, y: 16 });
  });

  it('snapLabels scales the font size to device px', () => {
    const batch = snapLabels(
      {
        color: '#fff',
        font: '12px system-ui',
        baseline: 'middle',
        align: 'left',
        items: [{ x: 3, y: 5, text: 'hi' }],
      },
      2,
    );
    expect(batch.font).toBe('24px system-ui');
    expect(batch.items[0]).toEqual({ x: 6, y: 10, text: 'hi' });
  });

  it('snapIcons snaps position and size', () => {
    const image = {} as HTMLImageElement;
    const batch = snapIcons({ items: [{ x: 5, y: 6, size: 16, image }] }, 2);
    expect(batch.items[0]).toEqual({ x: 10, y: 12, size: 32, image });
  });
});
