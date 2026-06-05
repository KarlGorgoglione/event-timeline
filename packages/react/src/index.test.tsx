import { createRef } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VERSION } from '@event-timeline/core';
import { Timeline, type TimelineData, type TimelineHandle } from './index';

const data: TimelineData = {
  elements: [
    { id: 'a', label: 'A' },
    { id: 'b', label: 'B' },
  ],
  events: [
    { id: 'e1', sourceId: 'a', targetId: 'b', time: Date.UTC(2026, 0, 1) },
  ],
};

describe('<Timeline />', () => {
  it('mounts the container with two canvas layers', () => {
    const { container } = render(<Timeline />);
    expect(screen.getByTestId('timeline-root')).toBeInTheDocument();
    expect(container.querySelectorAll('canvas')).toHaveLength(2);
  });

  it('merges custom style over the default container style', () => {
    render(<Timeline style={{ background: 'rgb(14, 17, 22)' }} />);
    const root = screen.getByTestId('timeline-root');
    expect(root).toHaveStyle({
      position: 'relative',
      background: 'rgb(14, 17, 22)',
    });
  });

  it('mounts with a dataset without throwing', () => {
    expect(() => render(<Timeline data={data} />)).not.toThrow();
  });

  it('exposes the imperative handle via ref', () => {
    const ref = createRef<TimelineHandle>();
    render(<Timeline ref={ref} data={data} />);
    expect(ref.current?.version).toBe(VERSION);
    expect(typeof ref.current?.fit).toBe('function');
    expect(typeof ref.current?.setData).toBe('function');
  });

  it('exposes the streaming methods on the handle (§10, §12)', () => {
    const ref = createRef<TimelineHandle>();
    render(<Timeline ref={ref} data={data} />);
    expect(typeof ref.current?.addEvents).toBe('function');
    expect(typeof ref.current?.removeEvents).toBe('function');
    expect(typeof ref.current?.addElements).toBe('function');
    expect(typeof ref.current?.updateElement).toBe('function');
  });

  it('addEvents on the handle fires onDataChange without a full setData', () => {
    const ref = createRef<TimelineHandle>();
    const changes: { added: number; removed: number; updated: number }[] = [];
    render(
      <Timeline ref={ref} data={data} onDataChange={(d) => changes.push(d)} />,
    );
    changes.length = 0; // ignore the initial setData from mounting with data

    ref.current?.addEvents([
      { id: 'e2', sourceId: 'b', targetId: 'a', time: Date.UTC(2026, 1, 1) },
    ]);

    expect(changes).toEqual([{ added: 1, removed: 0, updated: 0 }]);
  });
});
