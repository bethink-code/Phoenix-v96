// ClassifyCandle — categorise a candle by body-to-range ratio.
// ERC = body >= 75% of range (Extended Range Candle, the "departure" candle)
// NRC = body <= 50%
// DOJI = body <= 5%
// Spec §2.4

import type { Candle } from "../../../../../shared/zennyTypes";

export type CandleClass = "ERC" | "NRC" | "DOJI" | "NORMAL";

export interface ClassifyResult {
  type: CandleClass;
  bodyToRangeRatio: number; // 0..1
  isUp: boolean;
}

export function classifyCandle(candle: Candle): ClassifyResult {
  const range = Math.abs(candle.high - candle.low);
  const body = Math.abs(candle.close - candle.open);
  const ratio = range > 0 ? body / range : 0;

  let type: CandleClass;
  if (ratio <= 0.05) type = "DOJI";
  else if (ratio >= 0.75) type = "ERC";
  else if (ratio <= 0.5) type = "NRC";
  else type = "NORMAL";

  return {
    type,
    bodyToRangeRatio: ratio,
    isUp: candle.close >= candle.open,
  };
}
