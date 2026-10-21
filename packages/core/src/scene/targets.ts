// Hit targets for one base frame (DESIGN.md §5, §9).
//
// The frame builder records identity-carrying geometry (CSS px) for each drawn
// element line, event arrow and cluster marker, from the same coordinates it
// draws. Hit-testing, hover and the overlay highlight all read these records,
// so nothing is recomputed. Records are pooled and reused across frames, and
// targets are also indexed by event and element so the overlay can find the
// few it highlights without scanning the scene.

import type { DataStore } from '../model/store';

export const TargetKind = { Element: 0, Event: 1, Cluster: 2 } as const;
export type TargetKind = (typeof TargetKind)[keyof typeof TargetKind];

export interface Target {
  kind: TargetKind;
  /** Element slot, event index, or (cluster) unused. */
  ref: number;
  /** Segments (riser, loop, line) in {@link TargetPool.segments}, CSS px. */
  segStart: number;
  segCount: number;
  /** Source dot (event), marker centre (cluster). */
  x: number;
  y: number;
  hasNode: boolean;
  /** Target dot on the target line (event). */
  tx: number;
  ty: number;
  hasTargetNode: boolean;
  /** Arrowhead anchor and direction (event). */
  hx: number;
  hy: number;
  angle: number;
  hasHead: boolean;
  /** Stroke width, arrowhead size and node/marker radius, CSS px. */
  width: number;
  headSize: number;
  radius: number;
  /** Cluster members: event indices in {@link TargetPool.members}. */
  memberStart: number;
  memberCount: number;
  /**
   * Cluster summary: event count, first and last event index, time span,
   * and the element pair when every member shares one (else −1).
   */
  count: number;
  firstEvent: number;
  lastEvent: number;
  t0: number;
  t1: number;
  pairSource: number;
  pairTarget: number;
  /**
   * An aggregated cluster (§6) lists no members: they are the events of its
   * pair in `[t0, t1]`, resolved on demand by {@link clusterMembers}.
   */
  lazy: boolean;
  /** Bounding box including hit padding, CSS px. */
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function blankTarget(): Target {
  return {
    kind: TargetKind.Element,
    ref: -1,
    segStart: 0,
    segCount: 0,
    x: 0,
    y: 0,
    hasNode: false,
    tx: 0,
    ty: 0,
    hasTargetNode: false,
    hx: 0,
    hy: 0,
    angle: 0,
    hasHead: false,
    width: 0,
    headSize: 0,
    radius: 0,
    memberStart: 0,
    memberCount: 0,
    count: 0,
    firstEvent: -1,
    lastEvent: -1,
    t0: 0,
    t1: 0,
    pairSource: -1,
    pairTarget: -1,
    lazy: false,
    minX: 0,
    minY: 0,
    maxX: 0,
    maxY: 0,
  };
}

/**
 * Padding around a target's geometry when indexing it, so it is registered in
 * every cell its hit tolerance can reach.
 */
const BBOX_PAD_PX = 6;

export class TargetPool {
  private readonly pool: Target[] = [];
  count = 0;
  /** Segment coordinates `x1, y1, x2, y2` for all targets, CSS px. */
  segments = new Float32Array(256);
  private segLength = 0;
  /** Cluster member event indices. */
  members = new Int32Array(64);
  private memberLength = 0;
  /** Aggregated clusters this frame (their members aren't indexed). */
  lazyClusters = 0;

  // Per-frame indexes: valid where the stamp equals the current frame.
  private frame = 0;
  private eventStamp = new Uint32Array(0);
  private eventTarget = new Int32Array(0);
  private elementStamp = new Uint32Array(0);
  private elementTarget = new Int32Array(0);

