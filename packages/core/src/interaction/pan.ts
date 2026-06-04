// Basic pan pointer state machine (DESIGN.md §9 — Pan only for Phase 1).
//
// Translates pointer drags into camera pan calls. It never does pixel→time
// arithmetic itself — that lives only on the Camera (single source of
// coordinate truth, §3). Vertical scroll (wheel) and zoom arrive in Phase 3, so
// Phase 1 pans horizontally only.

import type { Camera } from '../scale/camera';

export interface PanControllerDeps {
  camera: Camera;
  /** Called after each pan step so the engine can mark dirty + emit. */
  onPan: () => void;
}

type State = 'idle' | 'panning';

export class PanController {
  private state: State = 'idle';
  private lastX = 0;
  private activePointer: number | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly deps: PanControllerDeps,
  ) {
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerUp);
  }

  private readonly onPointerDown = (e: PointerEvent): void => {
    if (this.state === 'panning') return;
    this.state = 'panning';
    this.activePointer = e.pointerId;
    this.lastX = e.clientX;
    this.canvas.setPointerCapture(e.pointerId);
  };

  private readonly onPointerMove = (e: PointerEvent): void => {
    if (this.state !== 'panning' || e.pointerId !== this.activePointer) return;
    const dx = e.clientX - this.lastX;
    this.lastX = e.clientX;
    if (dx !== 0) {
      this.deps.camera.panByPixels(dx, 0);
      this.deps.onPan();
    }
  };

  private readonly onPointerUp = (e: PointerEvent): void => {
    if (e.pointerId !== this.activePointer) return;
    this.state = 'idle';
    this.activePointer = null;
    if (this.canvas.hasPointerCapture(e.pointerId)) {
      this.canvas.releasePointerCapture(e.pointerId);
    }
  };

  dispose(): void {
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointercancel', this.onPointerUp);
  }
}
