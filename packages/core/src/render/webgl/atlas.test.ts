import { describe, expect, it, vi } from 'vitest';
import { PagedAtlas } from './atlas';

describe('PagedAtlas (§4, W-03)', () => {
  it('caches entries by key and packs them into a page', () => {
    const atlas = new PagedAtlas<string>(64, 2);
    const a = atlas.allocate('a', 10, 10, 'A', vi.fn());
    const b = atlas.allocate('b', 10, 10, 'B', vi.fn());
    expect(a).toMatchObject({ page: 0, x: 0, y: 0, value: 'A' });
    expect(b).toMatchObject({ page: 0, x: 11 });
    expect(atlas.get('a')?.value).toBe('A');
    expect(atlas.get('zzz')).toBeUndefined();
  });

  it('opens a new page when one is full, up to the limit', () => {
    const atlas = new PagedAtlas<number>(16, 2);
    atlas.allocate('a', 15, 15, 1, vi.fn());
    const b = atlas.allocate('b', 15, 15, 2, vi.fn());
    expect(b?.page).toBe(1);
    expect(atlas.pageCount).toBe(2);
  });

  it('evicts only the least recently used page once all are full', () => {
    const atlas = new PagedAtlas<number>(16, 2);
    atlas.beginFrame();
    atlas.allocate('old', 15, 15, 1, vi.fn());
    atlas.beginFrame();
    atlas.allocate('recent', 15, 15, 2, vi.fn());
    atlas.beginFrame();
    atlas.get('recent');
    const evict = vi.fn();
    const c = atlas.allocate('new', 15, 15, 3, evict);
    expect(evict).toHaveBeenCalledWith(0, false);
    expect(c?.page).toBe(0);
    expect(atlas.get('old')).toBeUndefined();
    expect(atlas.get('recent')?.value).toBe(2);
  });

  it('tells the caller when the evicted page was used this frame', () => {
    const atlas = new PagedAtlas<number>(16, 1);
    atlas.beginFrame();
    atlas.allocate('a', 15, 15, 1, vi.fn());
    const evict = vi.fn();
    atlas.allocate('b', 15, 15, 2, evict);
    expect(evict).toHaveBeenCalledWith(0, true);
  });

  it('refuses entries larger than a page and remembers failures', () => {
    const atlas = new PagedAtlas<number>(16, 1);
    expect(atlas.allocate('huge', 40, 4, 1, vi.fn())).toBeNull();
    atlas.markFailed('huge');
    expect(atlas.hasFailed('huge')).toBe(true);
    atlas.clear();
    expect(atlas.hasFailed('huge')).toBe(false);
    expect(atlas.pageCount).toBe(0);
  });
});
