// Hover and selection highlights on the overlay layer (DESIGN.md §4, §9).
//
// Redraws the hovered and selected primitives in the highlight colours from
// the base frame's hit targets — no geometry is recomputed and the base layer
// is untouched, so hover and selection stay cheap. Selected events are found
// through the frame's per-event index, or — folded into an aggregated
// cluster, whose members aren't indexed — by one pass over those clusters.
// Highlighting an element scans the drawn targets' endpoint slots to light
// its connected arrows.

import type { SelectionModel } from '../interaction/selection';
import type { DataStore } from '../model/store';
import { hairlineOffset } from '../render/device';
import type { Renderer } from '../render/types';
import { ArrowheadBuffer, LineBuffer, NodeBuffer } from '../scene/buffers';
import { TargetKind, type Target, type TargetPool } from '../scene/targets';
import type { BasePainter } from './basePainter';
import type { EngineConfig } from './options';
import type { ViewModel } from './view';

export interface OverlayPainterDeps<TData> {
  renderer: () => Renderer;
  config: () => EngineConfig<TData>;
  view: ViewModel<TData>;
  base: BasePainter<TData>;
  store: DataStore<TData>;
  selection: SelectionModel;
  /** Index of the hovered target in the base frame, or −1. */
  hoveredTarget: () => number;
}

const NONE = 0;
const SELECTED = 1;
const HOVERED = 2;

export class OverlayPainter<TData> {
  private emphasis = new Uint8Array(0);
  private flags = new Uint8Array(0);
  private readonly lines = new Map<number, LineBuffer>();
  private readonly nodes = new Map<number, NodeBuffer>();
  private readonly heads = new Map<number, ArrowheadBuffer>();

  constructor(private readonly deps: OverlayPainterDeps<TData>) {}

  draw(): void {
    const renderer = this.deps.renderer();
    renderer.beginFrame(null);
    const targets = this.deps.base.targets;
    if (this.emphasis.length < targets.count) {
      this.emphasis = new Uint8Array(targets.count * 2);
    }
    this.emphasis.fill(NONE, 0, targets.count);
    this.markSelection(targets);
    this.markHover(targets);
    this.drawMarked(renderer, targets);
    renderer.endFrame();
  }

  private markSelection(targets: TargetPool): void {
    const { selection, store } = this.deps;
    if (selection.isEmpty) return;
    // Selected events not drawn on their own, by element pair → times.
    let folded: Map<number, number[]> | null = null;
    const pairs = store.elementCount;
    for (const id of selection.eventIds) {
      const index = store.indexOfEvent(id);
      if (index < 0) continue;
      const t = targets.ofEvent(index);
      if (t >= 0) {
        this.emphasis[t] = SELECTED;
      } else if (targets.lazyClusters > 0) {
        folded ??= new Map();
        const pair =
          (store.eventSources[index] as number) * pairs +
          (store.eventTargets[index] as number);
        const times = folded.get(pair);
        const time = store.eventTimes[index] as number;
        if (times === undefined) folded.set(pair, [time]);
        else times.push(time);
      }
    }
    if (folded !== null) this.markFolded(targets, folded, pairs);
    if (selection.elementIds.size === 0) return;
    const flags = this.clearFlags(store.elementCount);
    for (const id of selection.elementIds) {
      const slot = store.slotOf(id);
      if (slot === undefined) continue;
      flags[slot] = 1;
      const t = targets.ofElement(slot);
      if (t >= 0) this.emphasis[t] = SELECTED;
    }
    this.markConnected(targets, flags, SELECTED);
  }

  private markHover(targets: TargetPool): void {
    const hovered = this.deps.hoveredTarget();
    if (hovered < 0 || hovered >= targets.count) return;
    this.emphasis[hovered] = HOVERED;
    const t = targets.at(hovered);
    if (t.kind !== TargetKind.Element) return;
    // Hovering an element also lights its connected events (§9).
    const flags = this.clearFlags(this.deps.store.elementCount);
    flags[t.ref] = 1;
    this.markConnected(targets, flags, HOVERED);
  }

  /** Mark the aggregated clusters holding a selected event (§6). */
  private markFolded(
    targets: TargetPool,
    folded: Map<number, number[]>,
    pairs: number,
  ): void {
    for (let i = 0; i < targets.count; i++) {
      const t = targets.at(i);
      if (t.kind !== TargetKind.Cluster || !t.lazy) continue;
      const times = folded.get(t.pairSource * pairs + t.pairTarget);
      if (times?.some((time) => time >= t.t0 && time <= t.t1)) {
        this.emphasis[i] = SELECTED;
      }
    }
  }

