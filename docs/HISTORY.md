# History

How the library was built, kept out of the specification
([`DESIGN.md`](DESIGN.md)) so the spec only describes the present. Decisions
that still bind the code are in [`adr/`](adr/README.md); release-level changes
are in each package's `CHANGELOG.md`.

## Phases 0–8 (initial build)

Each phase ended with a runnable demo and acceptance criteria.

| Phase | Scope                                                                                                                                       |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 0     | pnpm monorepo, the two package skeletons, tsup, Vitest, Playwright, ESLint/Prettier, the Vite demo, CI.                                    |
| 1     | Domain model and store, time scale, Camera, the `Renderer` seam with Canvas2D, DPR handling, layered canvases, the dirty-flag loop, pan.     |
| 2     | Orthogonal arrows, event labels, element label and icon with the sticky-left fallback, culling by the row-interval test.                   |
| 3     | Zoom about the cursor, vertical scroll, the pointer state machine, the hit grid, hover and tooltip, click selection on the overlay.        |
| 4     | The sorted temporal index, label LOD, pluggable clustering with click-to-zoom.                                                               |
| 5     | Pluggable layout: `byFirstEvent`, `barycenter`, `explicit`; debounced recompute.                                                           |
| 6     | The style resolution chain (item style → resolver → theme) and formatters.                                                                 |
| 7     | Incremental mutations, stable-append layout, the imperative React handle.                                                                  |
| 8     | Frame stats, the perf harness and spec, golden tests, size budgets, Changesets with npm trusted publishing.                                |
| —     | A first WebGL2 backend (two contexts, per-batch uploads) behind the seam.                                                                   |

Notable notes from that period, now superseded:

- `date-fns` was declared for calendar math but never imported; ticks have
  always used `Date.UTC`. It was removed in the remediation.
- The 50k base budget was not met: frame time grew linearly with the visible
  event count (50k: 37 ms interactive, 187 ms full zoom-out under CPU ×4). The
  perf gate asserted the budget only up to 10k.
- The first WebGL backend deliberately did not call `loseContext()` on dispose,
  because the React binding reused canvases across StrictMode remounts. Since
  the engine owns its canvases, dispose releases the context.

## 2026 audit and remediation

An audit of the code at the Phase 7 + WebGL state (commit `3eddf38`) recorded
92 findings: correctness bugs (B), architecture (A), performance (P), public API
(I), React binding (R), WebGL (W), code quality (Q), tooling and tests (T) and
documentation (D), with a 21-package remediation plan. The remediation:

- **Phase 0, safe fixes**: escaped key separators and `.gitattributes`; tests
  resolve packages from source; `date-fns` removed; the version injected at
  release; cross-origin icons and texture uploads guarded; a real fallback
  chain; draw errors reported as diagnostics; wheel delta modes, macOS
  shift+wheel and primary-button-only clicks; the diagnostics sink fixed and
  batched; ids, labels, order and fonts validated; layout output normalised.
- **Phase 1, API contracts**: runtime `setTheme`/`setOptions`/
  `setStyleResolvers`/`setFormatters`; structured selection; cluster
  expansion in place; sub-day ticks with a sticky period label, zoom and pan
  options, locale, `fitOnDataChange`, reserved `endTime`; `emptyElements`;
  `removeElements`, `updateEvent`, `getData`, `scrollToElement`,
  `revealEvent`, `zoomIn`/`zoomOut`; the engine split into a facade, view
  model, painters, input, surface and scheduler, with injectable renderer,
  scheduler and clock; the engine owns its canvases (`mount`/`unmount`).
- **Phase 2, the frame pipeline and 50k**: a typed-array store with batch
  sort-and-merge; interned styles; a frame builder emitting typed batches and
  hit targets with one snap pass; a lazily built, viewport-clamped hit grid;
  label collision culling with a per-frame cap; joins; a row-interval index;
  precomputed zoomed-out aggregates with a marker budget; an instanced WebGL2
  backend with one context, paged atlases and context-loss fallback.
- **Phase 3, hardening**: a three-job release workflow gated on CI with pinned
  actions and npm; nightly perf tracking with Gate 2 asserted on hardware
  WebGL; Firefox and WebKit interaction tests; coverage thresholds;
  type-aware lint with package-boundary and coordinate rules; a dedicated e2e
  fixture page; pinch zoom and keyboard navigation; a grouped theme; this
  documentation split.

Measured after the remediation (production build, CPU ×4, DPR 1): with WebGL2
on a laptop GPU, 50k events hold a 16.7 ms frame interval in every regime
(base medians: about 3 ms interactive, 9–10 ms sparse zoom-out, 8 ms dense
zoom-out), and so does 100k zoom-out. Canvas2D meets the base budget at 50k
zoom-out on the median (about 14 ms) but its frame interval is about 50 ms there,
because rasterization dominates; it remains the fallback.
