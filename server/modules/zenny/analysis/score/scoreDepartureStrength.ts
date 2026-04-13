// ScoreDepartureStrength — 0-20 points (composite: candle type + base tightness).
// Set at birth, immutable thereafter.
// Composite per session 2026-04-13:
//   Departure candle (max 14): gap-away=14, ERC=10, NRC=5, DOJI=1
//   Base tightness   (max 6):  1-2 candles=6, 3=4, 4-5=2, 6+=0

import type { Candle } from "../../../../../shared/zennyTypes";
import { classifyCandle } from "../candle/classifyCandle";

export interface DepartureInput {
  baseCandles: Candle[]; // candles in the consolidation base before the departure
  departureCandle: Candle;
  previousCandle: Candle | null; // for gap detection
  side: "RESISTANCE" | "SUPPORT";
}

export function scoreDepartureStrength(input: DepartureInput): number {
  return scoreDepartureCandle(input) + scoreBaseTightness(input.baseCandles.length);
}

function scoreDepartureCandle(input: DepartureInput): number {
  // Gap detection: did the departure candle gap away from the base?
  if (input.previousCandle !== null) {
    if (input.side === "RESISTANCE") {
      // Bearish gap-away: open below previous low
      if (input.departureCandle.open < input.previousCandle.low) return 14;
    } else {
      // Bullish gap-away: open above previous high
      if (input.departureCandle.open > input.previousCandle.high) return 14;
    }
  }

  const cls = classifyCandle(input.departureCandle);
  if (cls.type === "ERC") return 10;
  if (cls.type === "NRC") return 5;
  if (cls.type === "DOJI") return 1;
  return 5; // NORMAL → between NRC and ERC
}

function scoreBaseTightness(baseCandleCount: number): number {
  if (baseCandleCount <= 2) return 6;
  if (baseCandleCount === 3) return 4;
  if (baseCandleCount <= 5) return 2;
  return 0;
}
