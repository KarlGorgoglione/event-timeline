// Font stacks and the CSS font shorthand the theme speaks (DESIGN.md §11:
// fonts must be sized in px, because the engine scales them by the device
// pixel ratio itself).
//
// Inter and JetBrains Mono are self-hosted (fontsource, same origin). Canvas
// text measures with whatever face is loaded at the time, so `loadFonts` runs
// before the first render: otherwise labels and the WebGL glyph atlas would be
// laid out with the fallback face.

export const FAMILIES = {
  inter: "'Inter Variable', Inter, system-ui, sans-serif",
  mono: "'JetBrains Mono Variable', ui-monospace, SFMono-Regular, Menlo, monospace",
  serif: "Georgia, 'Times New Roman', serif",
  system: 'system-ui, sans-serif',
} as const;

export type FamilyKey = keyof typeof FAMILIES;

export interface FontValue {
  italic: boolean;
  /** 100–900; 400 is regular. */
  weight: number;
  /** CSS px. */
  size: number;
  family: string;
}

// `[italic] [weight] <size>px[/line-height] <family>`, the subset of the CSS
// shorthand the presets and the editor produce.
const FONT_RE =
  /^\s*(italic\s+)?(?:(normal|bold|[1-9]00)\s+)?(\d+(?:\.\d+)?)px(?:\/\S+)?\s+(.+?)\s*$/;

export function parseFont(shorthand: string): FontValue | null {
  const m = FONT_RE.exec(shorthand);
  if (m === null) return null;
  const weight =
    m[2] === undefined || m[2] === 'normal'
      ? 400
      : m[2] === 'bold'
        ? 700
        : Number(m[2]);
  return {
    italic: m[1] !== undefined,
    weight,
    size: Number(m[3]),
    family: m[4] as string,
  };
}

export function formatFont(f: FontValue): string {
  const parts: string[] = [];
  if (f.italic) parts.push('italic');
  if (f.weight !== 400) parts.push(String(f.weight));
  parts.push(`${f.size}px`, f.family);
  return parts.join(' ');
}

/** A theme font: `font(12, FAMILIES.inter, 500)` → `500 12px 'Inter Variable', …`. */
export function font(
  size: number,
  family: string,
  weight = 400,
  italic = false,
): string {
  return formatFont({ italic, weight, size, family });
}

/** Shift a shorthand's px size by `delta`, leaving the rest untouched. */
export function resizeFont(shorthand: string, delta: number): string {
  const f = parseFont(shorthand);
  return f === null
    ? shorthand
    : formatFont({ ...f, size: Math.max(6, f.size + delta) });
}

/**
 * Load the bundled faces (and the weights the presets use), giving up after
 * `timeoutMs` so a slow network never blocks the page.
 */
export async function loadFonts(timeoutMs = 1500): Promise<void> {
  if (typeof document === 'undefined' || !('fonts' in document)) return;
  const faces = [
    `400 12px ${FAMILIES.inter}`,
    `600 12px ${FAMILIES.inter}`,
    `400 12px ${FAMILIES.mono}`,
    `600 12px ${FAMILIES.mono}`,
  ];
  const loads = Promise.all(faces.map((f) => document.fonts.load(f)));
  const timeout = new Promise((resolve) => setTimeout(resolve, timeoutMs));
  await Promise.race([loads.catch(() => undefined), timeout]);
}
