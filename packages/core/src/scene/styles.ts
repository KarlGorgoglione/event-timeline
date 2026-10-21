// Resolved, interned styles (DESIGN.md §11).
//
// The §11 chain (theme → resolver → per-item `.style`) runs once per item, not
// once per frame: the result is interned and its id cached in the store's
// per-item style column until the theme, the resolvers or the item change.
// Each resolved style also carries small integer ids for the stroke, fill,
// arrowhead, text and rect batches it draws into, so the frame builder groups
// primitives by integer instead of by string key.

import type { OnDiagnostic } from '../model/diagnostics';
import type { DataStore } from '../model/store';
import type { ElementStyle, EventStyle } from '../model/types';
import { parseFontPx } from '../render/device';
import type { EngineConfig } from '../engine/options';
import { isPxFont } from '../engine/theme';

export interface StrokeStyle {
  color: string;
  /** CSS px. */
  width: number;
  dash: readonly number[];
}

export interface FillStyle {
  color: string;
  /** Node radius or arrowhead size, CSS px. */
  size: number;
}

export interface FontStyle {
  color: string;
  font: string;
  /** The font's px size, parsed once. */
  px: number;
}

export interface ResolvedElementStyle {
  style: ElementStyle;
  stroke: number;
  text: number;
}

export interface ResolvedEventStyle {
  style: EventStyle;
  stroke: number;
  node: number;
  head: number;
  text: number;
  /** Label box fill rect id, or −1 when the box has no visible fill. */
  boxFill: number;
  /** Label box border stroke id, or −1 when the border is invisible. */
  boxBorder: number;
}

/** Interns values by a string key computed once per new value. */
class Interner<T> {
  readonly values: T[] = [];
  private readonly ids = new Map<string, number>();

  id(key: string, make: () => T): number {
    let id = this.ids.get(key);
    if (id === undefined) {
      id = this.values.length;
      this.values.push(make());
      this.ids.set(key, id);
    }
    return id;
  }

  clear(): void {
    this.values.length = 0;
    this.ids.clear();
  }
}

export interface StyleTableDeps<TData> {
  store: DataStore<TData>;
  config: () => EngineConfig<TData>;
  onDiagnostic: OnDiagnostic;
}

export class StyleTable<TData> {
  readonly strokes = new Interner<StrokeStyle>();
  readonly fills = new Interner<FillStyle>();
  readonly fonts = new Interner<FontStyle>();
  readonly rects = new Interner<string>();
  private readonly elementStyles = new Interner<ResolvedElementStyle>();
  private readonly eventStyles = new Interner<ResolvedEventStyle>();
  private readonly reportedFonts = new Set<string>();
  /** The theme's own element/event styles: the shared no-override case. */
  private defaultElement = -1;
  private defaultEvent = -1;

  constructor(private readonly deps: StyleTableDeps<TData>) {}

  /** Forget every resolved style (theme or resolvers changed). */
  reset(): void {
    this.strokes.clear();
    this.fills.clear();
    this.fonts.clear();
    this.rects.clear();
    this.elementStyles.clear();
    this.eventStyles.clear();
    this.defaultElement = -1;
    this.defaultEvent = -1;
    this.deps.store.resetStyles();
  }

  stroke(color: string, width: number, dash: readonly number[] = []): number {
    return this.strokes.id(`${color}|${width}|${dash.join(',')}`, () => ({
      color,
      width,
      dash,
    }));
  }

  fill(color: string, size: number): number {
    return this.fills.id(`${color}|${size}`, () => ({ color, size }));
  }

  font(color: string, font: string): number {
    return this.fonts.id(`${color}|${font}`, () => ({
      color,
      font,
      px: parseFontPx(font),
    }));
  }

  rect(color: string): number {
    return this.rects.id(color, () => color);
  }

