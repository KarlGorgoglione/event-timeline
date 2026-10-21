// Event arrows and cluster markers (DESIGN.md §1, §4, §5, §6).
//
// Each event is an orthogonal arrow at one instant: a vertical riser between
// the source and target rows, a dot at the source (and at the landing point),
// and a direction-aware arrowhead that stops at the target line's near edge.
// A self-event is a small rectangular loop on its own line.
//
// Culling: a binary search over the sorted times selects the horizontal
// window (§5), then the row-interval test drops arrows whose rows miss the
// visible band. Survivors are cut into clusters (§6); a run that zoom can't
// separate (same instant, or the deepest zoom) is drawn spread out instead of
// collapsed, so every event stays reachable. Labels become candidates for the
// collision pass rather than being drawn directly.
//
// Zoomed far out over many events, the candidates are aggregated cells (per
// element pair and time bin, see aggregates.ts) instead of single events,
// each weighted by its event count, so the frame never touches the events
// themselves; the clustering and drawing below are the same for both.

import { ClusterRuns, fastKeyFunction } from '../cluster/cluster';
import { hairlineOffset } from '../render/device';
import { fastKeyKind } from '../cluster/strategies';
import {
  EventAggregates,
  levelForDuration,
  levelWidth,
  MAX_LEVEL,
  type AggregateLevel,
} from './aggregates';
import type { EventsInput, LabelsInput } from './context';
import {
  headBuffer,
  nodeBuffer,
  rectBuffer,
  strokeBuffer,
  textBuffer,
} from './groups';
import type { SceneOutput } from './output';
import { RowIntervalIndex } from './rowIndex';
import type { ResolvedEventStyle } from './styles';
import { TargetKind, type Target } from './targets';

/** Slack each side for the horizontal cull (arrowhead/node/loop extent). */
const HORIZONTAL_MARGIN_PX = 48;
/** Polyline segments approximating one hop semicircle. */
const HOP_ARC_STEPS = 6;
/** Spacing between the members of a spread-out cluster, CSS px. */
export const SPREAD_PX = 10;
const ANGLE_DOWN = Math.PI / 2;
const ANGLE_UP = -Math.PI / 2;
const PRIORITY_CLUSTER = 0;
const PRIORITY_EVENT = 1;
/**
 * A time window holding more events than this consults the row index, and
 * uses it when fewer than half of the window's events can meet the band.
 */
const ROW_INDEX_MIN_EVENTS = 2048;
/**
 * Aggregation hysteresis (§6): a frame leaves the aggregated path, or moves
 * to a finer level, only once its count is this fraction of the budget, so a
 * count hovering at the budget doesn't regroup every marker each frame.
 */
const AGGREGATE_HYSTERESIS = 0.75;
/** A coarser level must cut the cells by at least this fraction to be used. */
const MIN_LEVEL_REDUCTION = 0.25;

export class EventBuilder<TData> {
  // Per-candidate scratch, reused across frames.
  private index = new Int32Array(256);
  private x = new Float64Array(256);
  private time = new Float64Array(256);
  private source = new Int32Array(256);
  private target = new Int32Array(256);
  private sourceRow = new Int32Array(256);
  private targetRow = new Int32Array(256);
  // Aggregated candidates only: events in the cell, its last event index and
  // last event time (`index` and `time` hold the first).
  private weight = new Int32Array(256);
  private last = new Int32Array(256);
  private timeMax = new Float64Array(256);
  /** Whether this frame's candidates are aggregated cells. */
  private weighted = false;
  /** Candidates in use, including events appended for spread runs. */
  private used = 0;
  private spreadList = new Int32Array(64);
  private readonly aggregates = new EventAggregates();
  /** Hysteresis state: whether the last frame aggregated, and at which level. */
  private aggregating = false;
  private aggregateLevel = 0;
  private readonly runs = new ClusterRuns();
  private readonly rowIndex = new RowIntervalIndex();
  private indexed = new Int32Array(0);
  /** Arrows already placed per rounded pixel column (sub-lane nudges). */
  private columns = new Int32Array(0);
  private hopYs: number[] = [];
  /** Label anchor geometry, reused for every arrow. */
  private readonly geometry: LabelGeometry = {
    x: 0,
    ySource: 0,
    dir: 1,
    sideX: 0,
    midY: 0,
    nodeGap: 0,
  };
  // Theme-derived cluster style ids, interned once per frame.
  private clusterStroke = 0;
  private clusterMarker = 0;
  private clusterFont = 0;
  /** Width of each "×N" count label, by N, for the current cluster font. */
  private readonly countWidths = new Map<number, number>();
  private countWidthsFont = '';

