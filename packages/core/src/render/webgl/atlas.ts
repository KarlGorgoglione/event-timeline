// Paged, least-recently-used texture atlas bookkeeping (DESIGN.md §4, W-03).
//
// Rasterized labels (and icons) are shelf-packed into fixed-size pages. When
// every page is full, the page whose entries were used longest ago is wiped
// and reused — never the whole atlas at once, so a frame with many distinct
// labels evicts at most what it must, and recently drawn labels stay cached.
// Pure bookkeeping: the GL backend uploads pixels into the returned slots and
// must flush its recorded draws before a page used this frame is reused.

import { ShelfPacker } from './shelfPack';

export interface AtlasSlot<V> {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  value: V;
}

interface Entry<V> extends AtlasSlot<V> {
  lastFrame: number;
}

interface Page {
  packer: ShelfPacker;
  lastFrame: number;
}

/** 1px guard band so neighbouring entries never bleed when sampled. */
const PADDING = 1;

export class PagedAtlas<V> {
  private readonly entries = new Map<string, Entry<V>>();
  private readonly failed = new Set<string>();
  private readonly pages: Page[] = [];
  private frame = 0;

  constructor(
    readonly pageSize: number,
    readonly maxPages: number,
  ) {}

  get pageCount(): number {
    return this.pages.length;
  }

  /** Start a frame (for least-recently-used tracking). */
  beginFrame(): void {
    this.frame++;
  }

  /** The cached slot for `key`, marked as used this frame. */
  get(key: string): AtlasSlot<V> | undefined {
    const entry = this.entries.get(key);
    if (entry === undefined) return undefined;
    entry.lastFrame = this.frame;
    (this.pages[entry.page] as Page).lastFrame = this.frame;
    return entry;
  }

  /** Whether `key` is known to be unrenderable (don't retry it every frame). */
  hasFailed(key: string): boolean {
    return this.failed.has(key);
  }

  markFailed(key: string): void {
    this.failed.add(key);
  }

  /**
   * Reserve a `width × height` slot for `key`, opening a page or reusing the
   * least recently used one. `beforeEvict(page, usedThisFrame)` runs before a
   * page is wiped. Returns null when the entry can never fit a page.
   */
  allocate(
    key: string,
    width: number,
    height: number,
    value: V,
    beforeEvict: (page: number, usedThisFrame: boolean) => void,
  ): AtlasSlot<V> | null {
    const w = width + PADDING;
    const h = height + PADDING;
    if (w > this.pageSize || h > this.pageSize) return null;
    for (let p = 0; p < this.pages.length; p++) {
      const at = (this.pages[p] as Page).packer.allocate(w, h);
      if (at !== null)
        return this.store(key, p, at.x, at.y, width, height, value);
    }
    let page = this.pages.length;
    if (page < this.maxPages) {
      this.pages.push({
        packer: new ShelfPacker(this.pageSize, this.pageSize),
        lastFrame: this.frame,
      });
    } else {
      page = this.leastRecentlyUsed();
      beforeEvict(page, (this.pages[page] as Page).lastFrame === this.frame);
      this.evict(page);
    }
    const at = (this.pages[page] as Page).packer.allocate(w, h);
    if (at === null) return null;
    return this.store(key, page, at.x, at.y, width, height, value);
  }

  /** Forget everything (e.g. the GL context was lost with its textures). */
  clear(): void {
    this.entries.clear();
    this.failed.clear();
    this.pages.length = 0;
  }

  private store(
    key: string,
    page: number,
    x: number,
    y: number,
    width: number,
    height: number,
    value: V,
  ): AtlasSlot<V> {
    const entry: Entry<V> = {
      page,
      x,
      y,
      width,
      height,
      value,
      lastFrame: this.frame,
    };
    this.entries.set(key, entry);
    (this.pages[page] as Page).lastFrame = this.frame;
    return entry;
  }

  private leastRecentlyUsed(): number {
    let oldest = 0;
    for (let p = 1; p < this.pages.length; p++) {
      if (
        (this.pages[p] as Page).lastFrame <
        (this.pages[oldest] as Page).lastFrame
      ) {
        oldest = p;
      }
    }
    return oldest;
  }

  private evict(page: number): void {
    for (const [key, entry] of this.entries) {
      if (entry.page === page) this.entries.delete(key);
    }
    (this.pages[page] as Page).packer.reset();
    (this.pages[page] as Page).lastFrame = this.frame;
  }
}
