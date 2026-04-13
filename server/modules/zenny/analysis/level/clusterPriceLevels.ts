// ClusterPriceLevels — merge nearby price points into single candidate levels.
// Two points within `tolerancePct` of each other = same level.
// Centre = mean of clustered prices.
// Pure. Spec §2.5 + math §10.3.

import type { SwingExtremum } from "../candle/findLocalExtrema";

export interface CandidateLevel {
  centrePrice: number;
  side: "RESISTANCE" | "SUPPORT";
  sourceIndices: number[]; // indices into the input extrema array
  earliestSwingTime: number;
}

export interface ClusterPriceLevelsInput {
  extrema: SwingExtremum[];
  tolerancePct: number; // e.g. 0.005 (0.5%)
}

export function clusterPriceLevels(
  input: ClusterPriceLevelsInput,
): CandidateLevel[] {
  const highs = input.extrema
    .map((e, i) => ({ ...e, originalIndex: i }))
    .filter((e) => e.type === "swing_high")
    .sort((a, b) => a.price - b.price);

  const lows = input.extrema
    .map((e, i) => ({ ...e, originalIndex: i }))
    .filter((e) => e.type === "swing_low")
    .sort((a, b) => a.price - b.price);

  const result: CandidateLevel[] = [];
  result.push(...clusterSide(highs, input.tolerancePct, "RESISTANCE"));
  result.push(...clusterSide(lows, input.tolerancePct, "SUPPORT"));
  return result;
}

function clusterSide(
  sortedPoints: Array<SwingExtremum & { originalIndex: number }>,
  tolerancePct: number,
  side: "RESISTANCE" | "SUPPORT",
): CandidateLevel[] {
  const clusters: CandidateLevel[] = [];
  let current: {
    prices: number[];
    indices: number[];
    earliestTime: number;
  } | null = null;

  for (const p of sortedPoints) {
    if (current === null) {
      current = {
        prices: [p.price],
        indices: [p.originalIndex],
        earliestTime: p.candleOpenTime,
      };
      continue;
    }
    const currentMean = mean(current.prices);
    const distance = Math.abs(p.price - currentMean) / currentMean;
    if (distance <= tolerancePct) {
      current.prices.push(p.price);
      current.indices.push(p.originalIndex);
      if (p.candleOpenTime < current.earliestTime) {
        current.earliestTime = p.candleOpenTime;
      }
    } else {
      clusters.push({
        centrePrice: mean(current.prices),
        side,
        sourceIndices: current.indices,
        earliestSwingTime: current.earliestTime,
      });
      current = {
        prices: [p.price],
        indices: [p.originalIndex],
        earliestTime: p.candleOpenTime,
      };
    }
  }
  if (current !== null) {
    clusters.push({
      centrePrice: mean(current.prices),
      side,
      sourceIndices: current.indices,
      earliestSwingTime: current.earliestTime,
    });
  }
  return clusters;
}

function mean(arr: number[]): number {
  return arr.reduce((s, n) => s + n, 0) / arr.length;
}