  build(input: EventsInput<TData>, out: SceneOutput): void {
    const { store, camera, viewport, band, config, slotRow } = input;
    const tStart = camera.screenXToTime(-HORIZONTAL_MARGIN_PX);
    const tEnd = camera.screenXToTime(viewport.cssWidth + HORIZONTAL_MARGIN_PX);
    const [lo, hi] = store.rangeOf(tStart, tEnd);
    const { pxPerMs } = camera.state;
    const atMaxZoom = pxPerMs >= input.maxPxPerMs * (1 - 1e-9);
    const { clustering } = config;
    const clusterOn = clustering.enabled && !atMaxZoom;
    const level = clusterOn
      ? this.chooseLevel(input, this.eventCost(input, lo, hi), tStart, tEnd)
      : this.stopAggregating();
    const n =
      level === null
        ? this.collect(input, lo, hi, slotRow, band)
        : this.collectCells(input, level, tStart, tEnd);
    this.used = n;
    if (n === 0) return;
    const { theme } = config;
    const { styles } = input;
    this.clusterStroke = styles.stroke(
      theme.cluster.color,
      theme.event.arrowWidth,
    );
    this.clusterMarker = styles.fill(
      theme.cluster.color,
      theme.event.nodeRadius + theme.cluster.markerBonus,
    );
    this.clusterFont = styles.font(
      theme.cluster.textColor,
      theme.event.labelFont,
    );

    // Cells coarser than the merge distance merge per bin-wide column.
    const separation =
      level === null
        ? clustering.minSeparationPx
        : Math.max(
            clustering.minSeparationPx,
            camera.durationToPx(levelWidth(level.level)),
          );
    this.runs.build(
      n,
      this.x,
      clusterOn ? this.keyFunction(input, separation) : () => 0,
      clusterOn ? separation : -1,
    );

    // Hops are decided per frame (so a frame never mixes styles), from an
    // upper bound on the crossings the single arrows would hop.
    const { arrows } = config;
    let hops = arrows.hops === true;
    if (arrows.hops === 'auto') {
      let crossings = 0;
      for (
        let r = 0;
        r < this.runs.count && crossings <= arrows.hopBudget;
        r++
      ) {
        const start = this.runs.start[r] as number;
        const size = this.runs.size[r] as number;
        const events = this.runEvents(r);
        if (events > 1 && !this.isSpread(input, r, events, atMaxZoom)) {
          continue;
        }
        for (let j = 0; j < size; j++) {
          const k = this.runs.members[start + j] as number;
          crossings += this.rowsCrossed(k, band) * this.weightOf(k);
        }
      }
      hops = crossings <= arrows.hopBudget;
    }

    this.resetColumns(viewport.cssWidth);
    const labelsOn = pxPerMs >= config.lod.eventLabelMinPxPerMs;
    for (let r = 0; r < this.runs.count; r++) {
      const start = this.runs.start[r] as number;
      const size = this.runs.size[r] as number;
      const events = this.runEvents(r);
      if (events === 1) {
        const k = this.runs.members[start] as number;
        this.single(input, out, k, this.x[k] as number, true, hops, labelsOn);
      } else if (this.isSpread(input, r, events, atMaxZoom)) {
        const members = this.runMembers(input, start, size);
        let centre = 0;
        for (const k of members) centre += this.x[k] as number;
        centre /= members.length;
        for (let j = 0; j < members.length; j++) {
          const k = members[j] as number;
          const x = centre + (j - (members.length - 1) / 2) * SPREAD_PX;
          this.single(input, out, k, x, false, hops, labelsOn);
        }
      } else {
        this.cluster(input, out, start, size, events);
      }
    }
  }

