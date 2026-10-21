import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { VERSION, type HitResult } from '@event-timeline/core';
import { Timeline, type TimelineData, type TimelineHandle } from './index';
import { placeTooltip, Tooltip } from './Tooltip';
import { changedFields, sameValue } from './optionsDiff';

const data: TimelineData = {
  elements: [
    { id: 'a', label: 'A' },
    { id: 'b', label: 'B' },
  ],
  events: [
    { id: 'e1', sourceId: 'a', targetId: 'b', time: Date.UTC(2026, 0, 1) },
    { id: 'e2', sourceId: 'b', targetId: 'a', time: Date.UTC(2026, 5, 1) },
  ],
};

/** Let queued animation frames (setTimeout-backed in jsdom) run. */
const nextFrames = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });

function pointerMove(target: Element, x: number, y: number): void {
  const event = new MouseEvent('pointermove', {
    clientX: x,
    clientY: y,
    bubbles: true,
  });
  Object.defineProperty(event, 'pointerId', { value: 7 });
  target.dispatchEvent(event);
}

describe('<Timeline />', () => {
  it('mounts an engine that owns its two canvas layers', () => {
    const { container } = render(<Timeline data={data} />);
    expect(screen.getByTestId('timeline-root')).toBeInTheDocument();
    expect(container.querySelectorAll('canvas')).toHaveLength(2);
    expect(container.querySelector('[role="application"]')).not.toBeNull();
  });

  it('merges custom style over the default container style', () => {
    render(<Timeline style={{ background: 'rgb(14, 17, 22)' }} />);
    expect(screen.getByTestId('timeline-root')).toHaveStyle({
      position: 'relative',
      background: 'rgb(14, 17, 22)',
    });
  });

  it('exposes the imperative handle', () => {
    const ref = createRef<TimelineHandle>();
    render(<Timeline ref={ref} data={data} />);
    expect(ref.current?.version).toBe(VERSION);
    expect(ref.current?.engine).not.toBeNull();
    expect(ref.current?.getRendererBackend()).toBe('canvas2d');
    expect(ref.current?.getViewport()?.pxPerMs).toBeGreaterThanOrEqual(0);
  });

  it('keeps one engine across re-renders with inline options and sends no changes', () => {
    const ref = createRef<TimelineHandle>();
    const { rerender } = render(
      <Timeline ref={ref} data={data} options={{ multiSelect: true }} />,
    );
    const engine = ref.current!.engine!;
    const setOptions = vi.spyOn(engine, 'setOptions');
    rerender(
      <Timeline ref={ref} data={data} options={{ multiSelect: true }} />,
    );
    rerender(
      <Timeline
        ref={ref}
        data={data}
        options={{ multiSelect: true, clustering: { enabled: true } }}
      />,
    );
    expect(ref.current!.engine).toBe(engine);
    expect(setOptions).toHaveBeenCalledTimes(1);
    expect(setOptions).toHaveBeenCalledWith({
      clustering: { enabled: true },
    });
  });

  it('applies a theme change in place, keeping the selection and the camera', () => {
    const ref = createRef<TimelineHandle>();
    const selections: unknown[] = [];
    const { rerender } = render(
      <Timeline
        ref={ref}
        data={data}
        theme={{ background: '#000' }}
        onSelectionChange={(s) => selections.push(s)}
      />,
    );
    const engine = ref.current!.engine!;
    act(() => ref.current!.select({ events: ['e1'] }));
    const setOptions = vi.spyOn(engine, 'setOptions');
    rerender(
      <Timeline
        ref={ref}
        data={data}
        theme={{ background: '#111' }}
        onSelectionChange={(s) => selections.push(s)}
      />,
    );
    expect(ref.current!.engine).toBe(engine);
    expect(setOptions).toHaveBeenCalledWith({ theme: { background: '#111' } });
    expect(ref.current!.getSelection()).toEqual({
      elements: [],
      events: ['e1'],
    });
    expect(selections).toEqual([{ elements: [], events: ['e1'] }]);
  });

  it('switches the renderer preference without replacing the engine', () => {
    const ref = createRef<TimelineHandle>();
    const { rerender } = render(
      <Timeline ref={ref} data={data} options={{ renderer: 'webgl' }} />,
    );
    const engine = ref.current!.engine;
    rerender(
      <Timeline ref={ref} data={data} options={{ renderer: 'canvas2d' }} />,
    );
    expect(ref.current!.engine).toBe(engine);
    expect(ref.current!.getRendererBackend()).toBe('canvas2d');
  });

  it('pushes a new data reference to the engine and reports the change', () => {
    const changes: unknown[] = [];
    const { rerender } = render(
      <Timeline data={data} onDataChange={(d) => changes.push(d)} />,
    );
    changes.length = 0;
    rerender(
      <Timeline
        data={{ elements: data.elements, events: [] }}
        onDataChange={(d) => changes.push(d)}
      />,
    );
    expect(changes).toEqual([
      {
        elements: { added: 0, removed: 0, updated: 2 },
        events: { added: 0, removed: 2, updated: 0 },
      },
    ]);
  });

  it('streams through the handle without a full setData', () => {
    const ref = createRef<TimelineHandle>();
    const changes: unknown[] = [];
    render(
      <Timeline ref={ref} data={data} onDataChange={(d) => changes.push(d)} />,
    );
    changes.length = 0;
    ref.current?.addEvents([
      { id: 'e3', sourceId: 'b', targetId: 'a', time: Date.UTC(2026, 1, 1) },
    ]);
    expect(changes).toEqual([
      {
        elements: { added: 0, removed: 0, updated: 0 },
        events: { added: 1, removed: 0, updated: 0 },
      },
    ]);
    ref.current?.removeElements(['b']);
    expect(ref.current?.getData()?.elements.map((e) => e.id)).toEqual(['a']);
  });

  it('returns null from the handle once unmounted', () => {
    const ref = createRef<TimelineHandle>();
    const { unmount } = render(<Timeline ref={ref} data={data} />);
    const handle = ref.current!;
    unmount();
    expect(handle.engine).toBeNull();
    expect(handle.getViewport()).toBeNull();
    expect(handle.getRendererBackend()).toBeNull();
  });

  it('shows the tooltip on hover and hides it when the pointer leaves', async () => {
    const ref = createRef<TimelineHandle>();
    render(<Timeline ref={ref} data={data} />);
    act(() => ref.current!.engine!.resize(800, 400, 1));
    const root = screen
      .getByTestId('timeline-root')
      .querySelector('[role="application"]')!;
    // Row 0 centre with the default theme: header 44 + half a 28px row.
    act(() => pointerMove(root, 400, 58));
    await nextFrames();
    expect(screen.getByTestId('timeline-tooltip')).toHaveTextContent('A');
    act(() => {
      root.dispatchEvent(new MouseEvent('pointerleave'));
    });
    expect(screen.queryByTestId('timeline-tooltip')).toBeNull();
  });

  it('shows no tooltip with tooltip={false}', async () => {
    const ref = createRef<TimelineHandle>();
    render(<Timeline ref={ref} data={data} tooltip={false} />);
    act(() => ref.current!.engine!.resize(800, 400, 1));
    const root = screen
      .getByTestId('timeline-root')
      .querySelector('[role="application"]')!;
    act(() => pointerMove(root, 400, 58));
    await nextFrames();
    expect(screen.queryByTestId('timeline-tooltip')).toBeNull();
  });
});

