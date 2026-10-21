import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// jsdom has no canvas 2D context, ResizeObserver, rAF or pointer capture; the
// engine touches all of them once mounted. Stub them minimally so the binding
// mounts and draws into nothing. Pixels are verified by Playwright (§14).

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

// Every 2D method is a no-op except measureText (6 px per character).
const context2DStub = new Proxy(
  {
    measureText: (text: string) => ({ width: text.length * 6 }),
  } as Record<string | symbol, unknown>,
  {
    get: (target, key) => (key in target ? target[key] : () => {}),
    set: () => true,
  },
);
// Only the '2d' id yields the stub: WebGL2 must see null here, like real
// jsdom, so the engine falls back to Canvas2D (§4).
HTMLCanvasElement.prototype.getContext = ((contextId: string) =>
  contextId === '2d'
    ? context2DStub
    : null) as unknown as HTMLCanvasElement['getContext'];

HTMLElement.prototype.setPointerCapture = () => {};
HTMLElement.prototype.releasePointerCapture = () => {};
HTMLElement.prototype.hasPointerCapture = () => false;

// Unmount React trees between tests so the jsdom DOM stays isolated.
afterEach(() => {
  cleanup();
});
