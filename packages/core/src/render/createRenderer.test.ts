// Backend-selection fallback paths (§4). A real WebGL2 path needs a GPU
// and is covered by Playwright; these tests pin the graceful degradation.

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Diagnostic } from '../model/diagnostics';
import { LineBuffer } from '../scene/buffers';
import { createBaseRenderer, createCanvas2DRenderer } from './createRenderer';

interface FakeCanvas {
  getContext: ReturnType<typeof vi.fn>;
  width: number;
  height: number;
}

const fake2dContext = {} as CanvasRenderingContext2D;

function fakeCanvas(
  contexts: Partial<Record<string, unknown>> = { '2d': fake2dContext },
): FakeCanvas {
  return {
    width: 0,
    height: 0,
    getContext: vi.fn((id: string) => contexts[id] ?? null),
  };
}

/** A freshCanvas() that hands out the given canvases in order. */
function canvases(...list: FakeCanvas[]) {
  const handed: FakeCanvas[] = [];
  const freshCanvas = () => {
    const next = list[handed.length] ?? fakeCanvas();
    handed.push(next);
    return next as unknown as HTMLCanvasElement;
  };
  return { freshCanvas, handed };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createBaseRenderer (§4 backend selection)', () => {
  it('returns Canvas2D without trying WebGL when preference is canvas2d', () => {
    const { freshCanvas, handed } = canvases(fakeCanvas());
    const renderer = createBaseRenderer({
      preference: 'canvas2d',
      freshCanvas,
      onDiagnostic: () => {},
    });
    expect(renderer.backend).toBe('canvas2d');
    expect(handed).toHaveLength(1);
    expect(handed[0]!.getContext).not.toHaveBeenCalledWith(
      'webgl2',
      expect.anything(),
    );
  });

  it('falls back to Canvas2D when the WebGL2 API does not exist, reporting an explicit preference', () => {
    const reported: Diagnostic[] = [];
    const renderer = createBaseRenderer({
      preference: 'webgl',
      freshCanvas: canvases().freshCanvas,
      onDiagnostic: (d) => reported.push(d),
    });
    expect(renderer.backend).toBe('canvas2d');
    expect(reported.map((d) => d.code)).toEqual(['renderer-fallback']);
  });

  it("falls back silently under 'auto' when no WebGL2 context is granted", () => {
    vi.stubGlobal('WebGL2RenderingContext', class {});
    const reported: Diagnostic[] = [];
    const renderer = createBaseRenderer({
      preference: 'auto',
      freshCanvas: canvases().freshCanvas,
      onDiagnostic: (d) => reported.push(d),
    });
    expect(renderer.backend).toBe('canvas2d');
    expect(reported).toEqual([]);
  });

  it('draws Canvas2D on a fresh canvas when WebGL setup fails after the context was created', () => {
    class FakeWebGL2 {
      getExtension(): null {
        return null;
      }
    }
    vi.stubGlobal('WebGL2RenderingContext', FakeWebGL2);
    // The first canvas grants a (fake) WebGL2 context on which the renderer
    // setup throws; that canvas is then bound to WebGL and can't give a 2D
    // context, so the fallback must use a second canvas.
    const glOnly = fakeCanvas({ webgl2: new FakeWebGL2() });
    const { freshCanvas, handed } = canvases(glOnly, fakeCanvas());
    const reported: Diagnostic[] = [];
    const renderer = createBaseRenderer({
      preference: 'auto',
      freshCanvas,
      onDiagnostic: (d) => reported.push(d),
    });
    expect(renderer.backend).toBe('canvas2d');
    expect(handed).toHaveLength(2);
    expect(reported.map((d) => d.code)).toEqual(['renderer-fallback']);
  });

  it('asks for failIfMajorPerformanceCaveat only in auto mode', () => {
    vi.stubGlobal('WebGL2RenderingContext', class {});
    const attrs: WebGLContextAttributes[] = [];
    const probe = (): FakeCanvas => ({
      width: 0,
      height: 0,
      getContext: vi.fn((id: string, a?: WebGLContextAttributes) => {
        if (id === 'webgl2' && a) attrs.push(a);
        return id === '2d' ? fake2dContext : null;
      }),
    });
    for (const preference of ['auto', 'webgl'] as const) {
      createBaseRenderer({
        preference,
        freshCanvas: canvases(probe(), probe()).freshCanvas,
        onDiagnostic: () => {},
      });
    }
    expect(attrs.map((a) => a.failIfMajorPerformanceCaveat)).toEqual([
      true,
      false,
    ]);
  });
});

describe('createCanvas2DRenderer', () => {
  it('degrades to a no-op renderer when there is no 2D context', () => {
    const reported: Diagnostic[] = [];
    const renderer = createCanvas2DRenderer(
      fakeCanvas({}) as unknown as HTMLCanvasElement,
      (d) => reported.push(d),
    );
    expect(renderer.backend).toBe('none');
    expect(() => renderer.drawLines(new LineBuffer('#fff', 1))).not.toThrow();
    expect(renderer.measureText('abcd', '10px x').width).toBeGreaterThan(0);
    expect(reported.map((d) => d.code)).toEqual(['renderer-fallback']);
  });
});
