// AdaptiveTolerance — widen the level merge tolerance when volatility is high.
// Base 0.5%, multiplied by ATR ratio. Pure.
// Literature: 0.5% in low vol, 1.5% in high vol.

import type { Candle } from "../../../../../shared/zennyTypes";

const BASE_TOLERANCE = 0.005; // 0.5%

export interface AdaptiveToleranceInput {
  candles: Candle[];
  atrPeriod?: number; // default 14
  baseTolerancePct?: number; // default 0.005
  maxToleranceMultiplier?: number; // cap multiplier (default 3 → 1.5%)
}

export function adaptiveTolerance(input: AdaptiveToleranceInput): number {
  const period = input.atrPeriod ?? 14;
  const base = input.baseTolerancePct ?? BASE_TOLERANCE;
  const cap = input.maxToleranceMultiplier ?? 3;

  if (input.candles.length < period * 2) return base;

  const atrRecent = computeAtr(input.candles.slice(-period), period);
  const atrLong = computeAtr(input.candles.slice(-period * 2), period);

  if (atrLong === 0) return base;
  const ratio = atrRecent / atrLong;
  const multiplier = Math.min(cap, Math.max(1, ratio));
  return base * multiplier;
}

function computeAtr(candles: Candle[], period: number): number {
  if (candles.length < 2) return 0;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const prev = candles[i - 1];
    const tr = Math.max(
      c.high - c.low,
      Math.abs(c.high - prev.close),
      Math.abs(c.low - prev.close),
    );
    trs.push(tr);
  }
  // Simple mean ATR for the lookback (Wilder smoothing comes later when needed)
  return trs.slice(-period).reduce((s, n) => s + n, 0) / Math.min(period, trs.length);
}
