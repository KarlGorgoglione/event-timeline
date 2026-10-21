// Backend selection for the base layer (DESIGN.md §4).
//
// `'auto'` (the default) picks WebGL2 when it is available *and* hardware
// accelerated — on software GL (e.g. SwiftShader) Canvas2D is typically
// faster, so it asks for failIfMajorPerformanceCaveat. An explicit `'webgl'`
// drops that flag. Every failure path degrades: WebGL → Canvas2D → a renderer
// that draws nothing, so a broken environment never throws out of the engine.
//
// A canvas is bound to its first context type for life, so each attempt runs
// on a fresh canvas supplied by the caller (the engine owns its canvases).

import type { OnDiagnostic } from '../model/diagnostics';
import { tryCanvas2D } from './canvas2d';
import { NullRenderer } from './nullRenderer';
import type { Renderer, RendererPreference } from './types';
import { WebGLRenderer } from './webgl/webglRenderer';
import { GL_CONTEXT_ATTRIBUTES } from './webgl/resources';

export interface CreateBaseRendererOptions {
  preference: RendererPreference;
  /** Returns a new canvas installed in the base slot, replacing any earlier one. */
  freshCanvas: () => HTMLCanvasElement;
  /** Invoked after a lost WebGL context is restored; the host should redraw. */
  onContextRestored?: () => void;
  /** Invoked when the WebGL context is lost (the host may fall back). */
  onContextLost?: () => void;
  onDiagnostic: OnDiagnostic;
}

export function createBaseRenderer(
  options: CreateBaseRendererOptions,
): Renderer {
  const { preference, freshCanvas, onDiagnostic } = options;
  if (preference !== 'canvas2d') {
    const webgl = tryWebGL(freshCanvas(), preference, options);
    if (webgl !== null) return webgl;
  }
  return createCanvas2DRenderer(freshCanvas(), onDiagnostic);
}

/** The Canvas2D renderer for `canvas`, or a no-op renderer when it has no 2D context. */
export function createCanvas2DRenderer(
  canvas: HTMLCanvasElement,
  onDiagnostic: OnDiagnostic,
): Renderer {
  const renderer = tryCanvas2D(canvas);
  if (renderer !== null) return renderer;
  onDiagnostic({
    code: 'renderer-fallback',
    kind: 'renderer',
    reason: 'no 2D canvas context is available; nothing will be drawn',
  });
  return new NullRenderer();
}

function tryWebGL(
  canvas: HTMLCanvasElement,
  preference: RendererPreference,
  options: CreateBaseRendererOptions,
): Renderer | null {
  // Explicit WebGL that can't be honoured is worth reporting; 'auto' falling
  // back on a machine without hardware GL is the expected path.
  const report = (reason: string): void => {
    if (preference !== 'webgl') return;
    options.onDiagnostic({
      code: 'renderer-fallback',
      kind: 'renderer',
      reason,
    });
  };
  if (typeof WebGL2RenderingContext === 'undefined') {
    report('WebGL2 is not supported here; using Canvas2D');
    return null;
  }
  let gl: WebGL2RenderingContext | null = null;
  try {
    const context = canvas.getContext('webgl2', {
      ...GL_CONTEXT_ATTRIBUTES,
      failIfMajorPerformanceCaveat: preference === 'auto',
    });
    gl = context instanceof WebGL2RenderingContext ? context : null;
  } catch {
    gl = null;
  }
  if (gl === null) {
    report('could not create a WebGL2 context; using Canvas2D');
    return null;
  }
  try {
    return new WebGLRenderer(canvas, gl, {
      onContextRestored: options.onContextRestored,
      onContextLost: options.onContextLost,
      onDiagnostic: options.onDiagnostic,
    });
  } catch (error) {
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    options.onDiagnostic({
      code: 'renderer-fallback',
      kind: 'renderer',
      reason: `WebGL2 setup failed (${error instanceof Error ? error.message : String(error)}); using Canvas2D`,
    });
    return null;
  }
}
