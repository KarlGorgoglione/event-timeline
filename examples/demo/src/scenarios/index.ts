import { aml } from './aml';
import { incident } from './incident';
import { live } from './live';
import { logistics } from './logistics';
import { playground } from './playground';
import { scale } from './scale';
import { tour } from './tour';
import type { Scenario, ScenarioId } from './types';

export const SCENARIOS: readonly Scenario[] = [
  tour,
  aml,
  incident,
  logistics,
  live,
  scale,
  playground,
];

export const DEFAULT_SCENARIO: ScenarioId = 'tour';

export function scenarioById(id: string): Scenario {
  return SCENARIOS.find((s) => s.id === id) ?? tour;
}

export const isScenarioId = (id: string): id is ScenarioId =>
  SCENARIOS.some((s) => s.id === id);
