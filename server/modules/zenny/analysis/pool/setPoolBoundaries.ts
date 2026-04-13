// SetPoolBoundaries — compute pool wick_high / wick_low / centre_line.
// Uses 90/10/50 percentile method (math §10.5) for outlier rejection.
// Width clamped to 0.5%–1.5% of current price.
// Pure.

import type { Candle } from "../../../../../shared/zennyTypes";
import { measureWickExtreme } from "../candle/measureWickExtreme";
import { countTouches } from "../candle/countTouches";

export interface SetBoundariesInput {
  candidatePrice: number;
  side: "RESISTANCE" | "SUPPORT";
  candles: Candle[];
  provisionalTolerancePct?: number; // 0.005
  minWidthPct?: number; // 0.005 (0.5% of current price)
  maxWidthPct?: number; // 0.015 (1.5%)
  currentPrice: number;
}

export interface PoolBoundaries {
  wickHigh: number;
  wickLow: number;
  centreLine: number;
  widthPct: number;
  clampedToMin: boolean;
  clampedToMax: boolean;
}

export function setPoolBoundaries(input: SetBoundariesInput): PoolBoundaries {
  const tolerancePct = input.provisionalTolerancePct ?? 0.005;
  const minWidthPct = input.minWidthPct ?? 0.005;
  const maxWidthPct = input.maxWidthPct ?? 0.015;

  // Find the candles that touched the level (used to derive boundaries)
  const touches = countTouches({
    candles: input.candles,
    price: input.candidatePrice,
    tolerancePct,
    side: input.side,
  });
  const touchingCandles = touches.map((t) => input.candles[t.candleIndex]);

  if (touchingCandles.length === 0) {
    // Fallback: use the candidate price ± minWidthPct
    const halfWidth = (input.currentPrice * minWidthPct) / 2;
    return {
      wickHigh: input.candidatePrice + halfWidth,
      wickLow: input.candidatePrice - halfWidth,
      centreLine: input.candidatePrice,
      widthPct: minWidthPct,
      clampedToMin: true,
      clampedToMax: false,
    };
  }

  const raw = measureWickExtreme({
    candles: touchingCandles,
    side: input.side,
  });

  let wickHigh = raw.wickHigh;
  let wickLow = raw.wickLow;
  let centreLine = raw.centreLine;
  let widthPct = (wickHigh - wickLow) / input.currentPrice;
  let clampedToMin = false;
  let clampedToMax = false;

  if (widthPct < minWidthPct) {
    // Expand symmetrically around the centre to reach minWidthPct
    const targetWidth = input.currentPrice * minWidthPct;
    const half = targetWidth / 2;
    wickHigh = centreLine + half;
    wickLow = centreLine - half;
    widthPct = minWidthPct;
    clampedToMin = true;
  } else if (widthPct > maxWidthPct) {
    const targetWidth = input.currentPrice * maxWidthPct;
    const half = targetWidth / 2;
    wickHigh = centreLine + half;
    wickLow = centreLine - half;
    widthPct = maxWidthPct;
    clampedToMax = true;
  }

  return { wickHigh, wickLow, centreLine, widthPct, clampedToMin, clampedToMax };
}
