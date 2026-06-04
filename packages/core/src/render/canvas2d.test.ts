import { describe, expect, it } from 'vitest';
import { Canvas2DRenderer } from './canvas2d';
import type { ImageBatch } from './types';

// The node test env has no real 2D context, so inject a fake one that records
// the calls drawImages makes. This exercises the actual backend (including its
// try/catch for undecoded images), which the spec-level builder tests can't.

interface FakeCtx {
  fillStyle: string;
  fillRect: (...args: unknown[]) => void;
  drawImage: (...args: unknown[]) => void;
}

function makeFakeCanvas(ctx: FakeCtx): HTMLCanvasElement {
  return {
    width: 0,
    height: 0,
    getContext: () => ctx,
  } as unknown as HTMLCanvasElement;
}

describe('Canvas2DRenderer.drawImages (§4)', () => {
  it('draws each image at its device-px box', () => {
    const calls: unknown[][] = [];
    const ctx: FakeCtx = {
      fillStyle: '',
      fillRect: () => {},
      drawImage: (...args) => calls.push(args),
    };
    const r = new Canvas2DRenderer(
      makeFakeCanvas(ctx),
      makeFakeCanvas(ctx),
      '#000',
    );
    r.beginFrame('base');

    const imgA = { id: 'a' };
    const imgB = { id: 'b' };
    const batch: ImageBatch = {
      items: [
        { x: 10, y: 20, size: 16, image: imgA },
        { x: 30, y: 40, size: 16, image: imgB },
      ],
    };
    r.drawImages(batch);

    expect(calls).toEqual([
      [imgA, 10, 20, 16, 16],
      [imgB, 30, 40, 16, 16],
    ]);
  });

  it('skips an image that throws on draw and continues with the rest', () => {
    const drawn: unknown[] = [];
    const bad = { bad: true };
    const good = { good: true };
    const ctx: FakeCtx = {
      fillStyle: '',
      fillRect: () => {},
      drawImage: (image: unknown) => {
        if (image === bad) throw new Error('undecoded image');
        drawn.push(image);
      },
    };
    const r = new Canvas2DRenderer(
      makeFakeCanvas(ctx),
      makeFakeCanvas(ctx),
      '#000',
    );
    r.beginFrame('base');

    expect(() =>
      r.drawImages({
        items: [
          { x: 0, y: 0, size: 8, image: bad },
          { x: 0, y: 0, size: 8, image: good },
        ],
      }),
    ).not.toThrow();
    expect(drawn).toEqual([good]);
  });
});
