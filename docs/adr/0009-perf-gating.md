# 0009 — Perf tracked nightly; Gate 2 asserted on hardware WebGL

**Status**: Accepted

## Context

The perf budgets ran on every pull request on shared GitHub runners, which are
noisier than the 16 ms budget allows; a 4 ms tolerance made the gate flaky and
weak at once, and the 50k requirement was never gated. Shared runners have no
GPU, while the 1.0 requirement (50k events at 60 fps) is about the backend
users get on capable hardware.

## Decision

- Pull-request CI runs interaction and golden tests only.
- A nightly workflow runs the perf spec on main and fails when a scenario is
  more than 20% and 1 ms slower than the last successful run. A repository
  variable (`PERF_RUNNER`) moves it to a dedicated runner.
- Two projects: `perf` (Canvas2D, hard budget up to 10k) and `perf-gpu`
  (Chromium with the GPU enabled; asserts Gate 2 at 50k on WebGL2 and skips
  itself without hardware WebGL2).
- Every scenario reports the frame interval (p95) next to the base and overlay
  medians, because the base timing excludes rasterization.

## Consequences

- A regression surfaces the night after it merges, not on the pull request.
- Gate 2 is asserted only where a GPU is available: on a GPU runner, or
  locally before a release.
