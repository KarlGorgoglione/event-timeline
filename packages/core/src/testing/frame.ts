// Test helper: build one frame from plain data at dpr 1 and decode the
// output buffers into readable objects.

import type { DataChangeCounts } from '../model/store';
import { DataStore } from '../model/store';
import type { TimelineData } from '../model/types';
import { computeRowLayout } from '../layout/positions';
import { resolveConfig, type TimelineOptions } from '../engine/options';
import { Camera, type CameraState } from '../scale/camera';
import type { IconResolution } from '../scene/context';
import type {
  LineBuffer,
  NodeBuffer,
  ArrowheadBuffer,
  TextBuffer,
} from '../scene/buffers';
import { FrameBuilder } from '../scene/frame';
import { StyleTable } from '../scene/styles';

export interface TestFrameOptions extends TimelineOptions {
  camera?: Partial<CameraState>;
  rowIds?: string[];
  width?: number;
  height?: number;
  dpr?: number;
  resolveIcon?: IconResolution;
  spread?: (index: number) => boolean;
  maxPxPerMs?: number;
}

export function testFrame(data: TimelineData, options: TestFrameOptions = {}) {
  const diagnostics: string[] = [];
  const store = new DataStore({
    onDiagnostic: (d) => diagnostics.push(d.code),
  });
  const counts: DataChangeCounts = store.setData(data);
  // Geometry tests default to a single-arrow world with labels always on.
  const config = resolveConfig(
    {
      clustering: { enabled: false },
      lod: { eventLabelMinPxPerMs: 0 },
      ...options,
    },
    (d) => diagnostics.push(d.code),
  );
  const camera = new Camera(config.metrics, {
    originTime: 0,
    pxPerMs: 1,
    scrollY: 0,
    ...options.camera,
  });
  const rows = computeRowLayout(
    options.rowIds ?? data.elements.map((e) => e.id),
    config.metrics,
  );
  const styles = new StyleTable({
    store,
    config: () => config,
    onDiagnostic: (d) => diagnostics.push(d.code),
  });
  const measured: string[] = [];
  const frame = new FrameBuilder();
  /** Build a frame with the same builder, after moving the camera. */
  const redraw = (state: Partial<CameraState> = {}) => {
    if (state.originTime !== undefined) camera.setOriginTime(state.originTime);
    if (state.scrollY !== undefined) camera.setScrollY(state.scrollY);
    if (state.pxPerMs !== undefined) {
      camera.setPxPerMs(state.pxPerMs, { minPxPerMs: 0, maxPxPerMs: Infinity });
    }
    build();
    return frame.out;
  };
  const build = () =>
    frame.build({
      store,
      rows,
      camera,
      viewport: {
        cssWidth: options.width ?? 800,
        cssHeight: options.height ?? 400,
      },
      dpr: options.dpr ?? 1,
      config,
      styles,
      measure: (text) => {
        measured.push(text);
        return text.length * 6;
      },
      resolveIcon: () => options.resolveIcon ?? { kind: 'none' },
      isSpread: options.spread ?? (() => false),
      maxPxPerMs: options.maxPxPerMs ?? 1e9,
    });
  build();
  return {
    redraw,
    out: frame.out,
    store,
    camera,
    config,
    diagnostics,
    measured,
    counts,
  };
}

export function segments(buffer: LineBuffer) {
  const list = [];
  for (let s = 0; s < buffer.count; s++) {
    const c = buffer.coords;
    list.push({
      x1: c[s * 4]!,
      y1: c[s * 4 + 1]!,
      x2: c[s * 4 + 2]!,
      y2: c[s * 4 + 3]!,
      join: buffer.joins[s] === 1,
    });
  }
  return list;
}

export function points(buffer: NodeBuffer) {
  const list = [];
  for (let i = 0; i < buffer.count; i++) {
    list.push({ x: buffer.coords[i * 2]!, y: buffer.coords[i * 2 + 1]! });
  }
  return list;
}

export function heads(buffer: ArrowheadBuffer) {
  const list = [];
  for (let i = 0; i < buffer.count; i++) {
    list.push({
      x: buffer.coords[i * 3]!,
      y: buffer.coords[i * 3 + 1]!,
      angle: buffer.coords[i * 3 + 2]!,
    });
  }
  return list;
}

export function texts(buffer: TextBuffer) {
  const list = [];
  for (let i = 0; i < buffer.count; i++) {
    list.push({ x: buffer.xs[i]!, y: buffer.ys[i]!, text: buffer.texts[i]! });
  }
  return list;
}
