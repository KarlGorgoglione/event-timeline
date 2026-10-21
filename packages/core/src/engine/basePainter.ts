// Base-layer drawing and hit identity (DESIGN.md §4, §5).
//
// Wraps the frame builder with the engine's per-frame inputs: interned
// styles, cached text widths and icon loading. It keeps the last frame's hit
// targets for hover, click and the overlay until the next base draw; after a
// data change they are stale (their event indices may have shifted), so hit
// tests return nothing until the frame is redrawn.

import type { HitResult } from '../interaction/hit';
import { hitTest } from '../interaction/hitTest';
import type { RowLayout } from '../layout/positions';
import type { OnDiagnostic } from '../model/diagnostics';
import type { DataStore } from '../model/store';
import { IconCache, isIconUrl } from '../render/iconCache';
import type { Renderer } from '../render/types';
import type { IconResolution } from '../scene/context';
import { markerContentWidth } from '../scene/elements';
import { FrameBuilder } from '../scene/frame';
import { StyleTable } from '../scene/styles';
import { clusterMembers, HitGrid, TargetKind } from '../scene/targets';
import type { EngineConfig } from './options';
import type { ViewModel } from './view';

/**
 * Upper bound on the memoised `measureText` width cache (§4). The cap only
 * stops the labels of a long stream (which never calls `setData`) from piling
 * up; on overflow the cache is cleared and on-screen labels re-measure.
 */
const MEASURE_CACHE_MAX = 8192;

export interface BasePainterDeps<TData> {
  renderer: () => Renderer;
  config: () => EngineConfig<TData>;
  view: ViewModel<TData>;
  rows: () => RowLayout;
  store: DataStore<TData>;
  /** An icon finished loading: the base layer must redraw. */
  onIconLoad: () => void;
  onDiagnostic: OnDiagnostic;
  /** Whether the run starting at this event index is spread out (§6). */
  isSpread: (firstEventIndex: number) => boolean;
}

export class BasePainter<TData> {
  readonly frame = new FrameBuilder<TData>();
  readonly styles: StyleTable<TData>;
  readonly grid: HitGrid;
  /** True between a data change and the next base draw. */
  private stale = true;
  private readonly measureCache = new Map<string, number>();
  private readonly iconCache: IconCache;
  private readonly watchedImages = new WeakSet<object>();

  constructor(private readonly deps: BasePainterDeps<TData>) {
    this.iconCache = new IconCache(deps.onIconLoad, deps.onDiagnostic);
    this.styles = new StyleTable({
      store: deps.store,
      config: deps.config,
      onDiagnostic: deps.onDiagnostic,
    });
    this.grid = new HitGrid(this.frame.out.targets, () => deps.view.viewport);
  }

  /** Forget measured label widths (dataset, theme or renderer changed). */
  clearMeasureCache(): void {
    this.measureCache.clear();
    this.frame.clearMeasurements();
  }

  /** Re-resolve every style (theme or resolvers changed). */
  resetStyles(): void {
    this.styles.reset();
    this.frame.out.clearStyles();
  }

  /** The data changed: the last frame's targets no longer match it. */
  markStale(): void {
    this.stale = true;
  }

  get targets() {
    return this.frame.out.targets;
  }

  /** Cached text width (CSS px) for a CSS-px font. */
  readonly measure = (text: string, font: string): number => {
    const key = `${font}\u0000${text}`;
    let width = this.measureCache.get(key);
    if (width === undefined) {
      width = this.deps.renderer().measureText(text, font).width;
      if (this.measureCache.size >= MEASURE_CACHE_MAX) {
        this.measureCache.clear();
      }
      this.measureCache.set(key, width);
    }
    return width;
  };

