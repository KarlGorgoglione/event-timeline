// Compare a perf run with a baseline run (DESIGN.md §13, audit T-05).
//
//   node --experimental-strip-types scripts/perf-compare.mjs <baseline.jsonl> <current.jsonl>
//
// Both files hold one JSON PerfRecord per line, as perf.spec.ts writes them
// with PERF_OUTPUT. Prints a table and exits 1 when a scenario's base or
// overlay median regressed by more than 20% and more than 1 ms. A missing
// baseline (the first run) is not a failure.

import { existsSync, readFileSync } from 'node:fs';
import { findRegressions } from '../examples/demo/src/perfStats.ts';

const [baselinePath, currentPath] = process.argv.slice(2);
if (currentPath === undefined) {
  console.error('usage: perf-compare.mjs <baseline.jsonl> <current.jsonl>');
  process.exit(2);
}

const read = (path) =>
  readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line));

const current = read(currentPath);
if (!existsSync(baselinePath)) {
  console.log(`No baseline at ${baselinePath}: recording this run only.`);
  process.exit(0);
}
const baseline = read(baselinePath);
const previous = new Map(
  baseline.map((r) => [`${r.backend}/${r.scenario}`, r]),
);

const ms = (v) => (Number.isFinite(v) ? v.toFixed(2).padStart(7) : '      –');
console.log(
  'scenario                              base (was → now)    overlay (was → now)',
);
for (const r of current) {
  const key = `${r.backend}/${r.scenario}`;
  const p = previous.get(key);
  console.log(
    `${key.padEnd(36)} ${ms(p?.baseMedian)} → ${ms(r.baseMedian)}  ${ms(p?.overlayMedian)} → ${ms(r.overlayMedian)}`,
  );
}

const regressions = findRegressions(baseline, current);
if (regressions.length === 0) {
  console.log('\nNo regressions.');
} else {
  console.log(
    '\nRegressions (>20% and >1 ms slower than the last run on main):',
  );
  for (const r of regressions) {
    console.log(
      `  ${r.key} ${r.metric}: ${r.baseline.toFixed(2)} → ${r.current.toFixed(2)} ms`,
    );
  }
  process.exit(1);
}
