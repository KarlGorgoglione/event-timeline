// Headless benchmark harness (DESIGN.md §13). Drives the framework-agnostic core
// engine directly — no React — on a fixed-size pair of canvases, recording each
// layer's draw cost through the engine's `onFrameStats` seam. It exposes a tiny
// imperative API on `window.__bench` that the Playwright perf spec drives under
// CPU ×4 / DPR 1 to assert the §13 frame budgets. Keeping this separate from the
// React demo gives a deterministic, allocation-light measurement path.

import { TimelineEngine, type FrameStats } from '@event-timeline/core';
import { makeSynthetic, type DemoDatum } from './synthetic';

/** Fixed CSS viewport so measurements are comparable across runs (§13). */
const CSS_WIDTH = 1280;
const CSS_HEIGHT = 720;

/** Element counts scaled per dataset size, mirroring the demo's datasets (§15). */
function elementCountFor(eventCount: number): number {
  if (eventCount >= 100_000) return 500;
  if (eventCount >= 50_000) return 400;
  if (eventCount >= 10_000) return 200;
  return 20;
}

export interface BenchApi {
  /** Replace the dataset with a seeded synthetic set of `eventCount` events. */
  load(eventCount: number): void;
  /** Frame the whole data extent — the §13 worst case (full zoom-out, O(n)). */
  fit(): void;
  /**
   * Zoom to a typical interactive window (~30 days, centred on the extent) so the
   * visible event count `k` is bounded by the time window, not the dataset — the
   * common interactive regime where pan/zoom must hold 60fps (§5, §13).
   */
  zoomInteractive(): void;
  /** Force a base redraw via a ~1px origin nudge (alternating, so it doesn't drift). */
  nudge(): void;
  /** Force an overlay-only redraw by toggling the selection set. */
  overlayNudge(): void;
  /** Clear the recorded frame buffer. */
  reset(): void;
  /** Per-frame timings recorded since the last reset(). */
  frames: FrameStats[];
}

function setup(): BenchApi {
  const root = document.getElementById('bench');
  if (root === null) throw new Error('#bench container not found');

  const base = document.createElement('canvas');
  const overlay = document.createElement('canvas');
  for (const canvas of [base, overlay]) {
    canvas.style.position = 'absolute';
    canvas.style.inset = '0';
    canvas.style.width = `${CSS_WIDTH}px`;
    canvas.style.height = `${CSS_HEIGHT}px`;
    root.appendChild(canvas);
  }

  const frames: FrameStats[] = [];
  const engine = new TimelineEngine<DemoDatum>(base, overlay, {
    onFrameStats: (stats) => frames.push(stats),
  });
  // DPR is pinned to 1 by the perf project's deviceScaleFactor (§13 baseline).
  engine.resize(CSS_WIDTH, CSS_HEIGHT, 1);

  let nudgeDir = 1;
  let selectToggle = false;
  let elementCount = 0;

  /**
   * Real `element:<id>` selection keys (matching the engine's `targetKey`), so
   * `drawOverlay` actually strokes highlights instead of skipping every target —
   * the cost the ≤4ms overlay budget bounds (§13). Element-line targets are
   * present every base draw (not window-culled away like off-screen events), so
   * a fixed slice reliably exercises `drawHighlight`. Offset by one between the
   * two toggle states so the set always changes (`select` no-ops on an equal set).
   */
  function selectionKeys(offset: number): string[] {
    const n = Math.min(10, elementCount);
    const keys: string[] = [];
    for (let i = 0; i < n; i++) {
      keys.push(`element:el-${(i + offset) % elementCount}`);
    }
    return keys;
  }

  return {
    frames,
    load(eventCount) {
      elementCount = elementCountFor(eventCount);
      engine.setData(makeSynthetic(eventCount, elementCount, 1));
    },
    fit() {
      engine.fit();
    },
    zoomInteractive() {
      engine.fit(); // establishes the extent in the viewport
      const [t0, t1] = engine.getViewport().timeRange;
      const mid = (t0 + t1) / 2;
      const halfWindowMs = 15 * 86_400_000; // ±15 days → a ~30-day window
      engine.zoomToRange(mid - halfWindowMs, mid + halfWindowMs);
    },
    nudge() {
      const view = engine.getViewport();
      const stepMs = (view.timeRange[1] - view.timeRange[0]) / CSS_WIDTH; // ~1px
      engine.panToTime(view.timeRange[0] + stepMs * nudgeDir);
      nudgeDir = -nudgeDir;
    },
    overlayNudge() {
      // Toggle between two distinct real selections so the set always changes
      // (marking the overlay dirty) and drawOverlay actually strokes the selected
      // element highlights — the cost the ≤4ms overlay budget bounds (§13).
      selectToggle = !selectToggle;
      engine.select(selectionKeys(selectToggle ? 0 : 1));
    },
    reset() {
      frames.length = 0;
    },
  };
}

declare global {
  interface Window {
    __bench?: BenchApi;
  }
}

window.__bench = setup();
