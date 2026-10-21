// Render loop with per-layer dirty flags (DESIGN.md §4).
//
// Nothing redraws unless a layer is marked dirty — there is no continuous
// repaint. Multiple markDirty calls before a frame coalesce into one render.
// The frame source is injectable (requestAnimationFrame by default) so tests
// and headless hosts can drive frames by hand; rAF is only referenced when a
// frame is requested, keeping the module import-safe under SSR.

export type Layer = 'base' | 'overlay';

export interface DirtyFlags {
  base: boolean;
  overlay: boolean;
}

/** Schedules frame callbacks: `requestAnimationFrame` or a test double. */
export interface FrameSource {
  request(callback: () => void): number;
  cancel(handle: number): void;
}

export const animationFrameSource: FrameSource = {
  request: (callback) => requestAnimationFrame(() => callback()),
  cancel: (handle) => cancelAnimationFrame(handle),
};

export class FrameScheduler {
  private dirty: DirtyFlags = { base: false, overlay: false };
  private frameHandle: number | null = null;
  private disposed = false;

  constructor(
    private readonly render: (dirty: DirtyFlags) => void,
    private readonly source: FrameSource = animationFrameSource,
  ) {}

  markDirty(layer: Layer): void {
    if (this.disposed) return;
    this.dirty[layer] = true;
    if (this.frameHandle === null) {
      this.frameHandle = this.source.request(() => this.tick());
    }
  }

  /** Whether a layer is waiting to be drawn. */
  get pending(): boolean {
    return this.dirty.base || this.dirty.overlay;
  }

  /** Draw the pending layers now instead of on the next frame. */
  flush(): void {
    if (this.frameHandle !== null) {
      this.source.cancel(this.frameHandle);
    }
    this.tick();
  }

  private tick(): void {
    this.frameHandle = null;
    if (this.disposed) return;
    const dirty = this.dirty;
    this.dirty = { base: false, overlay: false };
    if (dirty.base || dirty.overlay) {
      this.render(dirty);
    }
  }

  dispose(): void {
    this.disposed = true;
    if (this.frameHandle !== null) {
      this.source.cancel(this.frameHandle);
      this.frameHandle = null;
    }
  }
}
