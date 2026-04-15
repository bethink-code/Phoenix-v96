// findZigZagLevels — level detection via ZigZag reversal logic.
//
// Why this replaces findRdpLevels: RDP picks vertices by "farthest from
// the chord between neighbours," which is greedy and doesn't match the
// trader's mental model of "top of a bull cycle" or "bottom of a bear
// cycle." On BTC Monthly with a 2021 double-top ($58K in March, $61K in
// October), RDP picks the March peak because of recursion order; the
// user's eye picks October because it's higher.
//
// ZigZag's logic is closer to the user's mental model:
//   1. Walk candles left-to-right in a given direction (UP or DOWN).
//   2. Track the running extreme (max close in UP, min close in DOWN).
//      Whenever a new higher high (or lower low) appears, the running
//      extreme updates to that new candle — so the "peak" is always the
//      ACTUAL highest close seen during the current direction.
//   3. When price reverses from the running extreme by more than the
//      reversal threshold (e.g. 30%), the running extreme is confirmed
//      as a swing vertex and direction flips.
//
// The confirmed vertex is placed at the running extreme's candle — NOT at
// the candle where the reversal was detected. This is the key difference
// from a naive "first peak then down" approach: if a cycle has multiple
// peaks, ZigZag captures the highest one.
//
// Pure. Output: alternating swing highs and lows (by construction, the
// direction flips at every vertex). Always includes the unconfirmed final
// running extreme as a "current leg in progress" vertex so the most
// recent leg is visible even if its reversal hasn't been confirmed yet.

import type { Candle } from "../../../../../shared/zennyTypes";
import type { SwingExtremum } from "../candle/findLocalExtrema";

export interface FindZigZagLevelsInput {
  candles: Candle[];
  // Reversal threshold as a fraction of the running extreme — e.g. 0.30
  // means "price must swing back from the running max by 30% to confirm
  // the peak as a swing high."
  reversalPct: number;
}

export function findZigZagLevels(
  input: FindZigZagLevelsInput,
): SwingExtremum[] {
  const candles = input.candles;
  const reversalPct = input.reversalPct;
  if (candles.length < 3) return [];

  const result: SwingExtremum[] = [];
  let direction: "UP" | "DOWN" | null = null;

  // The running extreme: the highest (in UP) or lowest (in DOWN) close
  // seen since the last confirmed vertex, and the candle index where it
  // occurred. When a reversal is confirmed, this becomes a vertex.
  let extremeIdx = 0;
  let extremePrice = candles[0].close;

  // Also track a candidate "initial base" — the extreme in the OPPOSITE
  // direction before we've determined which way the data is moving.
  // For BTC Monthly starting around 2019, the initial direction is
  // ambiguous until the first major move confirms it. Once confirmed,
  // the initial extreme becomes the first vertex (the "range bottom" or
  // "range top" at the start of the visible data).
  let initialIdx = 0;
  let initialPrice = candles[0].close;

  for (let i = 1; i < candles.length; i++) {
    const price = candles[i].close;

    if (direction === null) {
      // Direction not yet determined. Track the lowest-so-far and
      // highest-so-far; whichever reverses first determines direction.
      if (price < initialPrice) {
        initialIdx = i;
        initialPrice = price;
      }
      if (price > extremePrice) {
        extremeIdx = i;
        extremePrice = price;
      }

      // Check if we've swung enough to determine direction.
      // Case 1: rose from initial low by > reversalPct → direction is UP,
      //         initial low is the first swing low.
      if (price > initialPrice * (1 + reversalPct)) {
        result.push({
          index: initialIdx,
          candleOpenTime: candles[initialIdx].openTime,
          price: initialPrice,
          wickPrice: candles[initialIdx].low,
          type: "swing_low",
        });
        direction = "UP";
        // Reset running extreme for the new UP direction.
        extremeIdx = i;
        extremePrice = price;
      }
      // Case 2: fell from initial high by > reversalPct → direction is DOWN,
      //         initial high is the first swing high.
      else if (price < extremePrice * (1 - reversalPct)) {
        result.push({
          index: extremeIdx,
          candleOpenTime: candles[extremeIdx].openTime,
          price: extremePrice,
          wickPrice: candles[extremeIdx].high,
          type: "swing_high",
        });
        direction = "DOWN";
        extremeIdx = i;
        extremePrice = price;
      }
      continue;
    }

    if (direction === "UP") {
      if (price > extremePrice) {
        // New higher high — running extreme updates.
        extremeIdx = i;
        extremePrice = price;
      } else if (price < extremePrice * (1 - reversalPct)) {
        // Reversal confirmed — the running extreme becomes the peak.
        result.push({
          index: extremeIdx,
          candleOpenTime: candles[extremeIdx].openTime,
          price: extremePrice,
          wickPrice: candles[extremeIdx].high,
          type: "swing_high",
        });
        direction = "DOWN";
        extremeIdx = i;
        extremePrice = price;
      }
    } else {
      // direction === "DOWN"
      if (price < extremePrice) {
        extremeIdx = i;
        extremePrice = price;
      } else if (price > extremePrice * (1 + reversalPct)) {
        result.push({
          index: extremeIdx,
          candleOpenTime: candles[extremeIdx].openTime,
          price: extremePrice,
          wickPrice: candles[extremeIdx].low,
          type: "swing_low",
        });
        direction = "UP";
        extremeIdx = i;
        extremePrice = price;
      }
    }
  }

  // Add the final running extreme as the "current leg in progress."
  // Even if its reversal hasn't been confirmed, the user's eye reads it
  // as the active swing — e.g. the recent low in a pullback that hasn't
  // yet rallied back up.
  if (direction !== null && result.length > 0) {
    const last = result[result.length - 1];
    if (last.index !== extremeIdx) {
      result.push({
        index: extremeIdx,
        candleOpenTime: candles[extremeIdx].openTime,
        price: extremePrice,
        wickPrice:
          direction === "UP"
            ? candles[extremeIdx].high
            : candles[extremeIdx].low,
        type: direction === "UP" ? "swing_high" : "swing_low",
      });
    }
  }

  // Post-process: collapse double-top / double-bottom patterns.
  // A sequence [HIGH1, LOW1, HIGH2] where HIGH2 > HIGH1 means HIGH1 was
  // just an intermediate wobble before the REAL cycle peak at HIGH2;
  // drop HIGH1 and LOW1. Mirror for [LOW1, HIGH1, LOW2] where LOW2 < LOW1.
  //
  // This fixes BTC 2021's double-top: ZigZag sees March 2021 ($58K) as a
  // peak because the May dip exceeds the reversal threshold, but October
  // 2021 ($61K) is higher and is what the trader's eye reads as THE 2021
  // cycle peak. Without this merge, both would appear as separate vertices.
  return mergeDoublePatterns(result);
}

