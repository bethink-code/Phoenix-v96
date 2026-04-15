// filterBrokenPivots — remove swing pivots that have been decisively broken
// by subsequent price action and are no longer relevant levels.
//
// A swing high at price P is "broken" when a later candle closes above
// P × (1 + breakThresholdPct). Mirror for swing lows. Once broken, the
// level no longer represents resistance/support — it's stale historical
// data that should not render on the chart.
//
// Trader intuition: once price closes decisively above a former resistance,
// that level has either been consumed or is now potential support (polarity
// flip — handled separately). Either way, drawing it as resistance is wrong.
//
// Pure. Operates on already-detected pivots + the candle array they came
// from. Threshold is a percentage so the function doesn't need ATR.

import type { Candle } from "../../../../../shared/zennyTypes";
import type { SwingExtremum } from "../candle/findLocalExtrema";

export interface FilterBrokenPivotsInput {
  pivots: SwingExtremum[];
  candles: Candle[];
  breakThresholdPct?: number; // default 0.005 (0.5%)
}

export function filterBrokenPivots(
  input: FilterBrokenPivotsInput,
): SwingExtremum[] {
  const threshold = input.breakThresholdPct ?? 0.005;

  return input.pivots.filter((pivot) => {
    const breakLevel =
      pivot.type === "swing_high"
        ? pivot.price * (1 + threshold)
        : pivot.price * (1 - threshold);

    // Walk forward through every candle after the pivot. If any close
    // breached the break level, this pivot is dead.
    for (let i = pivot.index + 1; i < input.candles.length; i++) {
      const close = input.candles[i].close;
      if (pivot.type === "swing_high" && close > breakLevel) return false;
      if (pivot.type === "swing_low" && close < breakLevel) return false;
    }
    return true;
  });
}
