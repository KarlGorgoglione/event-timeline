// Backend selection for the Renderer seam (DESIGN.md §4, §16).
//
// `'auto'` (the default) picks WebGL2 when it is available *and* hardware
// accelerated — on software GL (e.g. SwiftShader) Canvas2D is typically
// faster, so the probe sets failIfMajorPerformanceCaveat. An explicit
// `'webgl'` preference drops that flag and forces WebGL2 whenever the API
// exists. Every failure path falls back to Canvas2D (lenient, §1): a renderer
// that draws beats a thrown error.
//
// A canvas is permanently bound to its first context type, so the probe runs
// on a scratch canvas first; the real canvases are only touched once the
// scratch probe succeeds.

import { Canvas2DRenderer } from './canvas2d';
import type { Renderer, RendererPreference } from './types';
import { GL_CONTEXT_ATTRIBUTES } from './webgl/layer';
import { WebGLRenderer } from './webgl/webglRenderer';

export interface CreateRendererOptions {
  /** Backend preference (§4). Default `'auto'`. */
  preference?: RendererPreference;
  /** Invoked after a lost WebGL context is restored; the host should redraw. */
  onContextRestored?: () => void;
}

export function createRenderer(
  baseCanvas: HTMLCanvasElement,
  overlayCanvas: HTMLCanvasElement,
  background: string,
  options: CreateRendererOptions = {},
): Renderer {
  const preference = options.preference ?? 'auto';
  if (preference !== 'canvas2d' && webgl2Probes(baseCanvas, preference)) {
    const attrs: WebGLContextAttributes = {
      ...GL_CONTEXT_ATTRIBUTES,
      failIfMajorPerformanceCaveat: preference === 'auto',
    };
    // Acquire both contexts before constructing any GL resource, so a mixed
    // failure can release the half-acquired context and still fall back.
    const baseGl = getWebGL2(baseCanvas, attrs);
    const overlayGl = getWebGL2(overlayCanvas, attrs);
    if (baseGl !== null && overlayGl !== null) {
      try {
        return new WebGLRenderer(
          baseCanvas,
          baseGl,
          overlayCanvas,
          overlayGl,
          background,
          options.onContextRestored,
        );
      } catch {
        // Deliberately no loseContext here: the canvases are webgl-bound for
        // life either way, and a later rebuild on them can only succeed if
        // their contexts are still usable. Fall through to Canvas2D, which
        // throws a descriptive error on a webgl-bound canvas.
      }
    }
  }
  return new Canvas2DRenderer(baseCanvas, overlayCanvas, background);
}

/** Probe WebGL2 on a scratch canvas, never committing the real ones. */
function webgl2Probes(
  baseCanvas: HTMLCanvasElement,
  preference: RendererPreference,
): boolean {
  // Instant out in SSR/jsdom, where the API doesn't exist at all.
  if (typeof WebGL2RenderingContext === 'undefined') return false;
  try {
    const scratch = baseCanvas.ownerDocument.createElement('canvas');
    const gl = scratch.getContext('webgl2', {
      ...GL_CONTEXT_ATTRIBUTES,
      failIfMajorPerformanceCaveat: preference === 'auto',
    });
    if (gl === null || !(gl instanceof WebGL2RenderingContext)) return false;
    releaseContext(gl);
    return true;
  } catch {
    return false;
  }
}

function getWebGL2(
  canvas: HTMLCanvasElement,
  attrs: WebGLContextAttributes,
): WebGL2RenderingContext | null {
  try {
    const gl = canvas.getContext('webgl2', attrs);
    return gl instanceof WebGL2RenderingContext ? gl : null;
  } catch {
    return null;
  }
}

function releaseContext(gl: WebGL2RenderingContext | null): void {
  gl?.getExtension('WEBGL_lose_context')?.loseContext();
}
