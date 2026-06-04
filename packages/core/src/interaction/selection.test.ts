import { describe, expect, it } from 'vitest';
import { nextSelection } from './selection';

const noMods = { ctrlOrMeta: false };
const metaMods = { ctrlOrMeta: true };

describe('nextSelection (§9)', () => {
  it('plain click replaces the selection with the hit', () => {
    const r = nextSelection(new Set(['a']), 'b', noMods, true);
    expect(r.ids).toEqual(['b']);
    expect(r.changed).toBe(true);
  });

  it('plain click on empty space clears the selection', () => {
    const r = nextSelection(new Set(['a', 'b']), null, noMods, true);
    expect(r.ids).toEqual([]);
    expect(r.changed).toBe(true);
  });

  it('reports no change when re-selecting the only selected id', () => {
    const r = nextSelection(new Set(['a']), 'a', noMods, true);
    expect(r.ids).toEqual(['a']);
    expect(r.changed).toBe(false);
  });

  it('ignores the modifier when multi-select is off (single-select)', () => {
    const r = nextSelection(new Set(['a']), 'b', metaMods, false);
    expect(r.ids).toEqual(['b']);
  });

  it('ctrl/⌘+click adds to the selection when multi-select is on', () => {
    const r = nextSelection(new Set(['a']), 'b', metaMods, true);
    expect(r.ids.sort()).toEqual(['a', 'b']);
    expect(r.changed).toBe(true);
  });

  it('ctrl/⌘+click toggles an already-selected id out', () => {
    const r = nextSelection(new Set(['a', 'b']), 'b', metaMods, true);
    expect(r.ids).toEqual(['a']);
    expect(r.changed).toBe(true);
  });

  it('ctrl/⌘+click on empty space preserves the selection', () => {
    const r = nextSelection(new Set(['a']), null, metaMods, true);
    expect(r.ids).toEqual(['a']);
    expect(r.changed).toBe(false);
  });
});
