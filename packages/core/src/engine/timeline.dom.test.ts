// @vitest-environment jsdom
//
// Engine behaviour that needs a DOM: mounting the surface and driving it with
// pointer input. jsdom has no PointerEvent or pointer capture, so pointer
// events are MouseEvents carrying a pointerId, and capture is stubbed.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HitResult } from '../interaction/hit';
import { DataStore } from '../model/store';
import type { TimelineData } from '../model/types';
import { ManualFrames } from '../testing/manualFrames';
import { RecordingRenderer } from '../testing/recordingRenderer';
import { TimelineEngine } from './timeline';

const DAY = 86_400_000;
// Default theme: header 44, row 28, gap 6 → row r centre = 44 + r*34 + 14.
const rowCentre = (row: number) => 44 + row * 34 + 14;

function pointer(
  type: string,
  x: number,
  y: number,
  init: { button?: number; ctrlKey?: boolean } = {},
): MouseEvent {
  const event = new MouseEvent(type, {
    clientX: x,
    clientY: y,
    button: init.button ?? 0,
    ctrlKey: init.ctrlKey ?? false,
    bubbles: true,
  });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  return event;
}

function click(target: Element, x: number, y: number, button = 0): void {
  target.dispatchEvent(pointer('pointerdown', x, y, { button }));
  target.dispatchEvent(pointer('pointerup', x, y, { button }));
}

function mounted(
  options: ConstructorParameters<typeof TimelineEngine>[0] = {},
) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const base = new RecordingRenderer();
  const overlay = new RecordingRenderer();
  const frames = new ManualFrames();
  const engine = new TimelineEngine({
    renderer: { base, overlay },
    scheduler: frames,
    ...options,
  });
  engine.mount(container, { autoResize: false });
  engine.resize(800, 400, 1);
  const root = container.firstElementChild as HTMLElement;
  return { engine, container, root, base, overlay, frames };
}

