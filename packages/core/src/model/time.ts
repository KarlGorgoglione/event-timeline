// Fixed-length time units in ms (DESIGN.md §1). Calendar math (months,
// years) lives in scale/ticks.ts; these are the exact UTC lengths.

export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;
