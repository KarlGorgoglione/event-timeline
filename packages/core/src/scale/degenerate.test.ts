import { describe, expect, it } from 'vitest';
import {
  Camera,
  DEFAULT_WINDOW_MS,
  type RowMetrics,
  type Viewport,
  computeZoomBounds,
  effectiveExtent,
  fit,
} from './camera';

const metrics: RowMetrics = { headerHeight: 40, rowHeight: 28, rowGap: 4 };
const viewport: Viewport = { cssWidth: 1000, cssHeight: 600 };
const NOW = Date.UTC(2026, 5, 4);

describe('effectiveExtent (§3.1)', () => {
  it('centres a default window on now for an empty dataset', () => {
    const eff = effectiveExtent(null, NOW);
    expect(eff.maxTime - eff.minTime).toBe(DEFAULT_WINDOW_MS);
    expect((eff.minTime + eff.maxTime) / 2).toBe(NOW);
  });

  it('centres a default window on a single instant', () => {
    const instant = Date.UTC(2026, 0, 1);
    const eff = effectiveExtent({ minTime: instant, maxTime: instant }, NOW);
    expect(eff.maxTime - eff.minTime).toBe(DEFAULT_WINDOW_MS);
    expect((eff.minTime + eff.maxTime) / 2).toBe(instant);
  });

  it('returns a real extent unchanged', () => {
    const extent = { minTime: 1000, maxTime: 5000 };
    expect(effectiveExtent(extent, NOW)).toEqual(extent);
  });
});

describe('computeZoomBounds', () => {
  it('never produces non-finite bounds for empty/degenerate data', () => {
    for (const extent of [null, { minTime: 100, maxTime: 100 }] as const) {
      const bounds = computeZoomBounds(extent, viewport, NOW);
      expect(Number.isFinite(bounds.minPxPerMs)).toBe(true);
      expect(Number.isFinite(bounds.maxPxPerMs)).toBe(true);
      expect(bounds.minPxPerMs).toBeGreaterThan(0);
    }
  });
});

describe('fit', () => {
  it('produces a finite pxPerMs and sensible origin for empty data', () => {
    const camera = new Camera(metrics);
    fit(camera, null, viewport, NOW);
    expect(Number.isFinite(camera.state.pxPerMs)).toBe(true);
    expect(camera.state.pxPerMs).toBeGreaterThan(0);
    expect(camera.state.scrollY).toBe(0);
    // left edge sits at the start of the default window
    expect(camera.timeToScreenX(NOW - DEFAULT_WINDOW_MS / 2)).toBeCloseTo(0);
  });

  it('frames a real extent across the viewport width', () => {
    const camera = new Camera(metrics);
    // A 100-day span keeps pxPerMs below the max-day-width clamp.
    const extent = { minTime: 0, maxTime: 100 * 86_400_000 };
    fit(camera, extent, viewport, NOW);
    expect(camera.timeToScreenX(extent.minTime)).toBeCloseTo(0);
    expect(camera.timeToScreenX(extent.maxTime)).toBeCloseTo(viewport.cssWidth);
  });

  it('reserves a left inset so the extent start clears the edge (§1)', () => {
    const camera = new Camera(metrics);
    const extent = { minTime: 0, maxTime: 100 * 86_400_000 };
    const left = 120;
    fit(camera, extent, viewport, NOW, { left });
    // Extent start sits at the inset, not the edge; extent end at usable width.
    expect(camera.timeToScreenX(extent.minTime)).toBeCloseTo(left);
    expect(camera.timeToScreenX(extent.maxTime)).toBeCloseTo(viewport.cssWidth);
    // The fitted zoom must be permitted by the bounds, so it survives a re-clamp.
    const bounds = computeZoomBounds(extent, viewport, NOW, { left });
    camera.setPxPerMs(camera.state.pxPerMs, bounds);
    expect(camera.timeToScreenX(extent.minTime)).toBeCloseTo(left);
  });
});
