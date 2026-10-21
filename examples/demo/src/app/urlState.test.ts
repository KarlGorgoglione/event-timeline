import { describe, expect, it } from 'vitest';
import { INITIAL_STATE, reducer, type DemoState } from './state';
import { decodeJson, encodeJson, stateFromUrl, urlFromState } from './urlState';

const roundTrip = (state: DemoState) => {
  const url = urlFromState(state);
  const [search, hash = ''] = url.split('#');
  return stateFromUrl(search ?? '', hash === '' ? '' : `#${hash}`);
};

describe('URL state', () => {
  it('leaves the defaults out', () => {
    expect(urlFromState(INITIAL_STATE)).toBe('');
    expect(stateFromUrl('', '')).toEqual(INITIAL_STATE);
  });

  it('round-trips ids, view, density, renderer and edits', () => {
    let state = reducer(INITIAL_STATE, { type: 'scenario', id: 'scale' });
    state = reducer(state, { type: 'variant', id: '50k' });
    state = reducer(state, { type: 'preset', id: 'paper' });
    state = reducer(state, { type: 'view', view: 'advanced' });
    state = reducer(state, { type: 'density', density: 'compact' });
    state = reducer(state, {
      type: 'option',
      path: 'renderer',
      value: 'webgl',
    });
    state = reducer(state, {
      type: 'option',
      path: 'clustering.minSeparationPx',
      value: 20,
    });
    state = reducer(state, { type: 'theme', path: 'grid.dash', value: [2, 2] });
    state = reducer(state, {
      type: 'theme',
      path: 'event.labelFont',
      value: '600 12px Ünïcödé',
    });
    state = reducer(state, { type: 'hook', key: 'tooltip', value: 'off' });

    const url = urlFromState(state);
    expect(url).toMatch(
      /^\?scenario=scale&variant=50k&theme=paper&view=advanced&density=compact&renderer=webgl#e=/,
    );
    expect(roundTrip(state)).toEqual(state);
  });

  it('drops unknown ids, paths and mistyped values', () => {
    const hash = `#e=${encodeJson({
      t: { background: '#000', 'nope.nothing': 1, 'layout.rowHeight': 'tall' },
      o: { 'arrows.hops': 'on', 'clustering.maxMarkers': true },
      h: { colours: false, bogus: 1 },
    })}`;
    const state = stateFromUrl(
      '?scenario=nope&theme=nope&density=huge&renderer=svg',
      hash,
    );
    expect(state.scenario).toBe(INITIAL_STATE.scenario);
    expect(state.preset).toBe(INITIAL_STATE.preset);
    expect(state.density).toBe('comfortable');
    expect(state.themeEdits).toEqual({ background: '#000' });
    expect(state.optionEdits).toEqual({ 'arrows.hops': 'on' });
    expect(state.hookEdits).toEqual({ colours: false });
  });

  it('accepts the legacy ?renderer= on its own', () => {
    expect(stateFromUrl('?renderer=canvas2d', '').optionEdits).toEqual({
      renderer: 'canvas2d',
    });
  });

  it('survives a corrupt hash', () => {
    expect(decodeJson('%%%')).toBeNull();
    expect(stateFromUrl('', '#e=not-base64!').themeEdits).toEqual({});
  });
});

describe('reducer', () => {
  it('drops an edit set back to its default', () => {
    const edited = reducer(INITIAL_STATE, {
      type: 'option',
      path: 'locale',
      value: 'fr-FR',
    });
    expect(edited.optionEdits).toEqual({ locale: 'fr-FR' });
    const back = reducer(edited, {
      type: 'option',
      path: 'locale',
      value: 'en-US',
    });
    expect(back.optionEdits).toEqual({});
  });

  it('keeps the renderer but resets behaviour when the scenario changes', () => {
    let state = reducer(INITIAL_STATE, {
      type: 'option',
      path: 'renderer',
      value: 'canvas2d',
    });
    state = reducer(state, { type: 'option', path: 'locale', value: 'de-DE' });
    state = reducer(state, { type: 'hook', key: 'colours', value: false });
    state = reducer(state, { type: 'scenario', id: 'aml' });
    expect(state.optionEdits).toEqual({ renderer: 'canvas2d' });
    expect(state.hookEdits).toEqual({});
  });

  it('discards theme edits when a preset is applied', () => {
    let state = reducer(INITIAL_STATE, {
      type: 'theme',
      path: 'background',
      value: '#123456',
    });
    state = reducer(state, { type: 'preset', id: 'terminal' });
    expect(state.themeEdits).toEqual({});
  });
});