  /**
   * Gather the candidates in `[lo, hi)` whose rows meet the band: from the
   * time window directly, or — when the window holds many events most of
   * which can't reach the band (zoomed out over many rows) — from the row
   * index, so the rest are never touched.
   */
  private collect(
    input: EventsInput<TData>,
    lo: number,
    hi: number,
    slotRow: Int32Array,
    band: { firstRow: number; lastRow: number },
  ): number {
    const { store, camera } = input;
    let span = hi - lo;
    let picked: Int32Array | null = null;
    if (span > ROW_INDEX_MIN_EVENTS) {
      const index = this.rowIndex;
      index.ensure(store, slotRow, input.rows.rowCount, input.rows);
      const estimate = index.estimate(band.firstRow, band.lastRow);
      if (estimate < span / 2) {
        if (this.indexed.length < estimate) {
          this.indexed = new Int32Array(
            Math.max(estimate, this.indexed.length * 2),
          );
        }
        span = index.query(band.firstRow, band.lastRow, lo, hi, this.indexed);
        picked = this.indexed;
      }
    }
    this.weighted = false;
    this.ensureCandidates(span, 0);
    const times = store.eventTimes;
    const sources = store.eventSources;
    const targets = store.eventTargets;
    let n = 0;
    for (let q = 0; q < span; q++) {
      const i = picked === null ? lo + q : (picked[q] as number);
      const s = sources[i] as number;
      const d = targets[i] as number;
      const rs = slotRow[s] as number;
      const rd = slotRow[d] as number;
      if (rs < 0 || rd < 0) continue;
      // §5 row-interval test: keep unless the spanned rows miss the band.
      if (Math.max(rs, rd) < band.firstRow || Math.min(rs, rd) > band.lastRow) {
        continue;
      }
      const t = times[i] as number;
      this.index[n] = i;
      this.time[n] = t;
      this.x[n] = camera.timeToScreenX(t);
      this.source[n] = s;
      this.target[n] = d;
      this.sourceRow[n] = rs;
      this.targetRow[n] = rd;
      n++;
    }
    return n;
  }

  private keyFunction(
    input: EventsInput<TData>,
    minSeparationPx: number,
  ): (k: number) => number | string {
    const { strategy } = input.config.clustering;
    const kind = fastKeyKind(strategy);
    if (kind !== undefined) {
      return fastKeyFunction(kind, {
        x: this.x,
        time: this.time,
        source: this.source,
        target: this.target,
        elementCount: Math.max(1, input.store.elementCount),
        minSeparationPx,
      });
    }
    const { store, camera } = input;
    const ctx = {
      minSeparationPx,
      timeToScreenX: (t: number) => camera.timeToScreenX(t),
    };
    return (k) => strategy.key(store.eventAt(this.index[k] as number), ctx);
  }

  private isSpread(
    input: EventsInput<TData>,
    run: number,
    events: number,
    atMaxZoom: boolean,
  ): boolean {
    if (events < 2) return false;
    if (atMaxZoom) return true;
    const first = this.runs.members[this.runs.start[run] as number] as number;
    return input.isSpread(this.index[first] as number);
  }

  /** Events candidate `k` stands for (more than one only for a cell). */
  private weightOf(k: number): number {
    return this.weighted ? (this.weight[k] as number) : 1;
  }

  /** Events in run `r`. */
  private runEvents(r: number): number {
    const size = this.runs.size[r] as number;
    if (!this.weighted) return size;
    const start = this.runs.start[r] as number;
    let events = 0;
    for (let j = 0; j < size; j++) {
      events += this.weight[this.runs.members[start + j] as number] as number;
    }
    return events;
  }

  /**
   * Candidate positions of every event of a run, in time order. Aggregated
   * cells are expanded: their events are read back from the store and
   * appended as candidates of their own.
   */
  private runMembers(
    input: EventsInput<TData>,
    start: number,
    size: number,
  ): Int32Array {
    const members = this.runs.members;
    if (!this.weighted) return members.subarray(start, start + size);
    let events = 0;
    for (let j = 0; j < size; j++) {
      events += this.weight[members[start + j] as number] as number;
    }
    this.ensureCandidates(this.used + events, this.used);
    if (this.spreadList.length < events) {
      this.spreadList = new Int32Array(
        Math.max(events, this.spreadList.length * 2),
      );
    }
    const { store, camera } = input;
    const times = store.eventTimes;
    const sources = store.eventSources;
    const targets = store.eventTargets;
    let w = 0;
    for (let j = 0; j < size; j++) {
      const k = members[start + j] as number;
      const s = this.source[k] as number;
      const d = this.target[k] as number;
      const [lo, hi] = store.rangeOf(
        this.time[k] as number,
        this.timeMax[k] as number,
      );
      for (let i = lo; i < hi; i++) {
        if (sources[i] !== s || targets[i] !== d) continue;
        const p = this.used++;
        const t = times[i] as number;
        this.index[p] = i;
        this.last[p] = i;
        this.weight[p] = 1;
        this.time[p] = t;
        this.timeMax[p] = t;
        this.x[p] = camera.timeToScreenX(t);
        this.source[p] = s;
        this.target[p] = d;
        this.sourceRow[p] = this.sourceRow[k] as number;
        this.targetRow[p] = this.targetRow[k] as number;
        this.spreadList[w++] = p;
      }
    }
    return this.spreadList.subarray(0, w);
  }

