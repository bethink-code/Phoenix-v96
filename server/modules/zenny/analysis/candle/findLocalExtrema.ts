// FindLocalExtrema — swing high / swing low detection across a candle window.
//
// HYBRID model (see zenny_level_definition.md memory, Phase 2 refinement):
//   - Detection uses candle.high / candle.low via isSwingHigh / isSwingLow
//     (Pine ta.pivothigh / ta.pivotlow / Williams Fractals semantics)
//   - Stored pivot.price is the CLOSE of the swing candle — NOT the body top
//     or wick high. This is a Phase 2 refinement: the user's actual method
//     ("draw through the CLOSE of that candle") and matches SMC / order-block
//     rendering where the close represents where the market agreed at the
//     pivot moment.
//   - wickPrice field still carries the wick extreme for diagnostics.
//
// N=7 candles each side default. STRICT inequality — ties excluded.
// Optional follow-through filter: reject pivots where price didn't reverse
// by at least minReversalAtrMultiple × ATR within the next N candles.
// Pure function.

import type { Candle } from "../../../../../shared/zennyTypes";
import { isSwingHigh } from "./isSwingHigh";
import { isSwingLow } from "./isSwingLow";
import { measureFollowThrough, computeAtr14 } from "./measureFollowThrough";

export interface SwingExtremum {
  index: number;
  candleOpenTime: number;
  price: number; // close of the swing candle (what gets drawn)
  wickPrice: number; // wick extreme (high for swing_high, low for swing_low)
  type: "swing_high" | "swing_low";
}

export interface FindLocalExtremaInput {
  candles: Candle[];
  n?: number;
  // Optional follow-through filter. If set, pivots are only kept if the
  // subsequent reversal exceeded this multiple of ATR within lookaheadCandles.
  minReversalAtrMultiple?: number; // e.g. 2.5 for swing trading
  lookaheadCandles?: number; // e.g. 5
  // Optional excursion filter. If set, the pivot's BODY extreme must be at
  // least this multiple of ATR away from the median body extreme of its 2N
  // neighbours. Catches "shallow chop pivots" — candles that pass the strict
  // local extremum test but only barely (e.g. dojis or small-body bars in
  // tight consolidation). The user's eye reads these as noise; the math
  // says they aren't meaningful enough to be levels.
  minExcursionAtrMultiple?: number; // e.g. 1.0
}

export function findLocalExtrema(
  input: FindLocalExtremaInput,
): SwingExtremum[] {
  const N = input.n ?? 7;
  const candles = input.candles;
  const result: SwingExtremum[] = [];

  // Compute ATR once per call if any ATR-based filter is active
  const followThroughActive = input.minReversalAtrMultiple !== undefined;
  const excursionActive = input.minExcursionAtrMultiple !== undefined;
  const atr =
    followThroughActive || excursionActive ? computeAtr14(candles, 14) : 0;

  for (let i = N; i < candles.length - N; i++) {
    if (isSwingHigh(candles, i, N)) {
      const pivot: SwingExtremum = {
        index: i,
        candleOpenTime: candles[i].openTime,
        price: candles[i].close, // CLOSE, not body top or wick
        wickPrice: candles[i].high,
        type: "swing_high",
      };
      const passesFollow =
        !followThroughActive ||
        passesFollowThroughFilter(pivot, candles, atr, input);
      const passesExcursion =
        !excursionActive ||
        passesExcursionFilter(pivot, candles, N, atr, input);
      if (passesFollow && passesExcursion) {
        result.push(pivot);
      }
    }
    if (isSwingLow(candles, i, N)) {
      const pivot: SwingExtremum = {
        index: i,
        candleOpenTime: candles[i].openTime,
        price: candles[i].close, // CLOSE, not body bottom or wick
        wickPrice: candles[i].low,
        type: "swing_low",
      };
      const passesFollow =
        !followThroughActive ||
        passesFollowThroughFilter(pivot, candles, atr, input);
      const passesExcursion =
        !excursionActive ||
        passesExcursionFilter(pivot, candles, N, atr, input);
      if (passesFollow && passesExcursion) {
        result.push(pivot);
      }
    }
  }

  return result;
}

function passesFollowThroughFilter(
  pivot: SwingExtremum,
  candles: Candle[],
  atr: number,
  input: FindLocalExtremaInput,
): boolean {
  if (atr <= 0) return true; // ATR unavailable — fall through, accept the pivot
  const minMultiple = input.minReversalAtrMultiple ?? 2.5;
  const lookahead = input.lookaheadCandles ?? 5;
  const followThrough = measureFollowThrough({
    candles,
    pivotIndex: pivot.index,
    pivotType: pivot.type,
    lookaheadCandles: lookahead,
    atr,
  });
  return (
    followThrough.reversalAsAtrMultiple !== null &&
    followThrough.reversalAsAtrMultiple >= minMultiple
  );
}

// Excursion filter: how meaningful is this pivot relative to its neighbours?
// Computes the median BODY extreme of the 2N neighbouring candles (N on each
// side, excluding the pivot itself), then requires the pivot's own body
// extreme to be at least minExcursionAtrMultiple × ATR away from it.
//
// Why body-based when detection is wick-based: a doji or small-body candle
// can have a wick that's the local high (so isSwingHigh fires) but its body
// barely moves — that's chop noise, not structure. Body-based excursion
// rejects them. Real swings have bodies that meaningfully break out of the
// surrounding consolidation level.
function passesExcursionFilter(
  pivot: SwingExtremum,
  candles: Candle[],
  N: number,
  atr: number,
  input: FindLocalExtremaInput,
): boolean {
  if (atr <= 0) return true;
  const minMultiple = input.minExcursionAtrMultiple ?? 1.0;

  const neighbourBodies: number[] = [];
  for (let j = pivot.index - N; j <= pivot.index + N; j++) {
    if (j === pivot.index) continue;
    if (j < 0 || j >= candles.length) continue;
    const c = candles[j];
    if (pivot.type === "swing_high") {
      neighbourBodies.push(Math.max(c.open, c.close));
    } else {
      neighbourBodies.push(Math.min(c.open, c.close));
    }
  }
  if (neighbourBodies.length === 0) return true;

  const sorted = [...neighbourBodies].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];

  const pivotCandle = candles[pivot.index];
  const pivotBody =
    pivot.type === "swing_high"
      ? Math.max(pivotCandle.open, pivotCandle.close)
      : Math.min(pivotCandle.open, pivotCandle.close);

  const excursion =
    pivot.type === "swing_high" ? pivotBody - median : median - pivotBody;

  return excursion >= minMultiple * atr;
}
