// FindLocalExtrema — swing high / swing low detection.
// N=7 candles each side (research-backed for 1H BTC; same parameter applies to higher TFs).
// STRICT inequality — ties excluded to prevent adjacent double-pivots.
//
// ⚠ DESIGN DECISION (session 2026-04-13): pivots are detected on candle
// BODY extremes (max(open,close) for highs, min(open,close) for lows), NOT
// on wick extremes. Wicks are noise — a tall wick is a rejection at some
// other level, not the definition of a new level. Bodies are the price the
// market closed on, the price participants committed to. Order block / SMC
// methodology uses body extremes throughout.
//
// The spec doc §2.4 used wick-based detection; that was followed initially
// without question but corrected after the user pointed out the issue.
// See zenny_level_definition.md memory.
//
// Pure function. Spec §2.4 + math §10.2 (body-based override).

import type { Candle } from "../../../../../shared/zennyTypes";

export interface SwingExtremum {
  index: number; // index into the input array
  candleOpenTime: number; // ms epoch
  price: number; // body extreme (max(open,close) for highs, min for lows)
  type: "swing_high" | "swing_low";
}

export interface FindLocalExtremaInput {
  candles: Candle[];
  n?: number; // candles each side; default 7 (literature: 6-10 for 1H BTC)
}

// Body extreme helpers — the canonical level price.
function bodyTop(c: Candle): number {
  return Math.max(c.open, c.close);
}
function bodyBottom(c: Candle): number {
  return Math.min(c.open, c.close);
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
        price: bodyTop(candles[i]),
        type: "swing_high",
      });
    }
    if (isSwingLow(candles, i, N)) {
      result.push({
        index: i,
        candleOpenTime: candles[i].openTime,
        price: bodyBottom(candles[i]),
        type: "swing_low",
      });
    }
  }

  return result;
}

// STRICT inequality on body extremes: pivot's body top > all surrounding body tops.
// Equal values disqualify the pivot.
export function isSwingHigh(candles: Candle[], i: number, N: number): boolean {
  if (i < N || i > candles.length - N - 1) return false;
  const pivot = bodyTop(candles[i]);
  for (let j = i - N; j <= i + N; j++) {
    if (j === i) continue;
    if (bodyTop(candles[j]) >= pivot) return false;
  }
  return true;
}

export function isSwingLow(candles: Candle[], i: number, N: number): boolean {
  if (i < N || i > candles.length - N - 1) return false;
  const pivot = bodyBottom(candles[i]);
  for (let j = i - N; j <= i + N; j++) {
    if (j === i) continue;
    if (bodyBottom(candles[j]) <= pivot) return false;
  }
  return true;
}
