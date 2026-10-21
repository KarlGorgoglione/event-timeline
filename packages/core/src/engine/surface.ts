// The engine's DOM surface (DESIGN.md §2, §3, §4).
//
// `mount(container)` hands the engine a host element; the engine creates its
// own wrapper and two stacked canvases inside it. Owning the canvases lets the
// engine pick a backend per canvas, start over on a fresh canvas when WebGL
// fails or the preference changes (a canvas is bound to its first context type
// for life), and size the backing store from the same box the canvases fill.
// With `autoResize` it also follows the wrapper's size and the device pixel
// ratio, and draws synchronously on resize so a resize never shows a blank
// frame.

export interface SurfaceOptions {
  /** Accessible name for the timeline region. */
  label: string;
  /** Optional longer text summary exposed to assistive technology. */
  description?: string;
}

export interface SurfaceHost {
  onResize(cssWidth: number, cssHeight: number, dpr: number): void;
}

const LAYER_STYLE =
  'position:absolute;inset:0;width:100%;height:100%;display:block';
const VISUALLY_HIDDEN =
  'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap';

export class Surface {
  readonly root: HTMLDivElement;
  readonly overlayCanvas: HTMLCanvasElement;
  private baseCanvas: HTMLCanvasElement | null = null;
  private readonly description: HTMLDivElement;
  private observer: ResizeObserver | null = null;
  private dprQuery: MediaQueryList | null = null;
  private cssWidth = 0;
  private cssHeight = 0;

  constructor(
    private readonly container: HTMLElement,
    options: SurfaceOptions,
    private readonly host: SurfaceHost,
  ) {
    const doc = container.ownerDocument;
    this.root = doc.createElement('div');
    this.root.style.cssText =
      'position:relative;width:100%;height:100%;overflow:hidden;outline:none';
    this.root.tabIndex = 0;
    this.root.setAttribute('role', 'application');
    this.root.setAttribute('aria-roledescription', 'timeline');
    this.root.dataset.timelineRoot = '';

    this.description = doc.createElement('div');
    this.description.style.cssText = VISUALLY_HIDDEN;
    this.description.id = uniqueId(doc);
    this.root.appendChild(this.description);

    this.overlayCanvas = this.makeCanvas();
    this.root.appendChild(this.overlayCanvas);
    this.setLabels(options.label, options.description);
    container.appendChild(this.root);
  }

  /** Install a new, context-less base canvas under the overlay and return it. */
  freshBaseCanvas(): HTMLCanvasElement {
    const canvas = this.makeCanvas();
    if (this.baseCanvas !== null) this.baseCanvas.replaceWith(canvas);
    else this.root.insertBefore(canvas, this.overlayCanvas);
    this.baseCanvas = canvas;
    return canvas;
  }

  setLabels(label: string, description?: string): void {
    this.root.setAttribute('aria-label', label);
    this.description.textContent = description ?? '';
    if (description) {
      this.root.setAttribute('aria-describedby', this.description.id);
    } else {
      this.root.removeAttribute('aria-describedby');
    }
  }

  /** The current CSS size of the wrapper, measured now. */
  measure(): { width: number; height: number } {
    const rect = this.root.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  }

  private makeCanvas(): HTMLCanvasElement {
    const canvas = this.root.ownerDocument.createElement('canvas');
    canvas.style.cssText = LAYER_STYLE;
    canvas.setAttribute('aria-hidden', 'true');
    return canvas;
  }

  /**
   * Follow the wrapper's size and the device pixel ratio, reporting the
   * current size at once and every change after it.
   */
  observe(): void {
    const view = this.root.ownerDocument.defaultView;
    const emit = (): void =>
      this.host.onResize(this.cssWidth, this.cssHeight, currentDpr(view));
    if (typeof ResizeObserver !== 'undefined') {
      this.observer = new ResizeObserver((entries) => {
        const rect = entries[entries.length - 1]?.contentRect;
        if (rect === undefined) return;
        this.cssWidth = rect.width;
        this.cssHeight = rect.height;
        emit();
      });
      this.observer.observe(this.root);
    }
    // A DPR change without a size change (dragging the window to another
    // monitor, browser zoom) fires no resize; watch the resolution instead.
    const watchDpr = (): void => {
      if (view === null || typeof view.matchMedia !== 'function') return;
      this.dprQuery?.removeEventListener('change', onDprChange);
      this.dprQuery = view.matchMedia(`(resolution: ${currentDpr(view)}dppx)`);
      this.dprQuery.addEventListener('change', onDprChange);
    };
    const onDprChange = (): void => {
      watchDpr();
      emit();
    };
    this.unwatchDpr = () =>
      this.dprQuery?.removeEventListener('change', onDprChange);
    watchDpr();

    const { width, height } = this.measure();
    this.cssWidth = width;
    this.cssHeight = height;
    emit();
  }

  private unwatchDpr: () => void = () => {};

  dispose(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.unwatchDpr();
    this.root.remove();
  }
}

function currentDpr(view: Window | null): number {
  return view?.devicePixelRatio || 1;
}

let idCounter = 0;
function uniqueId(doc: Document): string {
  let id: string;
  do {
    id = `timeline-description-${++idCounter}`;
  } while (doc.getElementById(id) !== null);
  return id;
}
