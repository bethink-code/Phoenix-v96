// DetectEngulfingDeath — fires when a single candle's body crosses both
// pool boundaries. The fastest of the three death mechanisms.
// Math doc §8.2 condition 1.
//
// Resistance pool dies if:    candle.open < pool.wick_low AND candle.close > pool.wick_high
// Support pool dies if:       candle.open > pool.wick_high AND candle.close < pool.wick_low
//
// Wicks alone are NOT sufficient — the body must cross. A long wick that pierces
// then snaps back is a sweep, not an engulfing death.

import type { Candle } from "../../../../../shared/zennyTypes";

export interface EngulfingInput {
  candle: Candle;
  poolWickHigh: number;
  poolWickLow: number;
  poolType: "RESISTANCE" | "SUPPORT";
}

export function detectEngulfingDeath(input: EngulfingInput): boolean {
  if (input.poolType === "RESISTANCE") {
    return (
      input.candle.open < input.poolWickLow &&
      input.candle.close > input.poolWickHigh
    );
  }
  // SUPPORT
  return (
    input.candle.open > input.poolWickHigh &&
    input.candle.close < input.poolWickLow
  );
}
