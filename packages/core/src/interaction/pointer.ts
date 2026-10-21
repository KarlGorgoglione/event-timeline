// Pointer + wheel state machine (DESIGN.md §9).
//
// A pure input translator: it turns raw DOM pointer/wheel events into the
// high-level intents of §9 (pan, zoom, scroll, hover, click) and forwards them
// to an injected `PointerHost`. It performs NO coordinate or zoom arithmetic of
// its own — pixel deltas and canvas-local screen coords go to the host, and the
// engine/Camera own the math (single source of coordinate truth, §3). A small
// drag threshold separates a click from a pan so selection and panning don't
// fight. Two touch contacts pinch: their midpoint pans and their spread
// zooms about it. Hover positions are forwarded raw; the engine coalesces
// them to one hit-test per animation frame (§9).

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
/** Below this spread (CSS px) a pinch only pans: the zoom ratio is unstable. */
const MIN_PINCH_SPREAD_PX = 8;

type State = 'idle' | 'down' | 'panning' | 'pinching';

interface Point {
  x: number;
  y: number;
}

export class PointerController {
  private state: State = 'idle';
  /** The pointer driving a press or pan (one of `contacts`). */
  private activePointer: number | null = null;
  /** Captured pointers and their latest client positions. */
  private readonly contacts = new Map<number, Point>();
  private lastX = 0;
  private lastY = 0;
  private downX = 0;
  private downY = 0;
  // Pinch state: the previous spread and midpoint of the two contacts.
  private pinchSpread = 0;
  private pinchMid: Point = { x: 0, y: 0 };
  /**
   * The element's client rect, read once and reused: hover runs on every
   * move, and each read can force a layout. Dropped when the pointer enters,
   * on a press, when anything scrolls, and on resize.
   */
  private rect: DOMRect | null = null;

  private readonly priorTouchAction: string;

