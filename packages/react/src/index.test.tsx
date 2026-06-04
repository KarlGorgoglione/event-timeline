import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Timeline } from './index';

describe('<Timeline />', () => {
  it('mounts an empty container', () => {
    render(<Timeline />);
    expect(screen.getByTestId('timeline-root')).toBeInTheDocument();
  });

  it('merges custom style over the default container style', () => {
    render(<Timeline style={{ background: 'rgb(14, 17, 22)' }} />);
    const root = screen.getByTestId('timeline-root');
    expect(root).toHaveStyle({
      position: 'relative',
      background: 'rgb(14, 17, 22)',
    });
  });
});