  /** The resolved style of the element in `slot`. */
  element(slot: number): ResolvedElementStyle {
    const { store } = this.deps;
    let id = store.elementStyle[slot] as number;
    if (id < 0) {
      id = this.resolveElement(slot);
      store.elementStyle[slot] = id;
    }
    return this.elementStyles.values[id] as ResolvedElementStyle;
  }

  /** The resolved style of the event at `index`. */
  event(index: number): ResolvedEventStyle {
    const { store } = this.deps;
    let id = store.eventStyle[index] as number;
    if (id < 0) {
      id = this.resolveEvent(index);
      store.eventStyle[index] = id;
    }
    return this.eventStyles.values[id] as ResolvedEventStyle;
  }

  private resolveElement(slot: number): number {
    const config = this.deps.config();
    const element = this.deps.store.elementAt(slot);
    const custom = element.style !== undefined || config.hasElementResolver;
    if (!custom && this.defaultElement >= 0) return this.defaultElement;
    const style = this.checkFont(
      config.resolveElementStyle(element),
      config.theme.element,
      element.id,
    );
    const id = this.elementStyles.id(elementKey(style), () => ({
      style,
      stroke: this.stroke(style.lineColor, style.lineWidth, style.lineDash),
      text: this.font(style.labelColor, style.labelFont),
    }));
    if (!custom) this.defaultElement = id;
    return id;
  }

  private resolveEvent(index: number): number {
    const config = this.deps.config();
    const event = this.deps.store.eventAt(index);
    const custom = event.style !== undefined || config.hasEventResolver;
    if (!custom && this.defaultEvent >= 0) return this.defaultEvent;
    const style = this.checkFont(
      config.resolveEventStyle(event),
      config.theme.event,
      event.id,
    );
    const id = this.eventStyles.id(eventKey(style), () => ({
      style,
      stroke: this.stroke(style.arrowColor, style.arrowWidth, style.arrowDash),
      node: this.fill(style.arrowColor, style.nodeRadius),
      head: this.fill(style.arrowColor, style.arrowheadSize),
      text: this.font(style.labelColor, style.labelFont),
      boxFill:
        style.labelBoxBackground !== 'transparent'
          ? this.rect(style.labelBoxBackground)
          : -1,
      boxBorder:
        style.labelBoxBorderWidth > 0 &&
        style.labelBoxBorderColor !== 'transparent'
          ? this.stroke(
              style.labelBoxBorderColor,
              style.labelBoxBorderWidth,
              style.labelBoxBorderDash,
            )
          : -1,
    }));
    if (!custom) this.defaultEvent = id;
    return id;
  }

  /** Replace a non-px item font with the theme's (reported once per font). */
  private checkFont<S extends { labelFont: string }>(
    style: S,
    fallback: { labelFont: string },
    id: string,
  ): S {
    if (isPxFont(style.labelFont)) return style;
    if (!this.reportedFonts.has(style.labelFont)) {
      this.reportedFonts.add(style.labelFont);
      this.deps.onDiagnostic({
        code: 'invalid-font',
        kind: 'theme',
        id,
        reason: `font "${style.labelFont}" is not sized in px; using "${fallback.labelFont}"`,
      });
    }
    return { ...style, labelFont: fallback.labelFont };
  }
}

function elementKey(s: ElementStyle): string {
  return [
    s.lineColor,
    s.lineWidth,
    s.lineDash.join(','),
    s.labelColor,
    s.labelFont,
    s.iconSize,
  ].join('|');
}

function eventKey(s: EventStyle): string {
  return [
    s.arrowColor,
    s.arrowWidth,
    s.arrowDash.join(','),
    s.arrowheadSize,
    s.labelColor,
    s.labelFont,
    s.nodeRadius,
    s.labelBoxBackground,
    s.labelBoxBorderColor,
    s.labelBoxBorderWidth,
    s.labelBoxBorderDash.join(','),
    s.labelBoxPadding,
  ].join('|');
}
