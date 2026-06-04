import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FrameScheduler } from './scheduler';

// A controllable rAF: callbacks queue and only run when flushFrame() is called.
let queued: Array<() => void>;
let nextHandle: number;

function flushFrame() {
  const toRun = queued;
  queued = [];
  for (const cb of toRun) cb();
}

beforeEach(() => {
  queued = [];
  nextHandle = 1;
  vi.stubGlobal('requestAnimationFrame', (cb: () => void) => {
    queued.push(cb);
    return nextHandle++;
  });
  vi.stubGlobal('cancelAnimationFrame', (handle: number) => {
    // Single pending frame in these tests; clearing the queue is sufficient.
    void handle;
    queued = [];
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('FrameScheduler', () => {
  it('coalesces multiple markDirty calls into one render', () => {
    const render = vi.fn();
    const scheduler = new FrameScheduler(render);
    scheduler.markDirty('base');
    scheduler.markDirty('base');
    scheduler.markDirty('overlay');
    expect(render).not.toHaveBeenCalled(); // nothing until the frame runs
    flushFrame();
    expect(render).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenCalledWith({ base: true, overlay: true });
  });

  it('resets dirty flags after a frame and reschedules on the next mark', () => {
    const render = vi.fn();
    const scheduler = new FrameScheduler(render);
    scheduler.markDirty('base');
    flushFrame();
    scheduler.markDirty('overlay');
    flushFrame();
    expect(render).toHaveBeenNthCalledWith(1, { base: true, overlay: false });
    expect(render).toHaveBeenNthCalledWith(2, { base: false, overlay: true });
  });

  it('does not render after dispose cancels a pending frame', () => {
    const render = vi.fn();
    const scheduler = new FrameScheduler(render);
    scheduler.markDirty('base');
    scheduler.dispose();
    flushFrame();
    expect(render).not.toHaveBeenCalled();
  });
});
