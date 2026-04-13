// FindLocalExtrema — swing high / swing low detection.
// N=7 candles each side (research-backed for 1H BTC; same parameter applies to higher TFs).
// STRICT inequality — ties excluded to prevent adjacent double-pivots.
// Pure function. Spec §2.4 + math §10.2.

import type { Candle } from "../../../../../shared/zennyTypes";

export interface SwingExtremum {
  index: number; // index into the input array
  candleOpenTime: number; // ms epoch
  price: number;
  type: "swing_high" | "swing_low";
}

export interface FindLocalExtremaInput {
  candles: Candle[];
  n?: number; // candles each side; default 7 (literature: 6-10 for 1H BTC)
}

export function findLocalExtrema(
  input: FindLocalExtremaInput,
): SwingExtremum[] {
  const N = input.n ?? 7;
  const candles = input.candles;
  const result: SwingExtremum[] = [];

  for (let i = N; i < candles.length - N; i++) {
    if (isSwingHigh(candles, i, N)) {
      result.push({
        index: i,
        candleOpenTime: candles[i].openTime,
        price: candles[i].high,
        type: "swing_high",
      });
    }
    if (isSwingLow(candles, i, N)) {
      result.push({
        index: i,
        candleOpenTime: candles[i].openTime,
        price: candles[i].low,
        type: "swing_low",
      });
    }
  }

  return result;
}

// STRICT inequality: pivot.high > all surrounding highs.
// Equal values disqualify the pivot.
export function isSwingHigh(candles: Candle[], i: number, N: number): boolean {
  if (i < N || i > candles.length - N - 1) return false;
  const pivot = candles[i].high;
  for (let j = i - N; j <= i + N; j++) {
    if (j === i) continue;
    if (candles[j].high >= pivot) return false;
  }
  return true;
}

export function isSwingLow(candles: Candle[], i: number, N: number): boolean {
  if (i < N || i > candles.length - N - 1) return false;
  const pivot = candles[i].low;
  for (let j = i - N; j <= i + N; j++) {
    if (j === i) continue;
    if (candles[j].low <= pivot) return false;
  }
  return true;
}
