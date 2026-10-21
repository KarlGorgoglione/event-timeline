import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useDemo } from '../../app/context';
import { StageToolbar } from './StageToolbar';
import { OverviewStrip } from './OverviewStrip';
import { StatusBar } from './StatusBar';
import { HintPill } from './HintPill';

/** The timeline card: toolbar, canvas, overview and status bar. */
export function Stage({ children }: { children: ReactNode }) {
  const { loading, scenario, variant } = useDemo();
  const size = scenario.variants?.find((v) => v.id === variant)?.label;
  const ref = useRef<HTMLElement>(null);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const onChange = () =>
      setFullscreen(document.fullscreenElement === ref.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void ref.current?.requestFullscreen?.();
  };

  return (
    <main className="stage" ref={ref} aria-label={scenario.title}>
      <StageToolbar fullscreen={fullscreen} onFullscreen={toggleFullscreen} />
      <div className="stage__canvas">
        {children}
        <HintPill />
        {loading && (
          <div className="loading" role="status">
            <span className="spinner" aria-hidden="true" />
            Generating {size === undefined ? 'data' : `${size} events`}…
          </div>
        )}
      </div>
      <OverviewStrip />
      <StatusBar />
    </main>
  );
}
