import type { Candle } from "./types";
import type { Regime } from "../../../shared/schema";

// PRD §4.1 Phase 2 regime detector — wired early because we're paper
// trading and want the bot to drive with a human override.
//
// Pure function over candles. Returns a suggested regime with a confidence
// score, the signals that produced it, and a plain-language rationale. The
// UI surfaces all of that so the operator can sanity-check before the bot
// acts on its own classification.
//
// Signals used:
//   - ADX (14)     — trend strength. High = trending, low = ranging.
//   - ATR ratio    — ATR(14) / SMA(ATR(14), 50). >1.8 = high volatility.
//   - Range ratio  — where price sits inside the 20-bar high/low range.
//                    Near the edges = breakout pressure.
//   - DoW          — Saturday / Sunday triggers low_liquidity.
//
// Rules (first match wins):
//   1. Weekend                       → low_liquidity
//   2. ATR ratio > 1.8               → high_volatility
//   3. ADX > 25                      → trending
//   4. Breaking 20-bar extremes      → breakout
//   5. ADX < 20 + tight ATR ratio    → ranging
//   6. Otherwise                     → no_trade (engine can't decide)
//
// Accumulation/Distribution isn't detected automatically — it needs
// volume profile analysis we don't have yet. Left for manual override.

export interface RegimeSignals {
  adx: number | null;
  atrRatio: number | null; // current ATR / avg ATR
  rangePosition: number | null; // 0 = at 20-bar low, 1 = at 20-bar high
  dayOfWeekUtc: number;
  recentHigh: number;
  recentLow: number;
  lastClose: number;
}

export interface RegimeSuggestion {
  regime: Regime;
  confidence: number; // 0..1
  signals: RegimeSignals;
  rationale: string[];
}

const ADX_PERIOD = 14;
const ATR_PERIOD = 14;
const ATR_AVG_PERIOD = 50;
const RANGE_LOOKBACK = 20;

export function detectRegime(candles: Candle[]): RegimeSuggestion {
  if (candles.length < Math.max(ADX_PERIOD * 2, ATR_AVG_PERIOD + ATR_PERIOD, RANGE_LOOKBACK + 1)) {
    return {
      regime: "no_trade",
      confidence: 0.1,
      signals: emptySignals(candles),
      rationale: ["Not enough candles to classify — need at least 100 bars."],
    };
  }

  const adx = computeADX(candles, ADX_PERIOD);
  const atr = computeATR(candles, ATR_PERIOD);
  const atrAvg = slidingAverage(atr, ATR_AVG_PERIOD);
  const currentATR = atr[atr.length - 1];
  const currentATRAvg = atrAvg[atrAvg.length - 1];
  const atrRatio = currentATRAvg > 0 ? currentATR / currentATRAvg : null;

  const window = candles.slice(-RANGE_LOOKBACK);
  const recentHigh = Math.max(...window.map((c) => c.high));
  const recentLow = Math.min(...window.map((c) => c.low));
  const lastClose = candles[candles.length - 1].close;
  const rangePosition = recentHigh > recentLow
    ? (lastClose - recentLow) / (recentHigh - recentLow)
    : null;

  const dow = new Date(candles[candles.length - 1].openTime).getUTCDay();

  const lastADX = adx[adx.length - 1];
  const signals: RegimeSignals = {
    adx: Number.isFinite(lastADX) ? lastADX : null,
    atrRatio: atrRatio && Number.isFinite(atrRatio) ? atrRatio : null,
    rangePosition,
    dayOfWeekUtc: dow,
    recentHigh,
    recentLow,
    lastClose,
  };

  // Rule 1: Weekend
  if (dow === 0 || dow === 6) {
    return {
      regime: "low_liquidity",
      confidence: 0.9,
      signals,
      rationale: [
        `It's ${dow === 0 ? "Sunday" : "Saturday"} — the book is thin.`,
        "Weekend and holiday windows get demoted to low_liquidity automatically.",
      ],
    };
  }

  // Rule 2: High volatility from ATR expansion
  if (atrRatio != null && atrRatio > 1.8) {
    return {
      regime: "high_volatility",
      confidence: clamp(0.6 + (atrRatio - 1.8) * 0.3, 0.6, 0.95),
      signals,
      rationale: [
        `ATR is ${atrRatio.toFixed(2)}× its 50-bar average — price is moving ${atrRatio > 2.5 ? "way" : "a lot"} harder than normal.`,
        "When things get this stretchy the strategy's levels stop mattering as much. Staying flat.",
      ],
    };
  }

  // Rule 3: Trending via ADX
  if (signals.adx != null && signals.adx > 25) {
    const conf = clamp(0.5 + (signals.adx - 25) / 50, 0.5, 0.95);
    return {
      regime: "trending",
      confidence: conf,
      signals,
      rationale: [
        `ADX is ${signals.adx.toFixed(1)} — ${signals.adx > 35 ? "strong" : "decent"} trend strength.`,
        "Trend is in control. Only taking setups in the direction of the move.",
      ],
    };
  }

  // Rule 4: Breakout — price pinned at top or bottom of 20-bar range
  if (rangePosition != null && (rangePosition > 0.9 || rangePosition < 0.1)) {
    const edge = rangePosition > 0.9 ? "top" : "bottom";
    return {
      regime: "breakout",
      confidence: clamp(0.55 + Math.abs(rangePosition - 0.5) * 0.4, 0.55, 0.85),
      signals,
      rationale: [
        `Price is at the ${edge} of its 20-bar range (${(rangePosition * 100).toFixed(0)}%).`,
        `ADX is ${signals.adx?.toFixed(1) ?? "?"} — not trending hard yet, but pressing on the edge.`,
        "Treating this as breakout risk: confirmation entries only, tighter R:R.",
      ],
    };
  }

  // Rule 5: Ranging via low ADX + subdued ATR
  if (signals.adx != null && signals.adx < 20 && atrRatio != null && atrRatio < 1.3) {
    return {
      regime: "ranging",
      confidence: clamp(0.55 + (20 - signals.adx) / 40, 0.55, 0.9),
      signals,
      rationale: [
        `ADX is ${signals.adx.toFixed(1)} — no trend to speak of.`,
        `ATR is ${atrRatio.toFixed(2)}× average — volatility is calm.`,
        "This is the ideal environment for the sweep-reversal strategy. Fading edges.",
      ],
    };
  }

  // Fallback: unclear
  return {
    regime: "no_trade",
    confidence: 0.3,
    signals,
    rationale: [
      `ADX ${signals.adx?.toFixed(1) ?? "?"}, ATR ratio ${atrRatio?.toFixed(2) ?? "?"} — signals are middling.`,
      "I can't confidently classify this. Sitting it out until the picture clears.",
    ],
  };
}

