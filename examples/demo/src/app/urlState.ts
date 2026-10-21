// The state in the address bar, so any view can be shared or bookmarked:
// `?scenario=aml&theme=paper&view=advanced&density=compact&renderer=webgl`,
// with the sparse edits as base64url JSON in `#e=…`. Parsing is lenient like
// the engine (§1): unknown ids and paths are dropped, never thrown.

import { defaultTheme } from '@event-timeline/react';
import { getPath, leafPaths } from './paths';
import { DEFAULT_OPTIONS } from './options';
import { INITIAL_STATE, type DemoState } from './state';
import { DENSITIES, type Density } from '../themes/density';
import { isPresetId } from '../themes/presets';
import { isScenarioId, scenarioById } from '../scenarios';
import { DEFAULT_HOOKS, type HooksState } from '../scenarios/types';

const THEME_PATHS = new Set(leafPaths(defaultTheme));
const OPTION_PATHS = new Set(leafPaths(DEFAULT_OPTIONS));
const RENDERERS = new Set(['auto', 'canvas2d', 'webgl']);

export function encodeJson(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function decodeJson(text: string): unknown {
  try {
    const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(b64);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    return null;
  }
}

/** Keep only known paths whose value has the default's type. */
function cleanEdits(
  raw: unknown,
  paths: ReadonlySet<string>,
  base: unknown,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (typeof raw !== 'object' || raw === null) return out;
  for (const [path, value] of Object.entries(raw)) {
    if (!paths.has(path)) continue;
    const ref = getPath(base, path);
    const ok = Array.isArray(ref)
      ? Array.isArray(value) && value.every((v) => typeof v === 'number')
      : typeof value === typeof ref;
    if (ok) out[path] = value;
  }
  return out;
}

function cleanHooks(raw: unknown): Partial<HooksState> {
  return cleanEdits(raw, new Set(Object.keys(DEFAULT_HOOKS)), DEFAULT_HOOKS);
}

export function stateFromUrl(search: string, hash: string): DemoState {
  const q = new URLSearchParams(search);
  const scenario = q.get('scenario') ?? '';
  const preset = q.get('theme') ?? '';
  const density = q.get('density') ?? '';
  const variant = q.get('variant');
  const renderer = q.get('renderer') ?? '';

  const state: DemoState = { ...INITIAL_STATE };
  if (isScenarioId(scenario)) state.scenario = scenario;
  if (
    variant !== null &&
    scenarioById(state.scenario).variants?.some((v) => v.id === variant)
  ) {
    state.variant = variant;
  }
  if (isPresetId(preset)) state.preset = preset;
  if (q.get('view') === 'advanced') state.view = 'advanced';
  if (DENSITIES.some((d) => d.value === density)) {
    state.density = density as Density;
  }

  const e = new URLSearchParams(hash.replace(/^#/, '')).get('e');
  const edits = e === null ? null : decodeJson(e);
  if (typeof edits === 'object' && edits !== null) {
    const { t, o, h } = edits as Record<string, unknown>;
    state.themeEdits = cleanEdits(t, THEME_PATHS, defaultTheme);
    state.optionEdits = cleanEdits(o, OPTION_PATHS, DEFAULT_OPTIONS);
    state.hookEdits = cleanHooks(h);
  }
  if (RENDERERS.has(renderer)) {
    state.optionEdits = {
      ...state.optionEdits,
      renderer: renderer as DemoState['optionEdits']['renderer'],
    };
  }
  return state;
}

/** `?…#…` for a state; defaults are left out to keep links short. */
export function urlFromState(state: DemoState): string {
  const q = new URLSearchParams();
  if (state.scenario !== INITIAL_STATE.scenario)
    q.set('scenario', state.scenario);
  if (state.variant !== null) q.set('variant', state.variant);
  if (state.preset !== INITIAL_STATE.preset) q.set('theme', state.preset);
  if (state.view !== INITIAL_STATE.view) q.set('view', state.view);
  if (state.density !== INITIAL_STATE.density) q.set('density', state.density);

  const { renderer, ...optionEdits } = state.optionEdits;
  if (renderer !== undefined) q.set('renderer', renderer);

  const edits: Record<string, unknown> = {};
  if (Object.keys(state.themeEdits).length > 0) edits.t = state.themeEdits;
  if (Object.keys(optionEdits).length > 0) edits.o = optionEdits;
  if (Object.keys(state.hookEdits).length > 0) edits.h = state.hookEdits;

  const search = q.toString();
  const hash = Object.keys(edits).length > 0 ? `#e=${encodeJson(edits)}` : '';
  return `${search === '' ? '' : `?${search}`}${hash}`;
}
