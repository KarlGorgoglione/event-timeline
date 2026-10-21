// The demo's whole state: which scenario, preset, view and density, plus the
// user's edits as sparse path → value maps over the defaults. Sparse edits make
// "modified" markers, per-field resets, share links and the code export fall
// out of one structure.

import type { Theme } from '@event-timeline/react';
import {
  applyEdits,
  getPath,
  sameValue,
  type Edits,
  type LeafPath,
} from './paths';
import { DEFAULT_OPTIONS, type OptionsState } from './options';
import { applyDensity, type Density } from '../themes/density';
import { DEFAULT_PRESET, presetById, type PresetId } from '../themes/presets';
import { DEFAULT_SCENARIO, scenarioById } from '../scenarios';
import {
  DEFAULT_HOOKS,
  type HooksState,
  type Scenario,
  type ScenarioId,
} from '../scenarios/types';

export type ViewMode = 'simple' | 'advanced';
export type ThemePath = LeafPath<Theme>;
export type OptionPath = LeafPath<OptionsState>;

export interface DemoState {
  scenario: ScenarioId;
  /** Scenario variant id (Scale: '10k' | '50k'); `null` for the default. */
  variant: string | null;
  preset: PresetId;
  view: ViewMode;
  density: Density;
  themeEdits: Edits<Theme>;
  optionEdits: Edits<OptionsState>;
  /** Hook overrides over the scenario's defaults. */
  hookEdits: Partial<HooksState>;
}

export const INITIAL_STATE: DemoState = {
  scenario: DEFAULT_SCENARIO,
  variant: null,
  preset: DEFAULT_PRESET,
  view: 'simple',
  density: 'comfortable',
  themeEdits: {},
  optionEdits: {},
  hookEdits: {},
};

export type Action =
  | { type: 'scenario'; id: ScenarioId }
  | { type: 'variant'; id: string }
  | { type: 'preset'; id: PresetId }
  | { type: 'view'; view: ViewMode }
  | { type: 'density'; density: Density }
  | { type: 'theme'; path: ThemePath; value: unknown }
  | { type: 'resetTheme'; path?: ThemePath }
  | { type: 'option'; path: OptionPath; value: unknown }
  | { type: 'resetOption'; path?: OptionPath }
  | { type: 'hook'; key: keyof HooksState; value: HooksState[keyof HooksState] }
  | { type: 'resetAll' }
  | { type: 'replace'; state: DemoState };

/** Set `path` in `edits`, or drop it when the value equals the base. */
function edit<T>(
  edits: Edits<T>,
  base: T,
  path: string,
  value: unknown,
): Edits<T> {
  const next: Record<string, unknown> = { ...edits };
  if (sameValue(getPath(base, path), value)) delete next[path];
  else next[path] = value;
  return next as Edits<T>;
}

function without<T>(edits: Edits<T>, path?: string): Edits<T> {
  if (path === undefined) return {};
  const next: Record<string, unknown> = { ...edits };
  delete next[path];
  return next as Edits<T>;
}

export function reducer(state: DemoState, action: Action): DemoState {
  switch (action.type) {
    case 'scenario': {
      if (action.id === state.scenario) return state;
      // Behaviour is per scenario: its option and hook edits reset, except the
      // renderer, which is the viewer's choice. The look carries over.
      const renderer = state.optionEdits.renderer;
      return {
        ...state,
        scenario: action.id,
        variant: null,
        optionEdits: renderer === undefined ? {} : { renderer },
        hookEdits: {},
      };
    }
    case 'variant':
      return { ...state, variant: action.id };
    case 'preset':
      // A preset applies as a whole look: theme edits are discarded.
      return { ...state, preset: action.id, themeEdits: {} };
    case 'view':
      return { ...state, view: action.view };
    case 'density':
      return { ...state, density: action.density };
    case 'theme':
      return {
        ...state,
        themeEdits: edit(
          state.themeEdits,
          baseTheme(state),
          action.path,
          action.value,
        ),
      };
    case 'resetTheme':
      return { ...state, themeEdits: without(state.themeEdits, action.path) };
    case 'option':
      return {
        ...state,
        optionEdits: edit(
          state.optionEdits,
          baseOptions(scenarioById(state.scenario)),
          action.path,
          action.value,
        ),
      };
    case 'resetOption':
      return {
        ...state,
        optionEdits: without(state.optionEdits, action.path),
      };
    case 'hook': {
      const defaults = baseHooks(scenarioById(state.scenario));
      const hookEdits: Partial<HooksState> = { ...state.hookEdits };
      if (defaults[action.key] === action.value) delete hookEdits[action.key];
      else (hookEdits as Record<string, unknown>)[action.key] = action.value;
      return { ...state, hookEdits };
    }
    case 'resetAll':
      return {
        ...state,
        density: 'comfortable',
        themeEdits: {},
        optionEdits: {},
        hookEdits: {},
      };
    case 'replace':
      return action.state;
  }
}

// --- Derivations -------------------------------------------------------------

/** The preset at the chosen density: what theme edits apply over. */
export function baseTheme(state: Pick<DemoState, 'preset' | 'density'>): Theme {
  return applyDensity(presetById(state.preset).theme, state.density);
}

export function effectiveTheme(state: DemoState): Theme {
  return applyEdits(baseTheme(state), state.themeEdits);
}

/** The engine defaults with the scenario's overrides. */
export function baseOptions(scenario: Scenario): OptionsState {
  const withA11y = applyEdits(DEFAULT_OPTIONS, {
    'accessibility.label': scenario.accessibility.label,
    'accessibility.description': scenario.accessibility.description,
  });
  return applyEdits(withA11y, scenario.options ?? {});
}

export function effectiveOptions(state: DemoState): OptionsState {
  return applyEdits(
    baseOptions(scenarioById(state.scenario)),
    state.optionEdits,
  );
}

export function baseHooks(scenario: Scenario): HooksState {
  return { ...DEFAULT_HOOKS, ...scenario.hooks };
}

export function effectiveHooks(state: DemoState): HooksState {
  return { ...baseHooks(scenarioById(state.scenario)), ...state.hookEdits };
}

export function variantOf(state: DemoState): string | undefined {
  const scenario = scenarioById(state.scenario);
  return state.variant ?? scenario.variants?.[0]?.id;
}

/** How many settings differ from the defaults (shown on the reset button). */
export function editCount(state: DemoState): number {
  return (
    Object.keys(state.themeEdits).length +
    Object.keys(state.optionEdits).length +
    Object.keys(state.hookEdits).length +
    (state.density === 'comfortable' ? 0 : 1)
  );
}
