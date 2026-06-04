// rAF render loop with per-layer dirty flags (DESIGN.md §4).
//
// Nothing redraws unless a layer is marked dirty — there is no continuous
// repaint. Multiple markDirty calls before a frame coalesce into one render.
// rAF is referenced lazily (inside markDirty) so the module is import-safe in
// SSR environments.

import type { Layer } from '../render/types';

export interface DirtyFlags {
  base: boolean;
  overlay: boolean;
}

export class FrameScheduler {
  private dirty: DirtyFlags = { base: false, overlay: false };
  private frameHandle: number | null = null;
  private disposed = false;

  constructor(private readonly render: (dirty: DirtyFlags) => void) {}

  markDirty(layer: Layer): void {
    if (this.disposed) return;
    this.dirty[layer] = true;
    if (this.frameHandle === null) {
      this.frameHandle = requestAnimationFrame(() => this.tick());
    }
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
      cancelAnimationFrame(this.frameHandle);
      this.frameHandle = null;
    }
  }
}
