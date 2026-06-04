// Element icon loading + classification (DESIGN.md §1, §11).
//
// `element.icon` is a URL, an emoji/glyph string, or a preloaded image. URLs are
// loaded once and cached by URL; while loading, `get` returns undefined and the
// frame skips the icon, then the injected `markDirty` callback re-renders when
// the image arrives (core stays decoupled from any scheduler — DIP). Emoji/glyph
// strings are not URLs and are drawn as text by the builder instead.

/**
 * Whether an icon string is a URL/path (load as an image) rather than an
 * emoji/glyph (draw as text). Matches a protocol, a path prefix, or a known
 * image extension; anything else is treated as text.
 */
export function isIconUrl(icon: string): boolean {
  return (
    /^(https?:|data:|blob:|\/|\.\/|\.\.\/)/.test(icon) ||
    /\.(png|jpe?g|gif|svg|webp|avif|bmp|ico)$/i.test(icon)
  );
}

export class IconCache {
  // `null` = loading or failed; `undefined` (absent) = never requested.
  private readonly cache = new Map<string, HTMLImageElement | null>();

  constructor(private readonly onLoad: () => void) {}

  /**
   * The ready image for `url`, or `undefined` while it is still loading (or
   * failed). The first request for a URL kicks off the load.
   */
  get(url: string): HTMLImageElement | undefined {
    const hit = this.cache.get(url);
    if (hit === undefined) {
      this.load(url);
      return undefined;
    }
    if (hit === null) return undefined;
    return hit.complete && hit.naturalWidth > 0 ? hit : undefined;
  }

  clear(): void {
    this.cache.clear();
  }

  private load(url: string): void {
    // SSR / non-DOM guard: no Image constructor means we simply never resolve.
    if (typeof Image === 'undefined') {
      this.cache.set(url, null);
      return;
    }
    this.cache.set(url, null);
    const image = new Image();
    image.onload = () => {
      this.cache.set(url, image);
      this.onLoad();
    };
    image.onerror = () => {
      // Leave as null (failed); do not retry to avoid a load storm.
    };
    image.src = url;
  }
}
