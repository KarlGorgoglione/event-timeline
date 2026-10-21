import { describe, expect, it } from 'vitest';
import { Camera, type RowMetrics, type Viewport } from '../scale/camera';
import { visibleRowBand } from './rowBand';

const metrics: RowMetrics = { headerHeight: 44, rowHeight: 28, rowGap: 6 };
const viewport: Viewport = { cssWidth: 800, cssHeight: 400 };
// Row pitch = rowHeight + rowGap = 34; content rows start below headerHeight 44.

describe('visibleRowBand (§5)', () => {
  it('returns an empty band when there are no rows', () => {
    const camera = new Camera(metrics);
    const band = visibleRowBand(camera, viewport, 0, metrics.headerHeight);
    expect(band.firstRow).toBeGreaterThan(band.lastRow);
  });

  it('clamps the top to row 0 and pads when unscrolled', () => {
    const camera = new Camera(metrics, { scrollY: 0 });
    const band = visibleRowBand(camera, viewport, 100, metrics.headerHeight);
    expect(band.firstRow).toBe(0);
    // (400 - 44) / 34 = 10.47 -> ceil 11, + 1 pad row = 12.
    expect(band.lastRow).toBe(12);
  });

  it('pads the top so a row partially scrolled under the header is retained', () => {
    // scrollY 100 -> first fully visible row centre is row ~2; padding keeps row 1.
    const camera = new Camera(metrics, { scrollY: 100 });
    const band = visibleRowBand(camera, viewport, 100, metrics.headerHeight);
    // floor((100)/34) - 1 = floor(2.94) - 1 = 1.
    expect(band.firstRow).toBe(1);
    // ceil((400 + 100 - 44) / 34) + 1 = ceil(13.41) + 1 = 15.
    expect(band.lastRow).toBe(15);
  });

  it('clamps the bottom to the last existing row', () => {
    const camera = new Camera(metrics, { scrollY: 0 });
    const band = visibleRowBand(camera, viewport, 5, metrics.headerHeight);
    expect(band.lastRow).toBe(4);
  });
});