  /** Room for `n` candidates, keeping the first `keep`. */
  private ensureCandidates(n: number, keep: number): void {
    if (n <= this.index.length) return;
    const size = Math.max(n, this.index.length * 2);
    const int = (a: Int32Array<ArrayBuffer>) => {
      const next = new Int32Array(size);
      if (keep > 0) next.set(a.subarray(0, keep));
      return next;
    };
    const float = (a: Float64Array<ArrayBuffer>) => {
      const next = new Float64Array(size);
      if (keep > 0) next.set(a.subarray(0, keep));
      return next;
    };
    this.index = int(this.index);
    this.x = float(this.x);
    this.time = float(this.time);
    this.source = int(this.source);
    this.target = int(this.target);
    this.sourceRow = int(this.sourceRow);
    this.targetRow = int(this.targetRow);
    this.weight = int(this.weight);
    this.last = int(this.last);
    this.timeMax = float(this.timeMax);
  }

  /**
   * Events the event path would touch for `[lo, hi)`: the whole window, or
   * the row index's estimate of those meeting the band (§5).
   */
  private eventCost(input: EventsInput<TData>, lo: number, hi: number): number {
    const span = hi - lo;
    if (span <= ROW_INDEX_MIN_EVENTS) return span;
    const index = this.rowIndex;
    index.ensure(input.store, input.slotRow, input.rows.rowCount, input.rows);
    return Math.min(
      span,
      index.estimate(input.band.firstRow, input.band.lastRow),
    );
  }

  private stopAggregating(): null {
    this.aggregating = false;
    return null;
  }

  /**
   * The aggregate level to draw this frame from, or null for the event path
   * (§6). Aggregation applies to the pair-keyed strategies once the event
   * path would touch more than `maxMarkers` events. It starts at the
   * coarsest level whose bins fit in the merge distance, coarsens while the
   * window holds more cells than the budget (and coarsening still pays), and
   * is used only when the cells are far fewer than the events.
   */
  private chooseLevel(
    input: EventsInput<TData>,
    cost: number,
    tStart: number,
    tEnd: number,
  ): AggregateLevel | null {
    const { store, config, camera } = input;
    const { strategy, minSeparationPx, maxMarkers } = config.clustering;
    const kind = fastKeyKind(strategy);
    const enter = this.aggregating
      ? maxMarkers * AGGREGATE_HYSTERESIS
      : maxMarkers;
    if (
      (kind !== 'pair' && kind !== 'pair-column') ||
      !(cost > enter) ||
      !this.aggregates.mayCompress(store)
    ) {
      return this.stopAggregating();
    }
    const aggregates = this.aggregates;
    const cells = (level: number): number => {
      const [a, b] = aggregates.window(
        aggregates.level(store, level),
        tStart,
        tEnd,
      );
      return b - a;
    };
    // Bins at most one merge column wide.
    const base = levelForDuration(camera.pxToDuration(minSeparationPx));
    let level = this.aggregating ? Math.max(base, this.aggregateLevel) : base;
    while (
      level > base &&
      cells(level - 1) <= maxMarkers * AGGREGATE_HYSTERESIS
    ) {
      level--;
    }
    let count = cells(level);
    while (count > maxMarkers && level < MAX_LEVEL) {
      const coarser = cells(level + 1);
      if (coarser > count * (1 - MIN_LEVEL_REDUCTION)) break;
      level++;
      count = coarser;
    }
    if (count * 2 > cost) return this.stopAggregating();
    this.aggregating = true;
    this.aggregateLevel = level;
    return aggregates.level(store, level);
  }

  /** Gather the cells of `level` in the window whose rows meet the band. */
  private collectCells(
    input: EventsInput<TData>,
    level: AggregateLevel,
    tStart: number,
    tEnd: number,
  ): number {
    const { camera, slotRow, band } = input;
    const [lo, hi] = this.aggregates.window(level, tStart, tEnd);
    this.weighted = true;
    this.ensureCandidates(hi - lo, 0);
    let n = 0;
    for (let c = lo; c < hi; c++) {
      const s = level.source[c] as number;
      const d = level.target[c] as number;
      const rs = slotRow[s] as number;
      const rd = slotRow[d] as number;
      if (rs < 0 || rd < 0) continue;
      if (Math.max(rs, rd) < band.firstRow || Math.min(rs, rd) > band.lastRow) {
        continue;
      }
      const t0 = level.tMin[c] as number;
      const t1 = level.tMax[c] as number;
      this.index[n] = level.first[c] as number;
      this.last[n] = level.last[c] as number;
      this.weight[n] = level.size[c] as number;
      this.time[n] = t0;
      this.timeMax[n] = t1;
      this.x[n] = camera.timeToScreenX((t0 + t1) / 2);
      this.source[n] = s;
      this.target[n] = d;
      this.sourceRow[n] = rs;
      this.targetRow[n] = rd;
      n++;
    }
    return n;
  }

