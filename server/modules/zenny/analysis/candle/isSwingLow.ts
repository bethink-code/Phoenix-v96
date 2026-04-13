// isSwingLow — STRICT inequality test on candle wick lows.
// Same semantics as Pine's `ta.pivotlow()`, Williams Fractals.
// Pure function. Detection uses wick (low), not body.

import type { Candle } from "../../../../../shared/zennyTypes";

export function isSwingLow(candles: Candle[], i: number, N: number): boolean {
  if (i < N || i > candles.length - N - 1) return false;
  const pivot = candles[i].low;
  for (let j = i - N; j <= i + N; j++) {
    if (j === i) continue;
    if (candles[j].low <= pivot) return false;
  }
  return true;
}