describe('<Tooltip /> (§9, §12)', () => {
  const eventHit: HitResult = {
    kind: 'event',
    event: {
      id: 'e1',
      sourceId: 'a',
      targetId: 'b',
      time: Date.UTC(2026, 2, 4),
      label: '$5,000',
    },
  };

  it('uses the render prop for content when provided', () => {
    render(
      <Tooltip
        hit={eventHit}
        x={0}
        y={0}
        render={(h) => (
          <span data-testid="custom">
            {h.kind === 'event'
              ? new Date(h.event.time).toISOString().slice(0, 10)
              : ''}
          </span>
        )}
      />,
    );
    expect(screen.getByTestId('custom')).toHaveTextContent('2026-03-04');
  });

  it('renders nothing when the render prop returns null', () => {
    render(<Tooltip hit={eventHit} x={0} y={0} render={() => null} />);
    expect(screen.queryByTestId('timeline-tooltip')).toBeNull();
  });

  it('falls back to the formatted label without a render prop', () => {
    render(
      <Tooltip
        hit={{ kind: 'element', element: { id: 'a', label: 'Acme' } }}
        x={0}
        y={0}
        formatters={{ elementLabel: (e) => `EL:${e.id}` }}
      />,
    );
    expect(screen.getByTestId('timeline-tooltip')).toHaveTextContent('EL:a');
  });

  it('lists the members of a cluster', () => {
    const events = Array.from({ length: 7 }, (_, i) => ({
      id: `e${i}`,
      sourceId: 'a',
      targetId: 'b',
      time: 0,
      label: `pay ${i}`,
    }));
    render(<Tooltip hit={{ kind: 'cluster', events, count: 7 }} x={0} y={0} />);
    const tip = screen.getByTestId('timeline-tooltip');
    expect(tip).toHaveTextContent('7 events');
    expect(tip).toHaveTextContent('pay 0');
    expect(tip).toHaveTextContent('… and 2 more');
  });

  it('flips to the other side of the pointer near the viewport edges', () => {
    const el = document.createElement('div');
    Object.defineProperty(el, 'offsetWidth', { value: 100 });
    Object.defineProperty(el, 'offsetHeight', { value: 30 });
    document.body.appendChild(el);
    placeTooltip(el, 10, 10);
    expect([el.style.left, el.style.top]).toEqual(['22px', '22px']);
    placeTooltip(el, window.innerWidth - 5, window.innerHeight - 5);
    expect(el.style.left).toBe(`${window.innerWidth - 5 - 12 - 100}px`);
    expect(el.style.top).toBe(`${window.innerHeight - 5 - 12 - 30}px`);
  });
});

describe('option diffing (§12)', () => {
  it('compares plain data structurally and functions by reference', () => {
    const fn = () => 1;
    expect(sameValue({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBe(true);
    expect(sameValue({ a: 1 }, { a: 2 })).toBe(false);
    expect(sameValue(fn, fn)).toBe(true);
    expect(
      sameValue(
        () => 1,
        () => 1,
      ),
    ).toBe(false);
  });

  it('reports changed and removed fields only', () => {
    expect(changedFields({ a: 1, b: { c: 2 } }, { a: 1, b: { c: 2 } })).toBe(
      null,
    );
    expect(
      changedFields<{ a?: number; b?: number }>({ a: 1, b: 2 }, { a: 3 }),
    ).toEqual({ a: 3, b: undefined });
  });
});
