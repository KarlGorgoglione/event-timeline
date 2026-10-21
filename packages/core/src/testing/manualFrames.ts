// A FrameSource driven by hand, so tests decide exactly when frames run.

import type { FrameSource } from '../engine/scheduler';

export class ManualFrames implements FrameSource {
  private queue = new Map<number, () => void>();
  private next = 1;

  request(callback: () => void): number {
    const handle = this.next++;
    this.queue.set(handle, callback);
    return handle;
  }

  cancel(handle: number): void {
    this.queue.delete(handle);
  }

  get pending(): number {
    return this.queue.size;
  }

  /** Run every queued frame callback (one animation frame). */
  run(): void {
    const callbacks = [...this.queue.values()];
    this.queue.clear();
    for (const callback of callbacks) callback();
  }
}
