// DetectSustainedBreakDeath — fires when N consecutive candle closes are
// beyond the pool boundary in the breaking direction.
// Math doc §8.2 condition 2.
//
// Default N = 3. Configurable via DecisionConfig.
// Resistance "broken up" = N closes > wick_high
// Support "broken down" = N closes < wick_low
//
// Counts are reset by any close back inside the pool — the breaks must be consecutive.

import type { Candle } from "../../../../../shared/zennyTypes";

export interface SustainedBreakInput {
  recentCandles: Candle[]; // ordered oldest to newest
  poolWickHigh: number;
  poolWickLow: number;
  poolType: "RESISTANCE" | "SUPPORT";
  consecutiveCloses?: number; // default 3
}

export interface SustainedBreakResult {
  dead: boolean;
  deathCandleIndex: number | null; // index into recentCandles when threshold was reached
}

export function detectSustainedBreakDeath(
  input: SustainedBreakInput,
): SustainedBreakResult {
  const N = input.consecutiveCloses ?? 3;
  let streak = 0;

  for (let i = 0; i < input.recentCandles.length; i++) {
    const c = input.recentCandles[i];
    const broken =
      input.poolType === "RESISTANCE"
        ? c.close > input.poolWickHigh
        : c.close < input.poolWickLow;

    if (broken) {
      streak += 1;
      if (streak >= N) {
        return { dead: true, deathCandleIndex: i };
      }
    } else {
      streak = 0; // reset on any close back inside
    }
  }

  return { dead: false, deathCandleIndex: null };
}