  private resetColumns(width: number): void {
    const size = Math.ceil(width) + 2 * HORIZONTAL_MARGIN_PX + 2;
    if (this.columns.length < size) this.columns = new Int32Array(size);
    else this.columns.fill(0, 0, size);
  }

  /** Nudge for the next arrow in `x`'s pixel column (§1), CSS px. */
  private subLane(input: EventsInput<TData>, x: number): number {
    const { subLaneStep, subLaneMax } = input.config.arrows;
    const column = Math.round(x) + HORIZONTAL_MARGIN_PX;
    if (column < 0 || column >= this.columns.length) return 0;
    const k = this.columns[column] as number;
    this.columns[column] = k + 1;
    return Math.min(k, subLaneMax) * subLaneStep;
  }

  /** Draw one event as an arrow (or self-loop) at screen x. */
  private single(
    input: EventsInput<TData>,
    out: SceneOutput,
    k: number,
    baseX: number,
    useSubLane: boolean,
    hops: boolean,
    labelsOn: boolean,
  ): void {
    const { camera, config, styles, dpr } = input;
    const { theme } = config;
    const index = this.index[k] as number;
    const resolved = styles.event(index);
    const style = resolved.style;
    const x = useSubLane ? baseX + this.subLane(input, baseX) : baseX;
    const halfRow = theme.layout.rowHeight / 2;
    const ySource = camera.rowToScreenY(this.sourceRow[k] as number) + halfRow;
    const lines = this.lineBuffer(input, out, resolved.stroke);
    const off = hairlineOffset(lines.width);
    const target = out.targets.open(TargetKind.Event, index);
    target.width = style.arrowWidth;
    target.headSize = style.arrowheadSize;
    target.radius = style.nodeRadius;
    const g = this.geometry;

    if (this.source[k] === this.target[k]) {
      // Self-event: a rectangular half-loop above the line, returning to a
      // downward arrowhead, with the source dot on the line.
      const loop = style.arrowheadSize * 2;
      const top = ySource - loop;
      const x0 = Math.round(x * dpr) + off;
      const x1 = Math.round((x + loop) * dpr) + off;
      const y0 = Math.round(ySource * dpr) + off;
      const y1 = Math.round(top * dpr) + off;
      lines.push(x0, y0, x0, y1);
      lines.push(x0, y1, x1, y1, true);
      lines.push(x1, y1, x1, y0, true);
      out.targets.segment(target, x, ySource, x, top);
      out.targets.segment(target, x, top, x + loop, top);
      out.targets.segment(target, x + loop, top, x + loop, ySource);
      this.node(input, out, resolved, x, ySource);
      this.head(input, out, resolved, x + loop, ySource, ANGLE_DOWN);
      setNode(target, x, ySource);
      setHead(target, x + loop, ySource, ANGLE_DOWN);
      if (labelsOn) {
        g.x = x;
        g.ySource = ySource;
        g.dir = -1;
        g.sideX = x + loop + theme.layout.eventLabelGap;
        g.midY = ySource;
        g.nodeGap = style.nodeRadius + theme.layout.eventLabelGap;
      }
    } else {
      const yTarget =
        camera.rowToScreenY(this.targetRow[k] as number) + halfRow;
      const dir = yTarget > ySource ? 1 : -1;
      // Land on the near edge of the target line's thickness (§1).
      const targetLine = styles.element(this.target[k] as number).style
        .lineWidth;
      const anchorY =
        yTarget - dir * (targetLine / 2) - dir * style.arrowheadSize;
      const crossings = hops ? this.crossings(input, k, index) : EMPTY;
      if (crossings.length === 0) {
        const sx = Math.round(x * dpr) + off;
        lines.push(
          sx,
          Math.round(ySource * dpr) + off,
          sx,
          Math.round(anchorY * dpr) + off,
        );
        out.targets.segment(target, x, ySource, x, anchorY);
      } else {
        this.hopRiser(
          input,
          lines,
          off,
          target,
          out,
          x,
          ySource,
          anchorY,
          crossings,
          dir,
        );
      }
      this.node(input, out, resolved, x, ySource);
      setNode(target, x, ySource);
      if (config.arrows.targetDot) {
        this.node(input, out, resolved, x, yTarget);
        target.tx = x;
        target.ty = yTarget;
        target.hasTargetNode = true;
      }
      const angle = dir > 0 ? ANGLE_DOWN : ANGLE_UP;
      this.head(input, out, resolved, x, anchorY, angle);
      setHead(target, x, anchorY, angle);
      if (labelsOn) {
        g.x = x;
        g.ySource = ySource;
        g.dir = dir;
        g.sideX = x + style.arrowWidth / 2 + theme.layout.eventLabelGap;
        g.midY = (ySource + yTarget) / 2;
        g.nodeGap = style.nodeRadius + theme.layout.eventLabelGap;
      }
    }
    out.targets.close(target);

    if (labelsOn) {
      const text = config.formatEventLabel(input.store.eventAt(index));
      if (text) this.label(input, out, resolved, text, g);
    }
  }

