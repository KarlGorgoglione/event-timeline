// Frame rate and frame cost from `onFrameStats` (§13). The engine draws on
// demand, so with nothing moving it reports "idle" rather than 60 fps.

import { useDemo, type TimedFrame } from '../../app/context';
import { usePolled } from '../../app/store';
import { quantile } from '../../perfStats';

export interface FrameSummary {
  fps: number;
  baseP50: number;
  baseP95: number;
  overlayP50: number;
}

export function summarizeFrames(
  frames: readonly TimedFrame[],
  now: number,
): FrameSummary {
  const recent = frames.filter((f) => f.layer === 'base' && now - f.at < 1000);
  const base = frames
    .filter((f) => f.layer === 'base')
    .slice(-120)
    .map((f) => f.durationMs);
  const overlay = frames
    .filter((f) => f.layer === 'overlay')
    .slice(-120)
    .map((f) => f.durationMs);
  return {
    fps: recent.length,
    baseP50: base.length ? quantile(base, 0.5) : 0,
    baseP95: base.length ? quantile(base, 0.95) : 0,
    overlayP50: overlay.length ? quantile(overlay, 0.5) : 0,
  };
}

export function useFrameSummary(): FrameSummary {
  const { frames } = useDemo();
  const key = usePolled(
    () => `${frames.version}:${Math.floor(performance.now() / 250)}`,
    250,
  );
  void key;
  return summarizeFrames(frames.values(), performance.now());
}

export function FpsMeter() {
  const s = useFrameSummary();
  const idle = s.fps === 0;
  return (
    <span
      className="pill pill--mono"
      data-idle={idle || undefined}
      title="Base-layer frames in the last second · median base draw time"
    >
      {idle ? 'idle' : `${s.fps} fps`} · {s.baseP50.toFixed(1)} ms
    </span>
  );
}
