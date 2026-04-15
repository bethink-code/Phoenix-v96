// findBodyClusters — find horizontal levels formed by multiple candle bodies
// converging at similar prices, even when no individual candle is a strict
// swing pivot. Complements findLocalExtrema (which is a TURNING POINT
// primitive) by catching levels formed by REPETITION instead of reversal.
//
// Failure modes this catches that strict swing pivots can't:
//   - Multi-touch resistance/support where 3+ bodies tie at the same price
//     (strict-inequality detection rejects ties by definition)
//   - Reaction-within-trend / "step" levels where bodies cluster on a pause
//     but price keeps trending (no follow-through reversal happens)
//
// Algorithm: greedy O(N²). For each candle's body extreme, count how many
// OTHER candles' body extremes are within tolerance. The candle with the
// most touches becomes a cluster center, claims its members, repeat until
// no more clusters meet minTouches.
//
// Why greedy not running-mean clustering: running-mean drift can chain
// distant bodies into one giant cluster in sideways action. Greedy fixed-
// reference avoids that — every cluster is anchored to a real candle.
//
// Pure. Returns synthetic SwingExtremum entries so the orchestrator can
// merge them into the same pipeline as real swing pivots.

import type { Candle } from "../../../../../shared/zennyTypes";
import type { SwingExtremum } from "../candle/findLocalExtrema";

export interface FindBodyClustersInput {
  candles: Candle[];
  minTouches?: number; // default 3
  tolerancePct?: number; // default 0.0015 (0.15%)
}

export function findBodyClusters(
  input: FindBodyClustersInput,
): SwingExtremum[] {
  const minTouches = input.minTouches ?? 3;
  const tolerance = input.tolerancePct ?? 0.0015;
  const result: SwingExtremum[] = [];

  // Resistance: cluster body tops
  result.push(
    ...clusterSide(input.candles, "swing_high", minTouches, tolerance),
  );
  // Support: cluster body bottoms
  result.push(
    ...clusterSide(input.candles, "swing_low", minTouches, tolerance),
  );

  return result;
}

function clusterSide(
  candles: Candle[],
  type: "swing_high" | "swing_low",
  minTouches: number,
  tolerance: number,
): SwingExtremum[] {
  // Compute body extreme for each candle (top for resistance, bottom for support)
  const bodyExtremes = candles.map((c) =>
    type === "swing_high" ? Math.max(c.open, c.close) : Math.min(c.open, c.close),
  );

  const used = new Set<number>();
  const clusters: SwingExtremum[] = [];

  // Greedy: while there's still a candidate with enough touches, claim it
  while (true) {
    let bestCenterIdx = -1;
    let bestMembers: number[] = [];

    for (let i = 0; i < candles.length; i++) {
      if (used.has(i)) continue;
      const center = bodyExtremes[i];
      const members: number[] = [];
      for (let j = 0; j < candles.length; j++) {
        if (used.has(j)) continue;
        if (Math.abs(bodyExtremes[j] - center) / center <= tolerance) {
          members.push(j);
        }
      }
      if (members.length > bestMembers.length) {
        bestCenterIdx = i;
        bestMembers = members;
      }
    }

    if (bestMembers.length < minTouches) break;
    if (bestCenterIdx < 0) break;

    // Build the synthetic SwingExtremum representing this cluster
    const memberPrices = bestMembers.map((idx) => bodyExtremes[idx]);
    const meanPrice = memberPrices.reduce((s, p) => s + p, 0) / memberPrices.length;
    const mostRecentMemberIdx = Math.max(...bestMembers);
    const anchorCandle = candles[mostRecentMemberIdx];

    clusters.push({
      index: mostRecentMemberIdx,
      candleOpenTime: anchorCandle.openTime,
      price: meanPrice,
      wickPrice: type === "swing_high" ? anchorCandle.high : anchorCandle.low,
      type,
    });

    bestMembers.forEach((idx) => used.add(idx));
  }

  return clusters;
}