// A double-top only counts when the two peaks are "close in price" —
// within this fraction of each other. Outside this tolerance, two peaks
// are from different cycles and should NOT be merged.
const DOUBLE_TOP_PRICE_TOLERANCE = 0.2;

function mergeDoublePatterns(vertices: SwingExtremum[]): SwingExtremum[] {
  let current = vertices.slice();
  let changed = true;
  while (changed) {
    changed = false;
    // Compute current global extremes — a merge must never drop a vertex
    // that is the global max (for swing_high) or global min (for
    // swing_low), because that vertex IS a real cycle peak/trough and
    // the whole point of the algorithm is to surface those. This guard
    // is what prevents the Daily bug where [LOW, HIGH-ATH, LOW] got
    // collapsed as a "double-bottom" and threw away the ATH.
    let globalMax = -Infinity;
    let globalMin = Infinity;
    for (const v of current) {
      if (v.type === "swing_high" && v.price > globalMax) globalMax = v.price;
      if (v.type === "swing_low" && v.price < globalMin) globalMin = v.price;
    }
    const next: SwingExtremum[] = [];
    let i = 0;
    while (i < current.length) {
      if (i + 2 < current.length) {
        const a = current[i];
        const b = current[i + 1];
        const c = current[i + 2];
        // Double-top: [HIGH_a, LOW_b, higher HIGH_c]. Drops a and b,
        // keeps c. Blocked if b is the global min (dropping it would
        // lose a real cycle trough) or a is the global max (impossible
        // since c > a, but symmetry).
        if (
          a.type === "swing_high" &&
          b.type === "swing_low" &&
          c.type === "swing_high" &&
          c.price > a.price &&
          (c.price - a.price) / a.price <= DOUBLE_TOP_PRICE_TOLERANCE &&
          b.price > globalMin &&
          a.price < globalMax
        ) {
          next.push(c);
          i += 3;
          changed = true;
          continue;
        }
        // Double-bottom: [LOW_a, HIGH_b, lower LOW_c]. Drops a and b,
        // keeps c. Blocked if b is the global max (dropping it would
        // lose the cycle peak — this is the Daily ATH case).
        if (
          a.type === "swing_low" &&
          b.type === "swing_high" &&
          c.type === "swing_low" &&
          c.price < a.price &&
          (a.price - c.price) / a.price <= DOUBLE_TOP_PRICE_TOLERANCE &&
          b.price < globalMax &&
          a.price > globalMin
        ) {
          next.push(c);
          i += 3;
          changed = true;
          continue;
        }
      }
      next.push(current[i]);
      i++;
    }
    current = next;
  }
  return current;
}