  /** Visible rows strictly between the endpoints of candidate `k`. */
  private rowsCrossed(
    k: number,
    band: { firstRow: number; lastRow: number },
  ): number {
    const a = this.sourceRow[k] as number;
    const b = this.targetRow[k] as number;
    const first = Math.max(Math.min(a, b) + 1, band.firstRow);
    const last = Math.min(Math.max(a, b) - 1, band.lastRow);
    return last >= first ? last - first + 1 : 0;
  }

  /** Screen-y of each visible intermediary line the riser of `k` crosses. */
  private crossings(
    input: EventsInput<TData>,
    k: number,
    index: number,
  ): number[] {
    const { band, rowSlot, store, camera, config } = input;
    const a = this.sourceRow[k] as number;
    const b = this.targetRow[k] as number;
    // Only rows strictly between the endpoints, and only on-screen ones, can
    // be visibly crossed — so the scan is bounded by the viewport height.
    const first = Math.max(Math.min(a, b) + 1, band.firstRow);
    const last = Math.min(Math.max(a, b) - 1, band.lastRow);
    this.hopYs.length = 0;
    if (last < first) return this.hopYs;
    const t = store.eventTimes[index] as number;
    const mins = store.extentMins;
    const maxs = store.extentMaxs;
    const halfRow = config.theme.layout.rowHeight / 2;
    for (let r = first; r <= last; r++) {
      const slot = rowSlot[r] as number;
      // NaN bounds (no events, so no line) fail both tests and are skipped.
      if (!(t >= (mins[slot] as number) && t <= (maxs[slot] as number)))
        continue;
      this.hopYs.push(camera.rowToScreenY(r) + halfRow);
    }
    return this.hopYs;
  }

  /**
   * The riser from `yFrom` to `yTo`, bulging +x by a semicircular hop at each
   * crossing (§1), as one joined polyline.
   */
  private hopRiser(
    input: EventsInput<TData>,
    lines: {
      push(a: number, b: number, c: number, d: number, join?: boolean): void;
    },
    off: number,
    target: Target,
    out: SceneOutput,
    x: number,
    yFrom: number,
    yTo: number,
    crossings: readonly number[],
    dir: number,
  ): void {
    const { dpr } = input;
    const radius = input.config.arrows.hopRadius;
    const snap = (v: number) => Math.round(v * dpr) + off;
    let px = x;
    let py = yFrom;
    let joined = false;
    const to = (nx: number, ny: number) => {
      lines.push(snap(px), snap(py), snap(nx), snap(ny), joined);
      out.targets.segment(target, px, py, nx, ny);
      joined = true;
      px = nx;
      py = ny;
    };
    if (radius > 0) {
      // Crossings arrive in row order; walk them in travel order.
      const ordered = dir > 0 ? crossings : [...crossings].reverse();
      for (const cy of ordered) {
        to(x, cy - dir * radius);
        for (let s = 1; s < HOP_ARC_STEPS; s++) {
          const theta = (Math.PI * s) / HOP_ARC_STEPS;
          to(x + radius * Math.sin(theta), cy - dir * radius * Math.cos(theta));
        }
        to(x, cy + dir * radius);
      }
    }
    to(x, yTo);
  }

