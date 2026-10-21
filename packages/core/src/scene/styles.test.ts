import { describe, expect, it } from 'vitest';
import { resolveConfig, type TimelineOptions } from '../engine/options';
import { DataStore } from '../model/store';
import type { TimelineData } from '../model/types';
import { StyleTable } from './styles';

const data: TimelineData = {
  elements: [
    { id: 'a', label: 'A' },
    { id: 'b', label: 'B', style: { lineColor: '#f00' } },
  ],
  events: [
    { id: 'e1', sourceId: 'a', targetId: 'b', time: 1 },
    { id: 'e2', sourceId: 'a', targetId: 'b', time: 2 },
    {
      id: 'e3',
      sourceId: 'a',
      targetId: 'b',
      time: 3,
      style: { arrowColor: '#0f0' },
    },
  ],
};

function table(options: TimelineOptions = {}) {
  const diagnostics: string[] = [];
  const store = new DataStore();
  store.setData(data);
  let config = resolveConfig(options, () => {});
  const styles = new StyleTable({
    store,
    config: () => config,
    onDiagnostic: (d) => diagnostics.push(d.code),
  });
  const setConfig = (next: TimelineOptions) => {
    config = resolveConfig(next, () => {});
  };
  return { store, styles, diagnostics, setConfig };
}

describe('StyleTable (§11, P-02)', () => {
  it('shares one resolved style between unstyled events', () => {
    const { styles } = table();
    expect(styles.event(0)).toBe(styles.event(1));
    expect(styles.event(2)).not.toBe(styles.event(0));
    expect(styles.event(2).style.arrowColor).toBe('#0f0');
  });

  it('interns identical resolver output and resolves each item once', () => {
    let calls = 0;
    const { styles, store } = table({
      styleResolvers: {
        event: () => {
          calls++;
          return { arrowWidth: 2 };
        },
      },
    });
    const first = styles.event(0);
    expect(styles.event(1)).toBe(first);
    styles.event(0);
    expect(calls).toBe(2);
    expect(store.eventStyle[0]).toBeGreaterThanOrEqual(0);
  });

  it('gives styles that draw alike the same stroke id', () => {
    const { styles } = table();
    expect(styles.stroke('#8b949e', 1)).toBe(styles.event(0).stroke);
    expect(styles.event(2).stroke).not.toBe(styles.event(0).stroke);
  });

  it('re-resolves after a reset (theme change)', () => {
    const { styles, setConfig } = table();
    setConfig({ theme: { element: { lineColor: '#00f' } } });
    styles.reset();
    expect(styles.element(0).style.lineColor).toBe('#00f');
    expect(styles.element(1).style.lineColor).toBe('#f00');
  });

  it('replaces a non-px item font with the theme font, reporting it once', () => {
    const { styles, diagnostics } = table({
      styleResolvers: { event: () => ({ labelFont: '1em serif' }) },
    });
    expect(styles.event(0).style.labelFont).toBe('11px system-ui, sans-serif');
    styles.event(1);
    expect(diagnostics).toEqual(['invalid-font']);
  });

  it('only creates label-box batches for visible boxes', () => {
    const { styles } = table({
      styleResolvers: {
        event: (e) =>
          e.id === 'e1'
            ? {
                labelBoxBackground: '#111',
                labelBoxBorderWidth: 1,
                labelBoxBorderColor: '#222',
              }
            : {},
      },
    });
    expect(styles.event(0).boxFill).toBeGreaterThanOrEqual(0);
    expect(styles.event(0).boxBorder).toBeGreaterThanOrEqual(0);
    expect(styles.event(1).boxFill).toBe(-1);
    expect(styles.event(1).boxBorder).toBe(-1);
  });
});
