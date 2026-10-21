import { afterEach, describe, expect, it, vi } from 'vitest';
import { IconCache, isIconUrl } from './iconCache';

describe('isIconUrl (§1)', () => {
  it('classifies URLs and paths as images', () => {
    for (const s of [
      'https://x/i.png',
      'http://x/i.png',
      'data:image/png;base64,AAAA',
      'blob:abc',
      '/icons/a.svg',
      './x.png',
      '../y.webp',
      'logo.jpeg',
    ]) {
      expect(isIconUrl(s)).toBe(true);
    }
  });

  it('classifies emoji and plain words as text', () => {
    for (const s of ['🏦', '🚀', 'A', 'star', '$']) {
      expect(isIconUrl(s)).toBe(false);
    }
  });
});

class FakeImage {
  crossOrigin: string | null = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  complete = false;
  naturalWidth = 0;
  src = '';
}

afterEach(() => vi.unstubAllGlobals());

describe('IconCache (§1, §11)', () => {
  function stubImages() {
    const created: FakeImage[] = [];
    vi.stubGlobal(
      'Image',
      class extends FakeImage {
        constructor() {
          super();
          created.push(this);
        }
      },
    );
    return created;
  }

  it('returns undefined and starts a load on first request', () => {
    const created = stubImages();
    const markDirty = vi.fn();
    const cache = new IconCache(markDirty);

    expect(cache.get('a.png')).toBeUndefined();
    expect(created).toHaveLength(1);
    expect(created[0]!.src).toBe('a.png');
    expect(markDirty).not.toHaveBeenCalled();
  });

  it('resolves the image and fires markDirty on load', () => {
    const created = stubImages();
    const markDirty = vi.fn();
    const cache = new IconCache(markDirty);
    cache.get('a.png');

    const img = created[0]!;
    img.complete = true;
    img.naturalWidth = 64;
    img.onload?.();

    expect(markDirty).toHaveBeenCalledTimes(1);
    expect(cache.get('a.png')).toBe(img as unknown as HTMLImageElement);
  });

  it('does not start a second load while the first is in flight', () => {
    const created = stubImages();
    const cache = new IconCache(vi.fn());
    cache.get('a.png');
    cache.get('a.png');
    expect(created).toHaveLength(1);
  });

  it('requests remote icons with CORS so WebGL may upload them', () => {
    const created = stubImages();
    const cache = new IconCache(vi.fn());
    cache.get('https://cdn.example/a.png');
    cache.get('data:image/png;base64,AAAA');
    expect(created[0]!.crossOrigin).toBe('anonymous');
    expect(created[1]!.crossOrigin).toBeNull();
  });

  it('retries without CORS when the CORS request fails, then reports a final failure', () => {
    const created = stubImages();
    const diagnostics: string[] = [];
    const cache = new IconCache(vi.fn(), (d) => diagnostics.push(d.code));
    cache.get('https://cdn.example/a.png');

    created[0]!.onerror?.();
    expect(created).toHaveLength(2);
    expect(created[1]!.crossOrigin).toBeNull();
    expect(diagnostics).toEqual([]);

    created[1]!.onerror?.();
    expect(diagnostics).toEqual(['icon-failed']);
    expect(created).toHaveLength(2);
  });

  it('is SSR-safe when Image is unavailable', () => {
    vi.stubGlobal('Image', undefined);
    const markDirty = vi.fn();
    const cache = new IconCache(markDirty);
    expect(() => cache.get('a.png')).not.toThrow();
    expect(cache.get('a.png')).toBeUndefined();
    expect(markDirty).not.toHaveBeenCalled();
  });
});