  /** Mark arrows and clusters touching a flagged element slot. */
  private markConnected(
    targets: TargetPool,
    flags: Uint8Array,
    level: number,
  ): void {
    const { store } = this.deps;
    const sources = store.eventSources;
    const ends = store.eventTargets;
    const touches = (event: number) =>
      flags[sources[event] as number] === 1 ||
      flags[ends[event] as number] === 1;
    for (let i = 0; i < targets.count; i++) {
      if ((this.emphasis[i] as number) >= level) continue;
      const t = targets.at(i);
      if (t.kind === TargetKind.Event) {
        if (touches(t.ref)) this.emphasis[i] = level;
      } else if (t.kind === TargetKind.Cluster) {
        // Members sharing one pair touch exactly its two endpoints.
        if (t.pairSource >= 0) {
          if (flags[t.pairSource] === 1 || flags[t.pairTarget] === 1) {
            this.emphasis[i] = level;
          }
          continue;
        }
        for (let m = 0; m < t.memberCount; m++) {
          if (touches(targets.members[t.memberStart + m] as number)) {
            this.emphasis[i] = level;
            break;
          }
        }
      }
    }
  }

  private clearFlags(size: number): Uint8Array {
    if (this.flags.length < size) this.flags = new Uint8Array(size * 2);
    else this.flags.fill(0, 0, size);
    return this.flags;
  }

  /** Redraw marked targets thickened in their emphasis colour (always solid). */
  private drawMarked(renderer: Renderer, targets: TargetPool): void {
    const { theme } = this.deps.config();
    const { dpr } = this.deps.view;
    for (const map of [this.lines, this.nodes, this.heads]) {
      for (const buffer of map.values()) buffer.reset();
    }
    // Selection first, hover on top.
    for (const level of [SELECTED, HOVERED]) {
      const color =
        level === HOVERED
          ? theme.emphasis.hoverColor
          : theme.emphasis.selectionColor;
      const bonus =
        level === HOVERED
          ? theme.emphasis.hoverWidthBonus
          : theme.emphasis.selectionWidthBonus;
      let any = false;
      for (let i = 0; i < targets.count; i++) {
        if (this.emphasis[i] !== level) continue;
        any = true;
        this.highlight(targets, targets.at(i), level, color, bonus, dpr);
      }
      if (!any) continue;
      for (const [key, b] of this.lines) {
        if (Math.floor(key / 1e6) === level && b.count > 0)
          renderer.drawLines(b);
      }
      for (const [key, b] of this.nodes) {
        if (Math.floor(key / 1e6) === level && b.count > 0)
          renderer.drawNodes(b);
      }
      for (const [key, b] of this.heads) {
        if (Math.floor(key / 1e6) === level && b.count > 0) {
          renderer.drawArrowheads(b);
        }
      }
    }
  }

  private highlight(
    targets: TargetPool,
    t: Target,
    level: number,
    color: string,
    bonus: number,
    dpr: number,
  ): void {
    const { theme } = this.deps.config();
    const radiusBonus = theme.emphasis.radiusBonus;
    const snap = (v: number) => Math.round(v * dpr);
    const width = Math.max(1, snap(t.width + bonus));
    const line = pooled(
      this.lines,
      level * 1e6 + width,
      () => new LineBuffer(color, width),
    );
    line.color = color;
    const off = hairlineOffset(width);
    const seg = targets.segments;
    for (let s = t.segStart; s < t.segStart + t.segCount; s++) {
      line.push(
        snap(seg[s * 4] as number) + off,
        snap(seg[s * 4 + 1] as number) + off,
        snap(seg[s * 4 + 2] as number) + off,
        snap(seg[s * 4 + 3] as number) + off,
        s > t.segStart,
      );
    }
    if (t.kind === TargetKind.Element) return;
    // Dots and the arrowhead keep each event's own sizes (§11).
    const radius = Math.max(1, snap(t.radius + radiusBonus));
    const node = pooled(
      this.nodes,
      level * 1e6 + radius,
      () => new NodeBuffer(color, radius),
    );
    node.color = color;
    if (t.hasNode) node.push(snap(t.x), snap(t.y));
    if (t.hasTargetNode) node.push(snap(t.tx), snap(t.ty));
    if (t.hasHead) {
      const size = Math.max(1, snap(t.headSize + radiusBonus));
      const head = pooled(
        this.heads,
        level * 1e6 + size,
        () => new ArrowheadBuffer(color, size),
      );
      head.color = color;
      head.push(snap(t.hx), snap(t.hy), t.angle);
    }
  }
}

function pooled<B>(map: Map<number, B>, key: number, make: () => B): B {
  let buffer = map.get(key);
  if (buffer === undefined) {
    buffer = make();
    map.set(key, buffer);
  }
  return buffer;
}
