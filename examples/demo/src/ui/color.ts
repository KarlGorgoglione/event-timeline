// CSS colour parsing for the editor and the preset checks: hex (3/4/6/8
// digits), `rgb()`/`rgba()` and `transparent`. Anything else (named colours,
// hsl) is left to the browser: the editor keeps the string as typed and the
// swatch paints it with CSS.

export interface Rgba {
  r: number;
  g: number;
  b: number;
  /** 0–1. */
  a: number;
}

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

export function parseColor(input: string): Rgba | null {
  const s = input.trim().toLowerCase();
  if (s === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(s);
  if (hex) {
    let h = hex[1] as string;
    if (h.length <= 4) h = [...h].map((c) => c + c).join('');
    const n = (i: number) => parseInt(h.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) / 255 : 1 };
  }
  const fn = /^rgba?\(\s*([^)]*)\)$/.exec(s);
  if (fn) {
    const parts = (fn[1] as string)
      .split(/\s*[,/]\s*|\s+/)
      .filter((p) => p !== '');
    if (parts.length !== 3 && parts.length !== 4) return null;
    const [r, g, b] = parts.slice(0, 3).map(Number) as [number, number, number];
    const rawA = parts[3];
    const a =
      rawA === undefined
        ? 1
        : rawA.endsWith('%')
          ? Number(rawA.slice(0, -1)) / 100
          : Number(rawA);
    if ([r, g, b, a].some((v) => !Number.isFinite(v))) return null;
    return {
      r: clamp(r, 0, 255),
      g: clamp(g, 0, 255),
      b: clamp(b, 0, 255),
      a: clamp(a, 0, 1),
    };
  }
  return null;
}

const hex2 = (v: number) => Math.round(v).toString(16).padStart(2, '0');

/** `#rrggbb`, ignoring alpha (what `<input type="color">` speaks). */
export function toHex({ r, g, b }: Rgba): string {
  return `#${hex2(r)}${hex2(g)}${hex2(b)}`;
}

/** Opaque colours as `#rrggbb`, translucent ones as `rgba(…)`. */
export function formatColor(c: Rgba): string {
  if (c.a >= 1) return toHex(c);
  const a = Math.round(c.a * 100) / 100;
  return `rgba(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)}, ${a})`;
}

/** `fg` painted over an opaque `bg`. */
export function composite(fg: Rgba, bg: Rgba): Rgba {
  const mix = (f: number, b: number) => f * fg.a + b * (1 - fg.a);
  return { r: mix(fg.r, bg.r), g: mix(fg.g, bg.g), b: mix(fg.b, bg.b), a: 1 };
}

/** WCAG relative luminance of an opaque colour. */
export function luminance({ r, g, b }: Rgba): number {
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio of `fg` (composited over `bg`) against `bg`. */
export function contrastRatio(fg: string, bg: string): number {
  const b = parseColor(bg);
  const f = parseColor(fg);
  if (b === null || f === null) return NaN;
  const lf = luminance(composite(f, { ...b, a: 1 }));
  const lb = luminance({ ...b, a: 1 });
  return (Math.max(lf, lb) + 0.05) / (Math.min(lf, lb) + 0.05);
}

/** Black or white, whichever reads better on `bg`. */
export function readableOn(bg: string): '#000000' | '#ffffff' {
  return contrastRatio('#000000', bg) >= contrastRatio('#ffffff', bg)
    ? '#000000'
    : '#ffffff';
}

/** `color` at `alpha` opacity, as `rgba(…)` (unparseable colours pass through). */
export function withAlpha(color: string, alpha: number): string {
  const c = parseColor(color);
  return c === null ? color : formatColor({ ...c, a: c.a * alpha });
}
