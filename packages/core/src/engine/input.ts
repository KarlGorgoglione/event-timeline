// Pointer and keyboard intents → camera, hover and selection (DESIGN.md §9).
//
// The PointerController and interpretKey translate raw DOM input into
// intents; this class applies them: camera moves go through the ViewModel
// (the Camera stays the single source of coordinate truth), hover is
// coalesced to one hit-test per overlay frame, and clicks update the
// selection or expand a cluster.

import type { HitResult } from '../interaction/hit';
import { interpretKey } from '../interaction/keyboard';
import { PointerController, type PointerHost } from '../interaction/pointer';
import type { SelectionItem, SelectionModel } from '../interaction/selection';
import type { BasePainter } from './basePainter';
import type { EngineConfig } from './options';
import type { ViewModel } from './view';

export interface InputDeps<TData> {
  view: ViewModel<TData>;
  base: BasePainter<TData>;
  selection: SelectionModel;
  config: () => EngineConfig<TData>;
  /** The camera moved: redraw and report the viewport. */
  onCameraChange: () => void;
  /** Hover changed or needs resolving: redraw the overlay. */
  onOverlayChange: () => void;
  onHover: (hit: HitResult<TData> | null) => void;
  onClick: (
    hit: HitResult<TData>,
    modifiers: { ctrlOrMeta: boolean; shift: boolean },
  ) => void;
  onSelectionChange: () => void;
  expandCluster: (hit: Extract<HitResult<TData>, { kind: 'cluster' }>) => void;
  /** Frame the data (keyboard `0`). */
  fit: () => void;
  /** Clear the selection (keyboard Escape). */
  clearSelection: () => void;
}

export class InputController<TData> implements PointerHost {
  hovered: HitResult<TData> | null = null;
  /** The hovered target's index in the current base frame, or −1. */
  hoveredTarget = -1;
  private hoveredKey: string | null = null;
  private pointerAt: { x: number; y: number } | null = null;
  private pointer: PointerController | null = null;
  private keyTarget: HTMLElement | null = null;

  constructor(private readonly deps: InputDeps<TData>) {}

  attach(element: HTMLElement): void {
    this.detach();
    this.pointer = new PointerController(
      element,
      this,
      () => this.deps.config().pointerButtons,
    );
    element.addEventListener('keydown', this.onKeyDown);
    this.keyTarget = element;
  }

  detach(): void {
    this.pointer?.dispose();
    this.pointer = null;
    this.keyTarget?.removeEventListener('keydown', this.onKeyDown);
    this.keyTarget = null;
  }

  /** The surface moved or resized: pointer positions must re-measure it. */
  invalidateRect(): void {
    this.pointer?.invalidateRect();
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (!this.deps.config().keyboard) return;
    const intent = interpretKey(e);
    if (intent === null) return;
    e.preventDefault();
    const { view } = this.deps;
    const { metrics } = this.deps.config();
    switch (intent.kind) {
      case 'pan':
        this.panBy(-intent.fraction * view.viewport.cssWidth, 0);
        break;
      case 'scroll': {
        const step = intent.page
          ? Math.max(1, view.viewport.cssHeight - metrics.headerHeight)
          : metrics.rowHeight + metrics.rowGap;
        this.scrollBy(intent.rows * step);
        break;
      }
      case 'zoom':
        this.zoomBy(intent.factor, view.viewport.cssWidth / 2);
        break;
      case 'fit':
        this.deps.fit();
        break;
      case 'clearSelection':
        this.deps.clearSelection();
        break;
    }
  };

  panBy(dx: number, dy: number): void {
    this.deps.view.panBy(dx, dy);
    this.deps.onCameraChange();
  }

  zoomBy(factor: number, cursorX: number): void {
    this.deps.view.zoomBy(factor, cursorX);
    this.deps.onCameraChange();
  }

  scrollBy(dy: number): void {
    this.deps.view.panBy(0, -dy);
    this.deps.onCameraChange();
  }

  hoverAt(x: number, y: number): void {
    // Coalesced: keep the latest position; the overlay frame resolves it.
    this.pointerAt = { x, y };
    this.deps.onOverlayChange();
  }

  leave(): void {
    this.pointerAt = null;
    this.clearHover();
  }

  /** Forget the hover (the pointer left, or the hovered item went away). */
  clearHover(): void {
    this.hoveredTarget = -1;
    if (this.hovered === null) return;
    this.hovered = null;
    this.hoveredKey = null;
    this.deps.onHover(null);
    this.deps.onOverlayChange();
  }

  /**
   * Re-run the hit-test at the last pointer position against the current
   * frame (it may have moved under a still pointer) and emit on change.
   */
  resolveHover(): void {
    if (this.pointerAt === null) {
      this.hoveredTarget = -1;
      return;
    }
    const index = this.deps.base.hitTest(this.pointerAt.x, this.pointerAt.y);
    this.hoveredTarget = index;
    // The key is cheap; the hit (a cluster lists its events) is built only
    // when the hover actually changed.
    const key = index < 0 ? null : this.deps.base.hitKey(index);
    if (key !== this.hoveredKey) {
      this.hovered = index < 0 ? null : this.deps.base.hitResult(index);
      this.hoveredKey = key;
      this.deps.onHover(this.hovered);
    }
  }

  clickAt(
    x: number,
    y: number,
    mods: { ctrlOrMeta: boolean; shift: boolean },
  ): void {
    const index = this.deps.base.hitTest(x, y);
    const hit = index < 0 ? null : this.deps.base.hitResult(index);
    if (hit !== null) this.deps.onClick(hit, mods);

    const { multiSelect } = this.deps.config();
    // A plain click on a cluster expands it; with the multi-select modifier it
    // toggles all of its members in the selection instead.
    if (hit?.kind === 'cluster' && !(multiSelect && mods.ctrlOrMeta)) {
      this.deps.expandCluster(hit);
      return;
    }
    if (this.deps.selection.click(selectionItems(hit), mods, multiSelect)) {
      this.deps.onSelectionChange();
    }
  }
}

function selectionItems(hit: HitResult | null): SelectionItem[] {
  if (hit === null) return [];
  switch (hit.kind) {
    case 'element':
      return [{ kind: 'element', id: hit.element.id }];
    case 'event':
      return [{ kind: 'event', id: hit.event.id }];
    case 'cluster':
      return hit.events.map((e) => ({ kind: 'event', id: e.id }));
  }
}
