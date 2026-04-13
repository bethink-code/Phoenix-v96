// FindLocalExtrema — swing high / swing low detection across a candle window.
//
// HYBRID model (see zenny_level_definition.md memory):
//   - Detection uses candle.high / candle.low via isSwingHigh / isSwingLow
//     (Pine ta.pivothigh / ta.pivotlow / Williams Fractals semantics)
//   - Stored pivot.price is the BODY extreme of the swing candle
//     (max(open, close) for highs, min for lows). Lines are drawn at
//     the body, not the wick — wicks are noise, bodies are commitment.
//   - wickPrice field carries the wick value for diagnostics.
//
// N=7 candles each side default. STRICT inequality — ties excluded.
// Pure function.

import type { Candle } from "../../../../../shared/zennyTypes";
import { isSwingHigh } from "./isSwingHigh";
import { isSwingLow } from "./isSwingLow";

export interface SwingExtremum {
  index: number;
  candleOpenTime: number;
  price: number; // body extreme (max/min of open, close)
  wickPrice: number; // wick extreme for diagnostics
  type: "swing_high" | "swing_low";
}

export interface FindLocalExtremaInput {
  candles: Candle[];
  n?: number;
}

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
        wickPrice: candles[i].high,
        type: "swing_high",
      });
    }
    if (isSwingLow(candles, i, N)) {
      result.push({
        index: i,
        candleOpenTime: candles[i].openTime,
        price: bodyBottom(candles[i]),
        wickPrice: candles[i].low,
        type: "swing_low",
      });
    }
  }

  return result;
}