  /** Start a frame for `events` events and `elements` element slots. */
  reset(events: number, elements: number): void {
    this.count = 0;
    this.segLength = 0;
    this.memberLength = 0;
    this.lazyClusters = 0;
    this.frame = (this.frame + 1) >>> 0;
    if (this.frame === 0) {
      // Stamp wrapped: clear so stale stamps can't alias the new frame.
      this.eventStamp.fill(0);
      this.elementStamp.fill(0);
      this.frame = 1;
    }
    if (this.eventStamp.length < events) {
      this.eventStamp = new Uint32Array(
        Math.max(events, this.eventStamp.length * 2),
      );
      this.eventTarget = new Int32Array(this.eventStamp.length);
    }
    if (this.elementStamp.length < elements) {
      this.elementStamp = new Uint32Array(
        Math.max(elements, this.elementStamp.length * 2),
      );
      this.elementTarget = new Int32Array(this.elementStamp.length);
    }
  }

  at(index: number): Target {
    return this.pool[index] as Target;
  }

  /** Begin a new target record; fill its fields, then call {@link close}. */
  open(kind: TargetKind, ref: number): Target {
    let target = this.pool[this.count];
    if (target === undefined) {
      target = blankTarget();
      this.pool.push(target);
    }
    target.kind = kind;
    target.ref = ref;
    target.segStart = this.segLength;
    target.segCount = 0;
    target.hasNode = false;
    target.hasTargetNode = false;
    target.hasHead = false;
    target.memberStart = this.memberLength;
    target.memberCount = 0;
    target.lazy = false;
    target.width = 0;
    target.headSize = 0;
    target.radius = 0;
    return target;
  }

  /** Append a segment to the target being built. */
  segment(
    target: Target,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
  ): void {
    const i = this.segLength * 4;
    if (i + 4 > this.segments.length) {
      const next = new Float32Array(this.segments.length * 2);
      next.set(this.segments);
      this.segments = next;
    }
    this.segments[i] = x1;
    this.segments[i + 1] = y1;
    this.segments[i + 2] = x2;
    this.segments[i + 3] = y2;
    this.segLength++;
    target.segCount++;
  }

  /** Append a cluster member (event index) to the target being built. */
  member(target: Target, eventIndex: number): void {
    if (this.memberLength >= this.members.length) {
      const next = new Int32Array(this.members.length * 2);
      next.set(this.members);
      this.members = next;
    }
    this.members[this.memberLength++] = eventIndex;
    target.memberCount++;
  }

  /** Finish the target: compute its padded box and index it. */
  close(target: Target): void {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const take = (x: number, y: number) => {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    };
    const seg = this.segments;
    for (let s = target.segStart; s < target.segStart + target.segCount; s++) {
      take(seg[s * 4] as number, seg[s * 4 + 1] as number);
      take(seg[s * 4 + 2] as number, seg[s * 4 + 3] as number);
    }
    if (target.hasNode) take(target.x, target.y);
    if (target.hasTargetNode) take(target.tx, target.ty);
    if (target.hasHead) take(target.hx, target.hy);
    const pad =
      BBOX_PAD_PX + Math.max(target.width, target.headSize, target.radius);
    target.minX = minX - pad;
    target.maxX = maxX + pad;
    target.minY = minY - pad;
    target.maxY = maxY + pad;

    const index = this.count++;
    if (target.kind === TargetKind.Element) {
      this.elementStamp[target.ref] = this.frame;
      this.elementTarget[target.ref] = index;
    } else if (target.kind === TargetKind.Event) {
      this.eventStamp[target.ref] = this.frame;
      this.eventTarget[target.ref] = index;
    } else {
      // An event folded into a cluster is found through its cluster (an
      // aggregated cluster's members aren't listed: see clusterMembers).
      if (target.lazy) this.lazyClusters++;
      for (let m = 0; m < target.memberCount; m++) {
        const event = this.members[target.memberStart + m] as number;
        this.eventStamp[event] = this.frame;
        this.eventTarget[event] = index;
      }
    }
  }

  /** The target drawing event `index` this frame (its arrow or its cluster), or −1. */
  ofEvent(index: number): number {
    return this.eventStamp[index] === this.frame
      ? (this.eventTarget[index] as number)
      : -1;
  }

