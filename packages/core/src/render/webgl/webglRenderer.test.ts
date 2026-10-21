import { describe, expect, it, vi } from 'vitest';
import { LineBuffer, NodeBuffer, TextBuffer } from '../../scene/buffers';
import { fakeGl } from '../../testing/fakeGl';
import { WebGLRenderer } from './webglRenderer';

function fakeCanvas() {
  const listeners = new Map<string, (e: Event) => void>();
  return {
    width: 0,
    height: 0,
    addEventListener: (type: string, fn: (e: Event) => void) =>
      listeners.set(type, fn),
    removeEventListener: () => {},
    fire: (type: string) =>
      listeners.get(type)?.({ preventDefault: () => {} } as Event),
  };
}

/** A rasterizer producing a w×h bitmap for any text. */
function textRaster(w = 10, h = 10) {
  return {
    measure: (text: string) => text.length * 6,
    rasterize: () => ({
      width: w,
      height: h,
      offsetX: 0,
      offsetY: -5,
      advance: w,
      pixels: {
        width: w,
        height: h,
        data: new Uint8ClampedArray(w * h * 4),
      } as ImageData,
    }),
  };
}

function setup(maxTexture = 4096, raster = textRaster()) {
  const fake = fakeGl(maxTexture);
  const canvas = fakeCanvas();
  const hooks = {
    onContextLost: vi.fn(),
    onContextRestored: vi.fn(),
    text: raster,
  };
  const r = new WebGLRenderer(
    canvas as unknown as HTMLCanvasElement,
    fake.gl,
    hooks,
  );
  r.resize(800, 400);
  fake.reset();
  return { r, fake, canvas, hooks };
}

function line(color: string) {
  const b = new LineBuffer(color, 1);
  b.push(0, 0, 10, 0);
  return b;
}

describe('WebGLRenderer (§4, W-01, W-02)', () => {
  it('uploads a frame once and draws each batch instanced', () => {
    const { r, fake } = setup();
    r.beginFrame('#000000');
    r.drawLines(line('#ff0000'));
    r.drawLines(line('#00ff00'));
    const nodes = new NodeBuffer('#ffffff', 3);
    nodes.push(1, 1);
    nodes.push(2, 2);
    r.drawNodes(nodes);
    r.endFrame();
    expect(fake.named('bufferSubData')).toHaveLength(1);
    expect(fake.named('bufferData')).toHaveLength(1); // first growth only
    expect(fake.named('clear')).toHaveLength(1);
    const draws = fake.named('drawArraysInstanced').map((c) => c.args.slice(2));
    expect(draws).toEqual([
      [6, 1],
      [6, 1],
      [6, 2],
    ]);
  });

  it('points each command at its own records', () => {
    const { r, fake } = setup();
    r.beginFrame(null);
    r.drawLines(line('#ff0000'));
    const nodes = new NodeBuffer('#ffffff', 3);
    nodes.push(1, 1);
    r.drawNodes(nodes);
    r.endFrame();
    // Line records are 5 floats: the node program starts 20 bytes in.
    const offsets = fake.named('vertexAttribPointer').map((c) => c.args[5]);
    expect(offsets).toEqual([0, 16, 20]);
  });

  it('reuses the instance buffer without reallocating when it is big enough', () => {
    const { r, fake } = setup();
    for (let frame = 0; frame < 3; frame++) {
      r.beginFrame(null);
      r.drawLines(line('#ff0000'));
      r.endFrame();
    }
    expect(fake.named('bufferData')).toHaveLength(1);
    expect(fake.named('bufferSubData')).toHaveLength(3);
  });

  it('flushes before reusing an atlas page used this frame, clearing only once', () => {
    // 32-texel pages hold one 30-px glyph each; 4 text pages, then eviction.
    const { r, fake } = setup(32, textRaster(30, 30));
    r.beginFrame('#000000');
    const text = new TextBuffer('#fff', '12px x', 'left');
    for (const t of ['a', 'b', 'c', 'd', 'e']) text.push(10, 10, t);
    r.drawText(text);
    r.endFrame();
    expect(fake.named('clear')).toHaveLength(1);
    expect(fake.named('bufferSubData')).toHaveLength(2);
    expect(fake.named('texSubImage2D')).toHaveLength(5);
  });

  it('caches glyphs across frames', () => {
    const { r, fake } = setup();
    for (let frame = 0; frame < 2; frame++) {
      r.beginFrame(null);
      const text = new TextBuffer('#fff', '12px x', 'left');
      text.push(10, 10, 'same');
      r.drawText(text);
      r.endFrame();
    }
    expect(fake.named('texSubImage2D')).toHaveLength(1);
  });

  it('skips GL work while the context is lost and rebuilds on restore', () => {
    const { r, fake, canvas, hooks } = setup();
    canvas.fire('webglcontextlost');
    expect(hooks.onContextLost).toHaveBeenCalled();
    r.beginFrame('#000000');
    r.drawLines(line('#ff0000'));
    r.endFrame();
    expect(fake.calls).toHaveLength(0);
    canvas.fire('webglcontextrestored');
    expect(hooks.onContextRestored).toHaveBeenCalled();
    expect(fake.named('linkProgram').length).toBeGreaterThan(0);
  });

  it('reports an icon that cannot be read back once, then skips it', () => {
    const fake = fakeGl();
    const canvas = fakeCanvas();
    const icons = {
      rasterize: vi.fn((): ImageData | null => {
        throw new Error('SecurityError: tainted');
      }),
    };
    const r = new WebGLRenderer(
      canvas as unknown as HTMLCanvasElement,
      fake.gl,
      { icons, text: textRaster() },
    );
    r.resize(100, 100);
    const image = {};
    const draw = () => {
      r.beginFrame(null);
      r.drawImages({ items: [{ x: 0, y: 0, size: 16, image }] });
      r.endFrame();
    };
    expect(draw).toThrow('tainted');
    expect(draw).not.toThrow();
    expect(icons.rasterize).toHaveBeenCalledTimes(1);
  });

  it('releases its context on dispose', () => {
    const { r, fake } = setup();
    r.dispose();
    expect(fake.named('loseContext')).toHaveLength(1);
  });
});
