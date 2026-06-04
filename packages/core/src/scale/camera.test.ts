import { describe, expect, it } from 'vitest';
import { Camera, type RowMetrics } from './camera';

const metrics: RowMetrics = { headerHeight: 40, rowHeight: 28, rowGap: 4 };

describe('Camera transforms', () => {
  it('round-trips time ↔ screen x', () => {
    const camera = new Camera(metrics, { originTime: 1000, pxPerMs: 2 });
    expect(camera.timeToScreenX(1000)).toBe(0);
    expect(camera.timeToScreenX(1500)).toBe(1000);
    expect(camera.screenXToTime(1000)).toBe(1500);
    expect(camera.screenXToTime(camera.timeToScreenX(2345))).toBeCloseTo(2345);
  });

  it('round-trips row ↔ screen y with scroll', () => {
    const camera = new Camera(metrics, { scrollY: 10 });
    // row 0: headerHeight - scrollY = 40 - 10 = 30
    expect(camera.rowToScreenY(0)).toBe(30);
    // row 2: 40 + 2*(28+4) - 10 = 40 + 64 - 10 = 94
    expect(camera.rowToScreenY(2)).toBe(94);
    expect(camera.screenYToRow(camera.rowToScreenY(3))).toBeCloseTo(3);
  });
});

describe('Camera pan', () => {
  it('shifts originTime by -dx/pxPerMs (drag right reveals earlier time)', () => {
    const camera = new Camera(metrics, { originTime: 1000, pxPerMs: 2 });
    camera.panByPixels(100, 0);
    expect(camera.state.originTime).toBe(1000 - 100 / 2);
  });

  it('is zoom-independent: same drag yields half the time delta at 2× zoom', () => {
    const a = new Camera(metrics, { originTime: 0, pxPerMs: 1 });
    const b = new Camera(metrics, { originTime: 0, pxPerMs: 2 });
    a.panByPixels(100, 0);
    b.panByPixels(100, 0);
    expect(Math.abs(b.state.originTime)).toBeCloseTo(
      Math.abs(a.state.originTime) / 2,
    );
  });

  it('adjusts scrollY by -dy', () => {
    const camera = new Camera(metrics, { scrollY: 50 });
    camera.panByPixels(0, -20);
    expect(camera.state.scrollY).toBe(70);
  });
});

describe('Camera clamping', () => {
  it('clamps pxPerMs to the zoom bounds', () => {
    const camera = new Camera(metrics);
    camera.setPxPerMs(1000, { minPxPerMs: 0.1, maxPxPerMs: 10 });
    expect(camera.state.pxPerMs).toBe(10);
    camera.setPxPerMs(0.001, { minPxPerMs: 0.1, maxPxPerMs: 10 });
    expect(camera.state.pxPerMs).toBe(0.1);
  });

  it('clamps scrollY to [0, contentHeight - body]', () => {
    const camera = new Camera(metrics, { scrollY: 1000 });
    // body height = 200 - 40 = 160; content 500 → max scroll 340
    camera.clampScrollY(500, { cssWidth: 800, cssHeight: 200 });
    expect(camera.state.scrollY).toBe(340);

    camera.setScrollY(-50);
    camera.clampScrollY(500, { cssWidth: 800, cssHeight: 200 });
    expect(camera.state.scrollY).toBe(0);

    // content shorter than body → no scroll
    camera.setScrollY(100);
    camera.clampScrollY(50, { cssWidth: 800, cssHeight: 200 });
    expect(camera.state.scrollY).toBe(0);
  });
});
