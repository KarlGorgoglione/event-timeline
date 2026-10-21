// What every panel can reach: the derived state, the dispatcher, the timeline
// handle and the fast-changing stores. One context keeps prop lists short.

import {
  createContext,
  useContext,
  type Dispatch,
  type RefObject,
} from 'react';
import type {
  Diagnostic,
  FrameStats,
  Selection,
  Theme,
  TimelineHandle,
  ViewportState,
} from '@event-timeline/react';
import type { Action, DemoState } from './state';
import type { OptionsState } from './options';
import type { Ring, Store } from './store';
import type { ThemePreset } from '../themes/presets';
import type { Datum, DemoData, HooksState, Scenario } from '../scenarios/types';

export interface LogEntry {
  at: number;
  type: string;
  text: string;
}

export interface TimedFrame extends FrameStats {
  at: number;
}

export interface LiveSettings {
  running: boolean;
  /** Events per second. */
  rate: number;
  follow: boolean;
  /** Most events kept; the oldest are removed past it. */
  cap: number;
}

export interface DemoRuntime {
  state: DemoState;
  dispatch: Dispatch<Action>;
  scenario: Scenario;
  variant: string | undefined;
  preset: ThemePreset;
  theme: Theme;
  options: OptionsState;
  hooks: HooksState;
  /** The dataset last handed to `setData` (streams mutate past it). */
  data: DemoData;
  loading: boolean;
  /** Replace the data (Playground) without changing scenario. */
  replaceData: (data: DemoData) => void;
  selection: Selection;
  handle: RefObject<TimelineHandle<Datum> | null>;
  backend: string;
  version: string;
  viewport: Store<ViewportState | null>;
  /** Bumped (throttled) when the engine reports a data change. */
  dataRevision: Store<number>;
  /** What the engine holds (valid items only, streams included). */
  counts: Store<{ elements: number; events: number }>;
  frames: Ring<TimedFrame>;
  log: Ring<LogEntry>;
  diagnostics: Store<readonly Diagnostic[]>;
  live: LiveSettings;
  setLive: (patch: Partial<LiveSettings>) => void;
  /** Scale scenario: stream extra events into the visible window. */
  scaleStream: boolean;
  setScaleStream: (on: boolean) => void;
  openShortcuts: () => void;
}

export const DemoContext = createContext<DemoRuntime | null>(null);

export function useDemo(): DemoRuntime {
  const ctx = useContext(DemoContext);
  if (ctx === null) throw new Error('useDemo outside <DemoContext>');
  return ctx;
}
