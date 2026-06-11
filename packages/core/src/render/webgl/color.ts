// CSS colour → premultiplied RGBA floats for the WebGL backend (§4).
//
// The fast path parses the forms the library actually emits — hex, rgb()/
// rgba(), and 'transparent' cover defaultTheme and every demo preset — without
// touching the DOM, so it is node-testable. Anything else (named colours,
// hsl(), color()) round-trips through an injected 2D context, guaranteeing the
// same interpretation Canvas2D would give it. Results are premultiplied
// because the backend blends with (ONE, ONE_MINUS_SRC_ALPHA).

/** Premultiplied [r, g, b, a], each 0..1. */
export type PremultipliedRgba = readonly [number, number, number, number];

export const TRANSPARENT: PremultipliedRgba = [0, 0, 0, 0];

const RGB_RE =
  /^rgba?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*(?:[,/]\s*([\d.]+%?)\s*)?\)$/i;

/**
 * Parse hex / rgb() / rgba() / 'transparent' without a DOM. Returns null for
 * any other form (caller falls back to a 2D-context round-trip).
 */
export function parseColorFast(color: string): PremultipliedRgba | null {
  const trimmed = color.trim();
  if (trimmed.toLowerCase() === 'transparent') return TRANSPARENT;
  if (trimmed.startsWith('#')) return parseHex(trimmed.slice(1));
  const m = RGB_RE.exec(trimmed);
  if (m === null) return null;
  const r = Number(m[1]) / 255;
  const g = Number(m[2]) / 255;
  const b = Number(m[3]) / 255;
  const a = m[4] === undefined ? 1 : parseAlpha(m[4]);
  if ([r, g, b, a].some((c) => !Number.isFinite(c) || c < 0 || c > 1)) {
    return null;
  }
  return premultiply(r, g, b, a);
}

function parseAlpha(raw: string): number {
  return raw.endsWith('%') ? Number(raw.slice(0, -1)) / 100 : Number(raw);
}

function parseHex(hex: string): PremultipliedRgba | null {
  if (!/^[0-9a-f]+$/i.test(hex)) return null;
  let digits: string;
  if (hex.length === 3 || hex.length === 4) {
    digits = [...hex].map((d) => d + d).join('');
  } else if (hex.length === 6 || hex.length === 8) {
    digits = hex;
  } else {
    return null;
  }
  const channel = (i: number) => parseInt(digits.slice(i * 2, i * 2 + 2), 16);
  const a = digits.length === 8 ? channel(3) / 255 : 1;
  return premultiply(channel(0) / 255, channel(1) / 255, channel(2) / 255, a);
}

function premultiply(
  r: number,
  g: number,
  b: number,
  a: number,
): PremultipliedRgba {
  return [r * a, g * a, b * a, a];
}

/**
 * Caching parser. The fallback context (the backend's shared offscreen 2D
 * canvas) is injected so this module stays DOM-free; without one, unparseable
 * colours resolve to transparent (they simply don't draw — lenient, §1).
 */
export class ColorCache {
  private readonly cache = new Map<string, PremultipliedRgba>();

  constructor(
    private readonly fallbackCtx?: () => CanvasRenderingContext2D | null,
  ) {}

  get(color: string): PremultipliedRgba {
    const hit = this.cache.get(color);
    if (hit !== undefined) return hit;
    const parsed =
      parseColorFast(color) ?? this.parseViaContext(color) ?? TRANSPARENT;
    this.cache.set(color, parsed);
    return parsed;
  }

  private parseViaContext(color: string): PremultipliedRgba | null {
    const ctx = this.fallbackCtx?.();
    if (!ctx) return null;
    ctx.clearRect(0, 0, 1, 1);
    // An invalid colour leaves fillStyle unchanged; pre-set a sentinel so the
    // result is deterministic (transparent pixel → TRANSPARENT) either way.
    ctx.fillStyle = 'rgba(0,0,0,0)';
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    if (a === undefined) return null;
    return premultiply(
      (r as number) / 255,
      (g as number) / 255,
      (b as number) / 255,
      a / 255,
    );
  }
}
