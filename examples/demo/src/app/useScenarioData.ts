// The dataset for the current scenario and variant. Light scenarios load
// during render, so the first frame already has them; heavy ones (50k
// events) load after a paint, behind the loading overlay.

import { useCallback, useEffect, useState } from 'react';
import type { DemoData, Scenario } from '../scenarios/types';

const EMPTY: DemoData = { elements: [], events: [] };

interface Entry {
  key: string;
  data: DemoData;
  loading: boolean;
}

function start(
  scenario: Scenario,
  variant: string | undefined,
  key: string,
  prev: DemoData,
): Entry {
  return scenario.heavy
    ? { key, data: prev, loading: true }
    : { key, data: scenario.load(variant), loading: false };
}

export function useScenarioData(
  scenario: Scenario,
  variant: string | undefined,
) {
  const key = `${scenario.id}:${variant ?? ''}`;
  const [entry, setEntry] = useState<Entry>(() =>
    start(scenario, variant, key, EMPTY),
  );
  // Derived state: switch datasets in the same render as the scenario.
  if (entry.key !== key) setEntry(start(scenario, variant, key, entry.data));

  useEffect(() => {
    if (!entry.loading) return;
    // Two frames: let the overlay paint before the generator blocks.
    let id = requestAnimationFrame(() => {
      id = requestAnimationFrame(() =>
        setEntry({ key, data: scenario.load(variant), loading: false }),
      );
    });
    return () => cancelAnimationFrame(id);
  }, [entry.loading, key, scenario, variant]);

  const replaceData = useCallback(
    (data: DemoData) => setEntry((e) => ({ ...e, data, loading: false })),
    [],
  );

  return { data: entry.data, loading: entry.loading, replaceData };
}
