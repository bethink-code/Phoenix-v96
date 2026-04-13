// MeasureWickExtreme — compute percentile-based wick boundaries.
// Used by SetPoolBoundaries: 90th/10th percentile of wick extremes
// rather than max/min, to reject anomalous spike wicks.
// Pure function. Spec §2.4 + math §10.5.

import type { Candle } from "../../../../../shared/zennyTypes";

export interface WickExtremesInput {
  candles: Candle[]; // candles that touched the level
  side: "RESISTANCE" | "SUPPORT";
}

export interface WickExtremes {
  wickHigh: number; // 90th percentile of highs (for resistance)
  wickLow: number; // 10th percentile of lows (for support)
  centreLine: number; // 50th percentile of body midpoints
}

export function measureWickExtreme(input: WickExtremesInput): WickExtremes {
  if (input.candles.length === 0) {
    throw new Error("measureWickExtreme: empty candle array");
  }
  const highs = input.candles.map((c) => c.high).sort((a, b) => a - b);
  const lows = input.candles.map((c) => c.low).sort((a, b) => a - b);
  const midpoints = input.candles
    .map((c) => (c.open + c.close) / 2)
    .sort((a, b) => a - b);

  return {
    wickHigh: percentile(highs, 0.9),
    wickLow: percentile(lows, 0.1),
    centreLine: percentile(midpoints, 0.5),
  };
}

// Linear-interpolation percentile on a sorted array.
export function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  if (sortedAsc.length === 1) return sortedAsc[0];
  const idx = p * (sortedAsc.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedAsc[lo];
  const frac = idx - lo;
  return sortedAsc[lo] * (1 - frac) + sortedAsc[hi] * frac;
}