// ---------- indicators ----------

function computeATR(candles: Candle[], period: number): number[] {
  const tr: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    if (i === 0) {
      tr.push(c.high - c.low);
    } else {
      const prev = candles[i - 1];
      tr.push(
        Math.max(
          c.high - c.low,
          Math.abs(c.high - prev.close),
          Math.abs(c.low - prev.close)
        )
      );
    }
  }
  return wilderSmoothing(tr, period);
}

function computeADX(candles: Candle[], period: number): number[] {
  const plusDM: number[] = [0];
  const minusDM: number[] = [0];
  const tr: number[] = [candles[0].high - candles[0].low];

  for (let i = 1; i < candles.length; i++) {
    const up = candles[i].high - candles[i - 1].high;
    const down = candles[i - 1].low - candles[i].low;
    plusDM.push(up > down && up > 0 ? up : 0);
    minusDM.push(down > up && down > 0 ? down : 0);
    tr.push(
      Math.max(
        candles[i].high - candles[i].low,
        Math.abs(candles[i].high - candles[i - 1].close),
        Math.abs(candles[i].low - candles[i - 1].close)
      )
    );
  }

  const smoothedTR = wilderSmoothing(tr, period);
  const smoothedPlusDM = wilderSmoothing(plusDM, period);
  const smoothedMinusDM = wilderSmoothing(minusDM, period);

  const dx: number[] = [];
  for (let i = 0; i < smoothedTR.length; i++) {
    const atr = smoothedTR[i];
    if (atr === 0) {
      dx.push(0);
      continue;
    }
    const plusDI = (smoothedPlusDM[i] / atr) * 100;
    const minusDI = (smoothedMinusDM[i] / atr) * 100;
    const sum = plusDI + minusDI;
    dx.push(sum === 0 ? 0 : (Math.abs(plusDI - minusDI) / sum) * 100);
  }

  return wilderSmoothing(dx, period);
}

// Wilder smoothing that handles nested computation correctly: skips
// leading NaN values (produced by an earlier smoothing pass), finds the
// first window of `period` consecutive finite values, seeds from there,
// and continues forward. Without this, computeADX poisons its own second
// smoothing pass because the first (period-1) DX values are NaN.
function wilderSmoothing(values: number[], period: number): number[] {
  const out: number[] = values.map(() => NaN);
  let start = -1;
  for (let i = 0; i + period <= values.length; i++) {
    let allFinite = true;
    for (let j = i; j < i + period; j++) {
      if (!Number.isFinite(values[j])) {
        allFinite = false;
        break;
      }
    }
    if (allFinite) {
      start = i;
      break;
    }
  }
  if (start < 0) return out;

  let sum = 0;
  for (let i = start; i < start + period; i++) sum += values[i];
  out[start + period - 1] = sum / period;

  for (let i = start + period; i < values.length; i++) {
    const prev = out[i - 1];
    const cur = values[i];
    if (Number.isFinite(prev) && Number.isFinite(cur)) {
      out[i] = (prev * (period - 1) + cur) / period;
    }
  }
  return out;
}

function slidingAverage(values: number[], period: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      out.push(NaN);
      continue;
    }
    let sum = 0;
    let count = 0;
    for (let j = i - period + 1; j <= i; j++) {
      if (Number.isFinite(values[j])) {
        sum += values[j];
        count++;
      }
    }
    out.push(count > 0 ? sum / count : NaN);
  }
  return out;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function emptySignals(candles: Candle[]): RegimeSignals {
  const last = candles[candles.length - 1];
  return {
    adx: null,
    atrRatio: null,
    rangePosition: null,
    dayOfWeekUtc: last ? new Date(last.openTime).getUTCDay() : 0,
    recentHigh: last?.high ?? 0,
    recentLow: last?.low ?? 0,
    lastClose: last?.close ?? 0,
  };
}