  /** The target drawing the element in `slot` this frame, or −1. */
  ofElement(slot: number): number {
    return this.elementStamp[slot] === this.frame
      ? (this.elementTarget[slot] as number)
      : -1;
  }
}

/** Event indices of a cluster target's members, in time order. */
export function clusterMembers<TData>(
  target: Target,
  pool: TargetPool,
  store: DataStore<TData>,
): number[] {
  const members: number[] = [];
  if (!target.lazy) {
    for (let m = 0; m < target.memberCount; m++) {
      members.push(pool.members[target.memberStart + m] as number);
    }
    return members;
  }
  const [lo, hi] = store.rangeOf(target.t0, target.t1);
  const sources = store.eventSources;
  const targets = store.eventTargets;
  for (let i = lo; i < hi; i++) {
    if (sources[i] === target.pairSource && targets[i] === target.pairTarget) {
      members.push(i);
    }
  }
  return members;
}

/** Cell size of the hit grid in CSS px (§5). */
const CELL_PX = 64;

/**
 * A uniform grid over the viewport mapping each cell to the targets whose
 * padded box overlaps it (§5). Boxes are clamped to the viewport — the pointer
 * is always on screen — so a riser hundreds of rows tall costs a column of
 * on-screen cells, not thousands. Built lazily on the first pointer query
 * after a base frame, so frames without hover pay nothing.
 */
export class HitGrid {
  private cols = 0;
  private rows = 0;
  private cellStart = new Int32Array(0);
  private items = new Int32Array(0);
  private built = false;

  constructor(
    private readonly targets: TargetPool,
    private readonly viewport: () => { cssWidth: number; cssHeight: number },
  ) {}

  /** The targets changed (a new base frame): rebuild on the next query. */
  invalidate(): void {
    this.built = false;
  }

  /** Target indices whose cell contains (x, y), in draw order. */
  query(x: number, y: number): Int32Array {
    if (!this.built) this.build();
    const cx = Math.floor(x / CELL_PX);
    const cy = Math.floor(y / CELL_PX);
    if (cx < 0 || cy < 0 || cx >= this.cols || cy >= this.rows) {
      return this.items.subarray(0, 0);
    }
    const cell = cy * this.cols + cx;
    return this.items.subarray(this.cellStart[cell], this.cellStart[cell + 1]);
  }

  private build(): void {
    this.built = true;
    const { cssWidth, cssHeight } = this.viewport();
    this.cols = Math.max(1, Math.ceil(cssWidth / CELL_PX));
    this.rows = Math.max(1, Math.ceil(cssHeight / CELL_PX));
    const cells = this.cols * this.rows;
    const counts = new Int32Array(cells + 1);
    const n = this.targets.count;
    const ranges = new Int32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const t = this.targets.at(i);
      const c0 = Math.max(0, Math.floor(t.minX / CELL_PX));
      const c1 = Math.min(this.cols - 1, Math.floor(t.maxX / CELL_PX));
      const r0 = Math.max(0, Math.floor(t.minY / CELL_PX));
      const r1 = Math.min(this.rows - 1, Math.floor(t.maxY / CELL_PX));
      ranges[i * 4] = c0;
      ranges[i * 4 + 1] = c1;
      ranges[i * 4 + 2] = r0;
      ranges[i * 4 + 3] = r1;
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) (counts[r * this.cols + c] as number)++;
      }
    }
    // Prefix sums → each cell's start offset; then fill in draw order.
    this.cellStart = new Int32Array(cells + 1);
    let total = 0;
    for (let c = 0; c < cells; c++) {
      this.cellStart[c] = total;
      total += counts[c] as number;
    }
    this.cellStart[cells] = total;
    if (this.items.length < total) this.items = new Int32Array(total);
    const cursor = this.cellStart.slice(0, cells);
    for (let i = 0; i < n; i++) {
      const c0 = ranges[i * 4] as number;
      const c1 = ranges[i * 4 + 1] as number;
      const r0 = ranges[i * 4 + 2] as number;
      const r1 = ranges[i * 4 + 3] as number;
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          const cell = r * this.cols + c;
          this.items[(cursor[cell] as number)++] = i;
        }
      }
    }
  }
}
