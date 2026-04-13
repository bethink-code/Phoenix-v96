// isSwingHigh — STRICT inequality test on candle wick highs.
// Same semantics as Pine's `ta.pivothigh()`, Williams Fractals.
// Pure function. Detection uses wick (high), not body — see
// zenny_level_definition.md memory for the design decision.

import type { Candle } from "../../../../../shared/zennyTypes";

export function isSwingHigh(candles: Candle[], i: number, N: number): boolean {
  if (i < N || i > candles.length - N - 1) return false;
  const pivot = candles[i].high;
  for (let j = i - N; j <= i + N; j++) {
    if (j === i) continue;
    if (candles[j].high >= pivot) return false;
  }
  return true;
}