  /**
   * Resolve an element icon for this frame (§1, §11): a URL loads through the
   * cache (skipped until ready), another string is a glyph drawn as text, and
   * an image source draws directly — an image still decoding is skipped and
   * redraws the frame once it loads.
   */
  readonly resolveIcon = (icon: string | CanvasImageSource): IconResolution => {
    if (typeof icon === 'string') {
      if (!isIconUrl(icon)) return { kind: 'text', text: icon };
      const image = this.iconCache.get(icon);
      return image ? { kind: 'image', image } : { kind: 'none' };
    }
    if (
      typeof HTMLImageElement !== 'undefined' &&
      icon instanceof HTMLImageElement
    ) {
      if (icon.complete && icon.naturalWidth > 0) {
        return { kind: 'image', image: icon };
      }
      if (!icon.complete && !this.watchedImages.has(icon)) {
        this.watchedImages.add(icon);
        icon.addEventListener('load', this.deps.onIconLoad, { once: true });
      }
      return { kind: 'none' };
    }
    return { kind: 'image', image: icon };
  };

  draw(): void {
    const { view, store } = this.deps;
    this.frame.build({
      store,
      rows: this.deps.rows(),
      camera: view.camera,
      viewport: view.viewport,
      dpr: view.dpr,
      config: this.deps.config(),
      styles: this.styles,
      measure: this.measure,
      resolveIcon: this.resolveIcon,
      isSpread: this.deps.isSpread,
      maxPxPerMs: view.maxPxPerMs,
    });
    this.grid.invalidate();
    this.stale = false;
    this.frame.draw(this.deps.renderer());
  }

  /** Start-marker widths of the elements with events, for the fit inset (§1). */
  *markers(): Iterable<{ offsetMs: number; contentWidth: number }> {
    const { store } = this.deps;
    const extent = store.getDataExtent();
    if (extent === null) return;
    const config = this.deps.config();
    const mins = store.extentMins;
    for (let slot = 0; slot < store.elementCount; slot++) {
      const minTime = mins[slot] as number;
      if (Number.isNaN(minTime)) continue;
      const element = store.elementAt(slot);
      const style = this.styles.element(slot).style;
      const width = this.measure(
        config.formatElementLabel(element),
        style.labelFont,
      );
      yield {
        offsetMs: minTime - extent.minTime,
        contentWidth: markerContentWidth(
          width,
          style.iconSize,
          element.icon !== undefined,
        ),
      };
    }
  }

  /** Index of the target under (x, y) in the last frame, or −1. */
  hitTest(x: number, y: number): number {
    if (this.stale) return -1;
    return hitTest(this.frame.out.targets, this.grid, x, y);
  }

  /** The public hit result for a target of the last frame. */
  hitResult(index: number): HitResult<TData> {
    const { store } = this.deps;
    const t = this.frame.out.targets.at(index);
    switch (t.kind) {
      case TargetKind.Element:
        return { kind: 'element', element: store.elementAt(t.ref) };
      case TargetKind.Event:
        return { kind: 'event', event: store.eventAt(t.ref) };
      case TargetKind.Cluster: {
        const members = clusterMembers(t, this.frame.out.targets, store);
        const events = members.map((i) => store.eventAt(i));
        return { kind: 'cluster', events, count: events.length };
      }
    }
  }

  /**
   * A key identifying what a target of the last frame shows, for hover change
   * detection (§9). It reads the target alone, so re-checking the hover every
   * frame costs nothing even over a cluster of thousands of events.
   */
  hitKey(index: number): string {
    const { store } = this.deps;
    const t = this.frame.out.targets.at(index);
    switch (t.kind) {
      case TargetKind.Element:
        return `element\u0000${store.elementAt(t.ref).id}`;
      case TargetKind.Event:
        return `event\u0000${store.eventAt(t.ref).id}`;
      case TargetKind.Cluster: {
        const first = store.eventAt(t.firstEvent).id;
        const last = store.eventAt(t.lastEvent).id;
        return `cluster\u0000${t.count}\u0000${first}\u0000${last}`;
      }
    }
  }
}