  /**
   * Draw a collapsed run of `events` events as a count marker on a riser
   * over its rows (§6).
   */
  private cluster(
    input: EventsInput<TData>,
    out: SceneOutput,
    start: number,
    size: number,
    events: number,
  ): void {
    const { camera, config, styles, dpr } = input;
    const { theme } = config;
    const members = this.runs.members;
    let minRow = Infinity;
    let maxRow = -Infinity;
    let xSum = 0;
    let t0 = Infinity;
    let t1 = -Infinity;
    let firstEvent = Infinity;
    let lastEvent = -1;
    const k0 = members[start] as number;
    let pairSource = this.source[k0] as number;
    let pairTarget = this.target[k0] as number;
    for (let j = 0; j < size; j++) {
      const k = members[start + j] as number;
      const a = this.sourceRow[k] as number;
      const b = this.targetRow[k] as number;
      minRow = Math.min(minRow, a, b);
      maxRow = Math.max(maxRow, a, b);
      xSum += (this.x[k] as number) * this.weightOf(k);
      const time = this.time[k] as number;
      const index = this.index[k] as number;
      t0 = Math.min(t0, time);
      t1 = Math.max(t1, this.weighted ? (this.timeMax[k] as number) : time);
      firstEvent = Math.min(firstEvent, index);
      lastEvent = Math.max(
        lastEvent,
        this.weighted ? (this.last[k] as number) : index,
      );
      if (this.source[k] !== pairSource || this.target[k] !== pairTarget) {
        pairSource = -1;
        pairTarget = -1;
      }
    }
    const x = xSum / events;
    const halfRow = theme.layout.rowHeight / 2;
    const yTop = camera.rowToScreenY(minRow) + halfRow;
    const yBot = camera.rowToScreenY(maxRow) + halfRow;
    const yMid = (yTop + yBot) / 2;
    const width = theme.event.arrowWidth;
    const markerRadius = theme.event.nodeRadius + theme.cluster.markerBonus;
    const snap = (v: number) => Math.round(v * dpr);

    const target = out.targets.open(TargetKind.Cluster, -1);
    target.width = width;
    target.radius = markerRadius;
    target.count = events;
    target.firstEvent = firstEvent;
    target.lastEvent = lastEvent;
    target.t0 = t0;
    target.t1 = t1;
    target.pairSource = pairSource;
    target.pairTarget = pairTarget;
    // A run holding a multi-event cell describes its members instead of
    // listing them: aggregation only runs for pair-keyed strategies, so they
    // are exactly the events of that pair in [t0, t1].
    target.lazy = events !== size;
    // The cluster riser is always solid, keeping it distinct from dashed
    // single arrows; the marker carries the meaning.
    if (yTop !== yBot) {
      const lines = this.lineBuffer(input, out, this.clusterStroke);
      const off = hairlineOffset(lines.width);
      lines.push(
        snap(x) + off,
        snap(yTop) + off,
        snap(x) + off,
        snap(yBot) + off,
      );
      out.targets.segment(target, x, yTop, x, yBot);
    }
    nodeBuffer(out.nodes, styles, this.clusterMarker, dpr).push(
      snap(x),
      snap(yMid),
    );
    setNode(target, x, yMid);
    if (!target.lazy) {
      for (let j = 0; j < size; j++) {
        out.targets.member(
          target,
          this.index[members[start + j] as number] as number,
        );
      }
    }
    out.targets.close(target);

    const fontId = this.clusterFont;
    const c = out.candidate();
    const text = `×${events}`;
    const px = styles.fonts.values[fontId]!.px;
    const w = this.countWidth(input, events, text);
    c.priority = PRIORITY_CLUSTER;
    c.text = text;
    c.x = x + markerRadius + theme.layout.eventLabelGap;
    c.y = yMid;
    c.boxX = c.x;
    c.boxY = yMid - px / 2;
    c.boxW = w;
    c.boxH = px;
    c.fontId = fontId;
    c.align = 'left';
    c.boxFill = -1;
    c.boxBorder = -1;
  }

  /** Forget measured widths (the renderer or the fonts changed). */
  clearMeasurements(): void {
    this.countWidths.clear();
  }

  /** Cached width of a count label: thousands of markers share a few counts. */
  private countWidth(
    input: EventsInput<TData>,
    size: number,
    text: string,
  ): number {
    const font = input.config.theme.event.labelFont;
    if (font !== this.countWidthsFont) {
      this.countWidths.clear();
      this.countWidthsFont = font;
    }
    let width = this.countWidths.get(size);
    if (width === undefined) {
      width = input.measure(text, font);
      this.countWidths.set(size, width);
    }
    return width;
  }