beforeEach(() => {
  HTMLElement.prototype.setPointerCapture = () => {};
  HTMLElement.prototype.releasePointerCapture = () => {};
  HTMLElement.prototype.hasPointerCapture = () => false;
  // jsdom has no canvas contexts; return null quietly instead of logging.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

const data: TimelineData = {
  elements: [
    { id: 'a', label: 'A' },
    { id: 'b', label: 'B' },
  ],
  events: [
    { id: 'e1', sourceId: 'a', targetId: 'b', time: Date.UTC(2026, 0, 1) },
    { id: 'e2', sourceId: 'b', targetId: 'a', time: Date.UTC(2026, 11, 31) },
  ],
};

describe('TimelineEngine.mount (§2, §4)', () => {
  it('creates an accessible, focusable wrapper with base and overlay canvases', () => {
    const { engine, root } = mounted({
      accessibility: { label: 'Payments', description: 'Flows in 2026' },
    });
    expect(root.getAttribute('role')).toBe('application');
    expect(root.getAttribute('aria-label')).toBe('Payments');
    expect(root.tabIndex).toBe(0);
    const describedBy = root.getAttribute('aria-describedby');
    expect(describedBy).not.toBeNull();
    expect(document.getElementById(describedBy!)?.textContent).toBe(
      'Flows in 2026',
    );
    expect(root.querySelectorAll('canvas')).toHaveLength(1); // custom renderers: overlay slot only
    expect(root.style.touchAction).toBe('none');
    engine.dispose();
  });

  it('creates its own canvases for a backend preference and degrades without contexts', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const diagnostics: string[] = [];
    const engine = new TimelineEngine({
      renderer: 'canvas2d',
      onDiagnostic: (d) => diagnostics.push(d.code),
    });
    engine.mount(container, { autoResize: false });
    expect(container.querySelectorAll('canvas')).toHaveLength(2);
    expect(engine.getRendererBackend()).toBeNull(); // jsdom: no 2D context
    expect(diagnostics).toContain('renderer-fallback');
    engine.dispose();
  });

  it('unmount() removes the surface and keeps the data', () => {
    const { engine, container } = mounted();
    engine.setData(data);
    engine.unmount();
    expect(container.children).toHaveLength(0);
    expect(engine.getViewport().pxPerMs).toBeGreaterThan(0);
    engine.dispose();
  });
});

describe('TimelineEngine pointer input (§9)', () => {
  it('clicking an element line selects the element', () => {
    const { engine, root, frames } = mounted();
    engine.setData(data);
    frames.run();
    const changes: unknown[] = [];
    engine.on('selectionChange', (s) => changes.push(s));
    click(root, 400, rowCentre(0));
    expect(changes).toEqual([{ elements: ['a'], events: [] }]);
    engine.dispose();
  });

  it('ignores non-primary mouse buttons', () => {
    const { engine, root, frames } = mounted();
    engine.setData(data);
    frames.run();
    click(root, 400, rowCentre(0), 2);
    expect(engine.getSelection()).toEqual({ elements: [], events: [] });
    engine.dispose();
  });

  it('clicking a cluster expands it by zooming to its member span', () => {
    const { engine, root, frames } = mounted();
    const burst = Date.UTC(2026, 6, 1);
    engine.setData({
      elements: data.elements,
      events: [
        ...data.events,
        ...Array.from({ length: 5 }, (_, i) => ({
          id: `burst-${i}`,
          sourceId: 'a',
          targetId: 'b',
          time: burst + i * DAY,
        })),
      ],
    });
    frames.run();
    const before = engine.getViewport();
    const meanTime = burst + 2 * DAY;
    const x = (meanTime - before.timeRange[0]) * before.pxPerMs;
    click(root, x, (rowCentre(0) + rowCentre(1)) / 2);
    const after = engine.getViewport();
    expect(after.timeRange[1] - after.timeRange[0]).toBeLessThan(
      before.timeRange[1] - before.timeRange[0],
    );
    engine.dispose();
  });

  it('navigates with the keyboard while focused (§9, R-09)', () => {
    const { engine, root, frames } = mounted();
    engine.setData(data);
    frames.run();
    const press = (key: string) =>
      root.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    const fitted = engine.getViewport();
    press('ArrowRight');
    const panned = engine.getViewport();
    expect(panned.timeRange[0]).toBeGreaterThan(fitted.timeRange[0]);
    press('+');
    expect(engine.getViewport().pxPerMs).toBeCloseTo(fitted.pxPerMs * 1.5);
    press('0');
    expect(engine.getViewport().pxPerMs).toBeCloseTo(fitted.pxPerMs);
    engine.select({ elements: ['a'] });
    press('Escape');
    expect(engine.getSelection()).toEqual({ elements: [], events: [] });

    engine.setOptions({ keyboard: false });
    const before = engine.getViewport().timeRange;
    press('ArrowRight');
    expect(engine.getViewport().timeRange).toEqual(before);
    engine.dispose();
  });

  it('hovers an aggregated cluster without resolving it every frame (§6)', () => {
    const { engine, root, frames } = mounted({
      clustering: { maxMarkers: 100 },
    });
    const at = Date.UTC(2026, 6, 1);
    const stack = (time: number, prefix: string) =>
      Array.from({ length: 400 }, (_, i) => ({
        id: `${prefix}${i}`,
        sourceId: 'a',
        targetId: 'b',
        time,
      }));
    engine.setData({
      elements: data.elements,
      events: [...stack(at, 'x'), ...stack(at + 30 * DAY, 'y')],
    });
    frames.run();
    const hovers: HitResult[] = [];
    engine.on('hover', (hit) => {
      if (hit !== null) hovers.push(hit);
    });
    const view = engine.getViewport();
    const x = (at - view.timeRange[0]) * view.pxPerMs;
    root.dispatchEvent(
      pointer('pointermove', x, (rowCentre(0) + rowCentre(1)) / 2),
    );
    frames.run();
    expect(hovers).toHaveLength(1);
    const hit = hovers[0]!;
    expect(hit.kind === 'cluster' && [hit.count, hit.events.length]).toEqual([
      400, 400,
    ]);

    // Base redraws under a still pointer re-check the hover from the target
    // alone: no member list is rebuilt, and no new hover is emitted.
    const reads = vi.spyOn(DataStore.prototype, 'eventAt');
    const msPerPx = 1 / view.pxPerMs;
    for (let i = 1; i <= 3; i++) {
      engine.panToTime(view.timeRange[0] + (i % 2) * msPerPx);
      frames.run();
    }
    expect(reads.mock.calls.length).toBeLessThan(30);
    expect(hovers).toHaveLength(1);
    reads.mockRestore();
    engine.dispose();
  });

  it('hover resolves on the overlay frame and emits on change', () => {
    const { engine, root, frames } = mounted();
    engine.setData(data);
    frames.run();
    const hovers: (string | null)[] = [];
    engine.on('hover', (hit) => hovers.push(hit?.kind ?? null));
    root.dispatchEvent(pointer('pointermove', 400, rowCentre(0)));
    expect(hovers).toEqual([]); // coalesced to the next frame
    frames.run();
    expect(hovers).toEqual(['element']);
    root.dispatchEvent(new MouseEvent('pointerleave'));
    expect(hovers).toEqual(['element', null]);
    engine.dispose();
  });
});