  /**
   * @param element the element that receives input (the engine's wrapper)
   * @param buttons mouse buttons (`PointerEvent.button`) that may pan or
   *   click; read on every press so the option can change at runtime. Touch
   *   and pen contacts report button 0.
   */
  constructor(
    private readonly canvas: HTMLElement,
    private readonly host: PointerHost,
    private readonly buttons: () => readonly number[] = () => [0],
  ) {
    // Without this the browser claims touch drags for page scrolling and
    // pinch-zooms the page, cancelling the pointer stream mid-gesture.
    this.priorTouchAction = canvas.style.touchAction;
    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerCancel);
    canvas.addEventListener('pointerenter', this.invalidateRect);
    canvas.addEventListener('pointerleave', this.onPointerLeave);
    // `passive: false` so wheel zoom/pan can preventDefault the page scroll.
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    // Any scroll (page or ancestor) moves the element under the pointer.
    canvas.ownerDocument.addEventListener('scroll', this.invalidateRect, {
      capture: true,
      passive: true,
    });
  }

  /** The element moved or resized: measure it again on the next event. */
  readonly invalidateRect = (): void => {
    this.rect = null;
  };

  /** Convert a client position to element-local CSS px. */
  private local(clientX: number, clientY: number): Point {
    const rect = (this.rect ??= this.canvas.getBoundingClientRect());
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  private readonly onPointerDown = (e: PointerEvent): void => {
    if (!this.buttons().includes(e.button)) return;
    if (this.state === 'idle') {
      this.rect = null;
      this.state = 'down';
      this.activePointer = e.pointerId;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.downX = e.clientX;
      this.downY = e.clientY;
      this.capture(e);
      return;
    }
    // A second contact on a touch screen turns the gesture into a pinch.
    if (
      (this.state === 'down' || this.state === 'panning') &&
      this.contacts.size === 1 &&
      e.pointerType !== 'mouse'
    ) {
      if (this.state === 'down') this.host.leave();
      this.state = 'pinching';
      this.capture(e);
      this.startPinch();
    }
  };

  private readonly onPointerMove = (e: PointerEvent): void => {
    const contact = this.contacts.get(e.pointerId);
    if (contact === undefined) {
      // Not pressed: a hover move. (Pressed pointers are captured, so their
      // moves all arrive here as contacts.)
      if (this.state === 'idle') {
        const { x, y } = this.local(e.clientX, e.clientY);
        this.host.hoverAt(x, y);
      }
      return;
    }
    contact.x = e.clientX;
    contact.y = e.clientY;

    if (this.state === 'pinching') {
      this.pinch();
      return;
    }
    if (e.pointerId !== this.activePointer) return;

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
    if (!this.contacts.has(e.pointerId)) return;
    if (this.state === 'pinching') {
      // One finger lifted: keep panning with the other (never a click).
      this.uncapture(e.pointerId);
      const [rest] = this.contacts;
      if (rest === undefined) {
        this.reset();
        return;
      }
      const [id, at] = rest;
      this.state = 'panning';
      this.activePointer = id;
      this.lastX = at.x;
      this.lastY = at.y;
      return;
    }
    // A press that never crossed the drag threshold is a click → hit-test.
    if (this.state === 'down' && e.pointerId === this.activePointer) {
      const { x, y } = this.local(e.clientX, e.clientY);
      this.host.clickAt(x, y, {
        ctrlOrMeta: e.ctrlKey || e.metaKey,
        shift: e.shiftKey,
      });
    }
    this.reset();
  };

  private readonly onPointerCancel = (e: PointerEvent): void => {
    if (this.contacts.has(e.pointerId)) this.reset();
  };

  private readonly onPointerLeave = (): void => {
    if (this.state === 'idle') this.host.leave();
  };

  private readonly onWheel = (e: WheelEvent): void => {
    const intent = interpretWheel(
      e,
      this.local(e.clientX, e.clientY).x,
      this.canvas.clientHeight || undefined,
    );
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

  /** Record the two contacts' spread and midpoint as the pinch reference. */
  private startPinch(): void {
    const [a, b] = this.contacts.values();
    if (a === undefined || b === undefined) return;
    this.pinchSpread = Math.hypot(b.x - a.x, b.y - a.y);
    this.pinchMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  /**
   * Follow the pinch: pan by the midpoint's travel, then zoom about the new
   * midpoint by the change in spread — so the content under the fingers
   * stays under them.
   */
  private pinch(): void {
    const [a, b] = this.contacts.values();
    if (a === undefined || b === undefined) return;
    const spread = Math.hypot(b.x - a.x, b.y - a.y);
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const dx = mid.x - this.pinchMid.x;
    const dy = mid.y - this.pinchMid.y;
    if (dx !== 0 || dy !== 0) this.host.panBy(dx, dy);
    if (
      spread >= MIN_PINCH_SPREAD_PX &&
      this.pinchSpread >= MIN_PINCH_SPREAD_PX &&
      spread !== this.pinchSpread
    ) {
      this.host.zoomBy(spread / this.pinchSpread, this.local(mid.x, mid.y).x);
    }
    this.pinchSpread = spread;
    this.pinchMid = mid;
  }

  private capture(e: PointerEvent): void {
    this.contacts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.canvas.setPointerCapture(e.pointerId);
  }

  private uncapture(pointerId: number): void {
    this.contacts.delete(pointerId);
    if (this.canvas.hasPointerCapture(pointerId)) {
      this.canvas.releasePointerCapture(pointerId);
    }
  }

  /** End the gesture, releasing every pressed pointer. */
  private reset(): void {
    for (const id of [...this.contacts.keys()]) this.uncapture(id);
    this.state = 'idle';
    this.activePointer = null;
  }

  dispose(): void {
    this.reset();
    this.canvas.style.touchAction = this.priorTouchAction;
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointercancel', this.onPointerCancel);
    this.canvas.removeEventListener('pointerenter', this.invalidateRect);
    this.canvas.removeEventListener('pointerleave', this.onPointerLeave);
    this.canvas.removeEventListener('wheel', this.onWheel);
    this.canvas.ownerDocument.removeEventListener(
      'scroll',
      this.invalidateRect,
      { capture: true },
    );
  }
}