  /** Queue an event label (and its themed box) for the collision pass. */
  private label(
    input: EventsInput<TData>,
    out: SceneOutput,
    resolved: ResolvedEventStyle,
    text: string,
    g: LabelGeometry,
  ): void {
    const style = resolved.style;
    const font = input.styles.fonts.values[resolved.text]!;
    const pad = style.labelBoxPadding;
    // Placement only moves the anchor; the box is part of the style (§11).
    let x: number;
    let y: number;
    let align: 'left' | 'center';
    if (input.config.eventLabel.placement === 'sourceNode') {
      const halfBox = font.px / 2 + pad;
      x = g.x;
      y = g.ySource - g.dir * (g.nodeGap + halfBox);
      align = 'center';
    } else {
      x = g.sideX;
      y = g.midY;
      align = 'left';
    }
    const width = input.measure(text, style.labelFont);
    const textLeft = align === 'center' ? x - width / 2 : x;
    const c = out.candidate();
    c.priority = PRIORITY_EVENT;
    c.text = text;
    c.x = x;
    c.y = y;
    c.boxX = textLeft - pad;
    c.boxY = y - font.px / 2 - pad;
    c.boxW = width + 2 * pad;
    c.boxH = font.px + 2 * pad;
    c.fontId = resolved.text;
    c.align = align;
    c.boxFill = resolved.boxFill;
    c.boxBorder = resolved.boxBorder;
  }

  private lineBuffer(
    input: EventsInput<TData>,
    out: SceneOutput,
    strokeId: number,
  ) {
    return strokeBuffer(out.eventLines, input.styles, strokeId, input.dpr);
  }

  private node(
    input: EventsInput<TData>,
    out: SceneOutput,
    resolved: ResolvedEventStyle,
    x: number,
    y: number,
  ): void {
    const { styles, dpr } = input;
    nodeBuffer(out.nodes, styles, resolved.node, dpr).push(
      Math.round(x * dpr),
      Math.round(y * dpr),
    );
  }

  private head(
    input: EventsInput<TData>,
    out: SceneOutput,
    resolved: ResolvedEventStyle,
    x: number,
    y: number,
    angle: number,
  ): void {
    const { styles, dpr } = input;
    headBuffer(out.heads, styles, resolved.head, dpr).push(
      Math.round(x * dpr),
      Math.round(y * dpr),
      angle,
    );
  }
}

/** Where an event label may anchor; each placement reads what it needs. */
interface LabelGeometry {
  /** Riser x and source-node centre y. */
  x: number;
  ySource: number;
  /** Arrow direction: 1 points down, −1 up. */
  dir: number;
  /** Left edge of a side (midpoint) label, already clear of the riser. */
  sideX: number;
  /** Vertical centre of a side label. */
  midY: number;
  /** Clearance a node-anchored label keeps from the source dot. */
  nodeGap: number;
}

const EMPTY: readonly number[] = [];

function setNode(target: Target, x: number, y: number): void {
  target.x = x;
  target.y = y;
  target.hasNode = true;
}

function setHead(target: Target, x: number, y: number, angle: number): void {
  target.hx = x;
  target.hy = y;
  target.angle = angle;
  target.hasHead = true;
}

/** Place queued labels by priority, against the occupancy grid (§4). */
export function placeLabels<TData>(
  input: LabelsInput<TData>,
  out: SceneOutput,
): void {
  const { styles, dpr, config } = input;
  const order: number[] = [];
  for (let i = 0; i < out.candidateCount; i++) order.push(i);
  order.sort(
    (a, b) =>
      out.candidateAt(a).priority - out.candidateAt(b).priority || a - b,
  );
  const avoid = config.labels.avoidCollisions;
  const snap = (v: number) => Math.round(v * dpr);
  for (const i of order) {
    const c = out.candidateAt(i);
    const placed = avoid
      ? out.labels.tryPlace(c.boxX, c.boxY, c.boxW, c.boxH)
      : out.labels.placeAnyway(c.boxX, c.boxY, c.boxW, c.boxH);
    if (!placed) continue;
    if (c.boxFill >= 0) {
      rectBuffer(out.boxFills, styles, c.boxFill).push(
        snap(c.boxX),
        snap(c.boxY),
        snap(c.boxW),
        snap(c.boxH),
      );
    }
    if (c.boxBorder >= 0) {
      const border = strokeBuffer(out.boxBorders, styles, c.boxBorder, dpr);
      const off = hairlineOffset(border.width);
      const l = snap(c.boxX) + off;
      const t = snap(c.boxY) + off;
      const r = snap(c.boxX + c.boxW) + off;
      const btm = snap(c.boxY + c.boxH) + off;
      border.push(l, t, r, t);
      border.push(r, t, r, btm, true);
      border.push(r, btm, l, btm, true);
      border.push(l, btm, l, t, true);
    }
    textBuffer(out.eventText, styles, c.fontId, c.align, dpr).push(
      snap(c.x),
      snap(c.y),
      c.text,
    );
  }
}
