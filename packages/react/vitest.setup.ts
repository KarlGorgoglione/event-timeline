import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// jsdom has no canvas 2D context, ResizeObserver, or rAF; the engine touches
// all three on mount. Stub them minimally so the React binding mounts. Pixel
// output is verified by Playwright golden tests, not these unit tests (§14).

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
if (!('ResizeObserver' in globalThis)) {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver =
    ResizeObserverStub;
}

if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) =>
    setTimeout(
      () => cb(performance.now()),
      0,
    ) as unknown as number) as typeof requestAnimationFrame;
  globalThis.cancelAnimationFrame = ((handle: number) =>
    clearTimeout(handle)) as typeof cancelAnimationFrame;
}

const context2DStub: Partial<CanvasRenderingContext2D> = {
  fillRect: () => {},
  clearRect: () => {},
  beginPath: () => {},
  moveTo: () => {},
  lineTo: () => {},
  stroke: () => {},
  fillText: () => {},
  measureText: ((text: string) => ({
    width: text.length * 6,
  })) as CanvasRenderingContext2D['measureText'],
};
// Only the '2d' id yields the stub: a WebGL2 probe must see null here, like
// real jsdom, so the renderer factory falls back to Canvas2D (§4).
HTMLCanvasElement.prototype.getContext = ((contextId: string) =>
  contextId === '2d'
    ? context2DStub
    : null) as unknown as HTMLCanvasElement['getContext'];

// Unmount React trees between tests so the jsdom DOM stays isolated.
afterEach(() => {
  cleanup();
});
