// A headless engine wired to recording renderers and manual frames.

import type { TimelineEngineOptions } from '../engine/options';
import { TimelineEngine } from '../engine/timeline';
import { ManualFrames } from './manualFrames';
import { RecordingRenderer } from './recordingRenderer';

export interface TestEngine<TData> {
  engine: TimelineEngine<TData>;
  base: RecordingRenderer;
  overlay: RecordingRenderer;
  frames: ManualFrames;
}

export function createTestEngine<TData = unknown>(
  options: TimelineEngineOptions<TData> = {},
  size: { width: number; height: number } = { width: 800, height: 400 },
): TestEngine<TData> {
  const base = new RecordingRenderer();
  const overlay = new RecordingRenderer();
  const frames = new ManualFrames();
  const engine = new TimelineEngine<TData>({
    renderer: { base, overlay },
    scheduler: frames,
    ...options,
  });
  if (size.width > 0) engine.resize(size.width, size.height, 1);
  return { engine, base, overlay, frames };
}
