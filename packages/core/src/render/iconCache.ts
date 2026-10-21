// Element icon loading + classification (DESIGN.md §1, §11).
//
// `element.icon` is a URL, an emoji/glyph string, or a preloaded image. URLs are
// loaded once and cached by URL; while loading, `get` returns undefined and the
// frame skips the icon, then the injected `onLoad` callback re-renders when the
// image arrives. Emoji/glyph strings are not URLs and are drawn as text by the
// builder instead.
//
// Remote images are requested with CORS (`crossOrigin = 'anonymous'`) because
// WebGL may only upload CORS-approved images. If the server refuses CORS the
// image is fetched again without it: Canvas2D can still draw it, and the WebGL
// backend reports and skips it.

import type { OnDiagnostic } from '../model/diagnostics';

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

/** URLs that carry their own bytes never need (or support) a CORS request. */
function needsCors(url: string): boolean {
  return !/^(data:|blob:)/.test(url);
}

export class IconCache {
  // `null` = loading or failed; `undefined` (absent) = never requested.
  private readonly cache = new Map<string, HTMLImageElement | null>();

  constructor(
    private readonly onLoad: () => void,
    private readonly onDiagnostic?: OnDiagnostic,
  ) {}

  /**
   * The ready image for `url`, or `undefined` while it is still loading (or
   * failed). The first request for a URL kicks off the load.
   */
  get(url: string): HTMLImageElement | undefined {
    const hit = this.cache.get(url);
    if (hit === undefined) {
      this.load(url, needsCors(url));
      return undefined;
    }
    if (hit === null) return undefined;
    return hit.complete && hit.naturalWidth > 0 ? hit : undefined;
  }

  private load(url: string, cors: boolean): void {
    // SSR / non-DOM guard: no Image constructor means we simply never resolve.
    if (typeof Image === 'undefined') {
      this.cache.set(url, null);
      return;
    }
    this.cache.set(url, null);
    const image = new Image();
    if (cors) image.crossOrigin = 'anonymous';
    image.onload = () => {
      this.cache.set(url, image);
      this.onLoad();
    };
    image.onerror = () => {
      if (cors) {
        // Possibly a server without CORS headers: retry as a plain image.
        this.load(url, false);
        return;
      }
      // Leave as null (failed); do not retry again to avoid a load storm.
      this.onDiagnostic?.({
        code: 'icon-failed',
        kind: 'icon',
        id: url,
        reason: 'icon image failed to load',
      });
    };
    image.src = url;
  }
}
