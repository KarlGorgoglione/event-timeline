import { createRef } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VERSION } from '@timeline/core';
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
});
