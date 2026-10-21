import { describe, expect, it } from 'vitest';
import { SelectionModel, type SelectionItem } from './selection';

const el = (id: string): SelectionItem => ({ kind: 'element', id });
const ev = (id: string): SelectionItem => ({ kind: 'event', id });
const plain = { ctrlOrMeta: false };
const ctrl = { ctrlOrMeta: true };

describe('SelectionModel (§9)', () => {
  it('replace() reports only genuine membership changes', () => {
    const s = new SelectionModel();
    expect(s.replace({ events: ['e1'] })).toBe(true);
    expect(s.replace({ events: ['e1'] })).toBe(false);
    expect(s.replace({ events: ['e1'], elements: ['a'] })).toBe(true);
    expect(s.snapshot()).toEqual({ elements: ['a'], events: ['e1'] });
  });

  it('keeps elements and events with the same raw id apart', () => {
    const s = new SelectionModel();
    s.replace({ elements: ['x'] });
    expect(s.hasElement('x')).toBe(true);
    expect(s.hasEvent('x')).toBe(false);
  });

  it('a plain click replaces the selection; an empty click clears it', () => {
    const s = new SelectionModel();
    s.click([el('a')], plain, true);
    s.click([ev('e1')], plain, true);
    expect(s.snapshot()).toEqual({ elements: [], events: ['e1'] });
    expect(s.click([], plain, true)).toBe(true);
    expect(s.isEmpty).toBe(true);
  });

  it('ctrl+click toggles items when multi-select is on', () => {
    const s = new SelectionModel();
    s.click([el('a')], ctrl, true);
    s.click([ev('e1')], ctrl, true);
    expect(s.snapshot()).toEqual({ elements: ['a'], events: ['e1'] });
    s.click([el('a')], ctrl, true);
    expect(s.snapshot()).toEqual({ elements: [], events: ['e1'] });
  });

  it('ctrl+click on empty space keeps the selection', () => {
    const s = new SelectionModel();
    s.click([el('a')], plain, true);
    expect(s.click([], ctrl, true)).toBe(false);
    expect(s.snapshot().elements).toEqual(['a']);
  });

  it('ignores the modifier when multi-select is off', () => {
    const s = new SelectionModel();
    s.click([el('a')], ctrl, false);
    s.click([el('b')], ctrl, false);
    expect(s.snapshot().elements).toEqual(['b']);
  });

  it('ctrl+click on a cluster adds all members, and removes them once all are selected', () => {
    const s = new SelectionModel();
    s.click([ev('e1')], plain, true);
    s.click([ev('e1'), ev('e2'), ev('e3')], ctrl, true);
    expect(s.snapshot().events).toEqual(['e1', 'e2', 'e3']);
    s.click([ev('e1'), ev('e2'), ev('e3')], ctrl, true);
    expect(s.isEmpty).toBe(true);
  });

  it('prune() drops ids that no longer exist', () => {
    const s = new SelectionModel();
    s.replace({ elements: ['a', 'b'], events: ['e1', 'e2'] });
    const changed = s.prune(
      (id) => id === 'a',
      (id) => id === 'e2',
    );
    expect(changed).toBe(true);
    expect(s.snapshot()).toEqual({ elements: ['a'], events: ['e2'] });
    expect(
      s.prune(
        () => true,
        () => true,
      ),
    ).toBe(false);
  });
});
