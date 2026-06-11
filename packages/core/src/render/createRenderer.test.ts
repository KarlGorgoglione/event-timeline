// Backend-selection fallback paths (§4, §16). A real WebGL2 path needs a GPU
// and is covered by Playwright; these tests pin the graceful degradation.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRenderer } from './createRenderer';

interface FakeCanvas {
  getContext: ReturnType<typeof vi.fn>;
  ownerDocument?: Document;
}

const fake2dContext = {} as CanvasRenderingContext2D;

function fakeCanvas(
  contexts: Partial<Record<string, unknown>> = { '2d': fake2dContext },
): FakeCanvas {
  const canvas: FakeCanvas = {
    getContext: vi.fn((id: string) => contexts[id] ?? null),
  };
  canvas.ownerDocument = {
    createElement: () => fakeCanvas(contexts),
  } as unknown as Document;
  return canvas;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createRenderer (§4 backend selection)', () => {
  it('returns Canvas2D without probing when preference is canvas2d', () => {
    const base = fakeCanvas();
    const overlay = fakeCanvas();
    const renderer = createRenderer(
      base as unknown as HTMLCanvasElement,
      overlay as unknown as HTMLCanvasElement,
      '#000',
      { preference: 'canvas2d' },
    );
    expect(renderer.backend).toBe('canvas2d');
    expect(base.getContext).toHaveBeenCalledWith('2d');
    expect(base.getContext).not.toHaveBeenCalledWith(
      'webgl2',
      expect.anything(),
    );
  });

  it('falls back to Canvas2D when the WebGL2 API does not exist (SSR/jsdom)', () => {
    // Node has no WebGL2RenderingContext global; even an explicit 'webgl'
    // preference must degrade rather than throw (§1 lenient).
    const renderer = createRenderer(
      fakeCanvas() as unknown as HTMLCanvasElement,
      fakeCanvas() as unknown as HTMLCanvasElement,
      '#000',
      { preference: 'webgl' },
    );
    expect(renderer.backend).toBe('canvas2d');
  });

  it('falls back to Canvas2D when the scratch probe returns null', () => {
    class FakeWebGL2 {}
    vi.stubGlobal('WebGL2RenderingContext', FakeWebGL2);
    const renderer = createRenderer(
      fakeCanvas() as unknown as HTMLCanvasElement, // webgl2 → null on every canvas
      fakeCanvas() as unknown as HTMLCanvasElement,
      '#000',
    );
    expect(renderer.backend).toBe('canvas2d');
  });

  it('falls back to Canvas2D when real-canvas WebGL2 acquisition fails after a good probe', () => {
    class FakeWebGL2 {
      getExtension(): null {
        return null;
      }
    }
    vi.stubGlobal('WebGL2RenderingContext', FakeWebGL2);
    // The scratch canvas (from ownerDocument.createElement) yields a context;
    // the real canvases do not.
    const real = fakeCanvas({ '2d': fake2dContext });
    real.ownerDocument = {
      createElement: () =>
        fakeCanvas({ '2d': fake2dContext, webgl2: new FakeWebGL2() }),
    } as unknown as Document;
    const renderer = createRenderer(
      real as unknown as HTMLCanvasElement,
      fakeCanvas() as unknown as HTMLCanvasElement,
      '#000',
    );
    expect(renderer.backend).toBe('canvas2d');
  });

  it('probes with failIfMajorPerformanceCaveat only in auto mode', () => {
    class FakeWebGL2 {}
    vi.stubGlobal('WebGL2RenderingContext', FakeWebGL2);
    const probes: WebGLContextAttributes[] = [];
    const scratch: FakeCanvas = {
      getContext: vi.fn((id: string, attrs?: WebGLContextAttributes) => {
        if (id === 'webgl2' && attrs) probes.push(attrs);
        return id === '2d' ? fake2dContext : null;
      }),
    };
    const base = fakeCanvas();
    base.ownerDocument = {
      createElement: () => scratch,
    } as unknown as Document;

    createRenderer(
      base as unknown as HTMLCanvasElement,
      fakeCanvas() as unknown as HTMLCanvasElement,
      '#000',
      { preference: 'auto' },
    );
    createRenderer(
      base as unknown as HTMLCanvasElement,
      fakeCanvas() as unknown as HTMLCanvasElement,
      '#000',
      { preference: 'webgl' },
    );
    expect(probes.map((p) => p.failIfMajorPerformanceCaveat)).toEqual([
      true,
      false,
    ]);
  });
});
