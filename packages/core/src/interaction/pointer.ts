// Pointer + wheel state machine (DESIGN.md §9).
//
// A pure input translator: it turns raw DOM pointer/wheel events into the
// high-level intents of §9 (pan, zoom, scroll, hover, click) and forwards them
// to an injected `PointerHost`. It performs NO coordinate or zoom arithmetic of
// its own — pixel deltas and canvas-local screen coords go to the host, and the
// engine/Camera own the math (single source of coordinate truth, §3). A small
// drag threshold separates a click from a pan so selection and panning don't
// fight. Hover positions are forwarded raw; the engine coalesces them to one
// hit-test per animation frame (§9).

import { interpretWheel } from './wheel';

/** Semantic intents the controller emits; the engine applies them. */
export interface PointerHost {
  /** Drag by a pixel delta (horizontal time pan + vertical scroll). */
  panBy(dxCss: number, dyCss: number): void;
  /** Zoom about the cursor by a multiplicative factor (§3). */
  zoomBy(factor: number, cursorX: number): void;
  /** Vertical scroll by a pixel delta. */
  scrollBy(dyCss: number): void;
  /** Pointer moved while not dragging — request a (coalesced) hit-test. */
  hoverAt(x: number, y: number): void;
  /** A click (press+release without a drag) at a point, with modifiers. */
  clickAt(
    x: number,
    y: number,
    mods: { ctrlOrMeta: boolean; shift: boolean },
  ): void;
  /** The pointer left the canvas — clear any hover. */
  leave(): void;
}

/** CSS px the pointer must move before a press becomes a pan rather than a click. */
const DRAG_THRESHOLD_PX = 4;

type State = 'idle' | 'down' | 'panning';

export class PointerController {
  private state: State = 'idle';
  private activePointer: number | null = null;
  private lastX = 0;
  private lastY = 0;
  private downX = 0;
  private downY = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly host: PointerHost,
  ) {
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerCancel);
    canvas.addEventListener('pointerleave', this.onPointerLeave);
    // `passive: false` so wheel zoom/pan can preventDefault the page scroll.
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
  }

  /**
   * Convert a client position to canvas-local CSS px. Reads the bounding rect
   * once per call (one layout flush) — hover runs on every move, so the two
   * coords must not each force a separate reflow.
   */
  private local(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  private readonly onPointerDown = (e: PointerEvent): void => {
    if (this.state !== 'idle') return;
    this.state = 'down';
    this.activePointer = e.pointerId;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.downX = e.clientX;
    this.downY = e.clientY;
    this.canvas.setPointerCapture(e.pointerId);
  };

  private readonly onPointerMove = (e: PointerEvent): void => {
    if (e.pointerId !== this.activePointer) {
      // Not dragging: a hover move. (When a drag is active, all moves belong to
      // it via pointer capture, so this branch only runs for true hovers.)
      if (this.state === 'idle') {
        const { x, y } = this.local(e.clientX, e.clientY);
        this.host.hoverAt(x, y);
      }
      return;
    }

    if (this.state === 'down') {
      const movedFar =
        Math.abs(e.clientX - this.downX) > DRAG_THRESHOLD_PX ||
        Math.abs(e.clientY - this.downY) > DRAG_THRESHOLD_PX;
      if (!movedFar) return;
      this.state = 'panning';
      // A drag has begun: drop any hover so the highlight/tooltip doesn't linger
      // at the stale press position while the content pans under it. (Wheel
      // zoom/scroll keep hover live — the cursor stays put there.)
      this.host.leave();
    }

    if (this.state === 'panning') {
      const dx = e.clientX - this.lastX;
      const dy = e.clientY - this.lastY;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      if (dx !== 0 || dy !== 0) this.host.panBy(dx, dy);
    }
  };

  private readonly onPointerUp = (e: PointerEvent): void => {
    if (e.pointerId !== this.activePointer) return;
    // A press that never crossed the drag threshold is a click → hit-test.
    if (this.state === 'down') {
      const { x, y } = this.local(e.clientX, e.clientY);
      this.host.clickAt(x, y, {
        ctrlOrMeta: e.ctrlKey || e.metaKey,
        shift: e.shiftKey,
      });
    }
    this.release(e.pointerId);
  };

  private readonly onPointerCancel = (e: PointerEvent): void => {
    if (e.pointerId !== this.activePointer) return;
    this.release(e.pointerId);
  };

  private readonly onPointerLeave = (): void => {
    if (this.state === 'idle') this.host.leave();
  };

  private readonly onWheel = (e: WheelEvent): void => {
    const intent = interpretWheel(e, this.local(e.clientX, e.clientY).x);
    switch (intent.kind) {
      case 'zoom':
        e.preventDefault();
        this.host.zoomBy(intent.factor, intent.cursorX);
        break;
      case 'pan':
        e.preventDefault();
        this.host.panBy(intent.dxCss, 0);
        break;
      case 'scroll':
        e.preventDefault();
        this.host.scrollBy(intent.dyCss);
        break;
    }
  };

  private release(pointerId: number): void {
    this.state = 'idle';
    this.activePointer = null;
    if (this.canvas.hasPointerCapture(pointerId)) {
      this.canvas.releasePointerCapture(pointerId);
    }
  }

  dispose(): void {
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointercancel', this.onPointerCancel);
    this.canvas.removeEventListener('pointerleave', this.onPointerLeave);
    this.canvas.removeEventListener('wheel', this.onWheel);
  }
}
