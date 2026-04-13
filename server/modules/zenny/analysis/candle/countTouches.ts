// CountTouches — count how many candles in a window touched a price level.
// Used at validation time with a provisional 0.5% zone (Gap A resolution).
// A "touch" = candle high or low entered the price ± tolerance band.
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
    const touchPrice = input.side === "RESISTANCE" ? c.high : c.low;
    // RESISTANCE: candle high reached or pierced the upper band
    // SUPPORT: candle low reached or pierced the lower band
    if (input.side === "RESISTANCE" && c.high >= lower && c.high <= upper) {
      touches.push({
        candleIndex: i,
        candleOpenTime: c.openTime,
        touchPrice,
      });
    } else if (
      input.side === "SUPPORT" &&
      c.low >= lower &&
      c.low <= upper
    ) {
      touches.push({
        candleIndex: i,
        candleOpenTime: c.openTime,
        touchPrice,
      });
    }
  }

  return touches;
}
