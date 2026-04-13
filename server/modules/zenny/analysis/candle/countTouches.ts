// CountTouches — count how many candles in a window touched a price level.
// Used at validation time with a provisional 0.5% zone (Gap A resolution).
// A "touch" = the candle's price range (low..high) intersects the band
// [price - tolerance, price + tolerance]. Standard range-overlap check.
// Pure function. Spec §2.4 + Gap A resolution.

import type { Candle } from "../../../../../shared/zennyTypes";

export interface CountTouchesInput {
  candles: Candle[];
  price: number;
  tolerancePct: number; // e.g. 0.005 (0.5%)
  side: "RESISTANCE" | "SUPPORT";
}

export interface TouchInfo {
  candleIndex: number;
  candleOpenTime: number;
  touchPrice: number; // the high (RES) or low (SUP) of the touching candle
}

export function countTouches(input: CountTouchesInput): TouchInfo[] {
  const upper = input.price * (1 + input.tolerancePct);
  const lower = input.price * (1 - input.tolerancePct);
  const touches: TouchInfo[] = [];

  for (let i = 0; i < input.candles.length; i++) {
    const c = input.candles[i];
    // Range overlap check: the candle's [low, high] interval intersects
    // the band [lower, upper]. Catches wick touches, full visits, and
    // engulfs alike. The semantic touch price is still the high/low
    // depending on side, for downstream display.
    const intersects = c.low <= upper && c.high >= lower;
    if (!intersects) continue;
    const touchPrice = input.side === "RESISTANCE" ? c.high : c.low;
    touches.push({
      candleIndex: i,
      candleOpenTime: c.openTime,
      touchPrice,
    });
  }

  return touches;
}
