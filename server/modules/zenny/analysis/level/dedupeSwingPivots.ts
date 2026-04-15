// dedupeSwingPivots — collapse swing extrema within X% of each other on the
// same side into a single representative. Used to remove "same level touched
// multiple times" duplicates that the raw pivot detector produces when a TF
// chops in a tight range. Without this, a 4-touch low cluster renders as 4
// stacked lines instead of one.
//
// Strategy: cluster by price (delegated to clusterPriceLevels), then for
// each cluster keep the MOST RECENT member (highest index in the original
// extrema array). Most recent = freshest representation of the level on the
// current chart.
//
// Pure. Tolerance comes from the caller — no global default baked in here.

import type { SwingExtremum } from "../candle/findLocalExtrema";
import { clusterPriceLevels } from "./clusterPriceLevels";

export interface DedupeSwingPivotsInput {
  extrema: SwingExtremum[];
  tolerancePct: number; // e.g. 0.003 = 0.3%
}

export function dedupeSwingPivots(
  input: DedupeSwingPivotsInput,
): SwingExtremum[] {
  if (input.extrema.length === 0) return [];

  const clusters = clusterPriceLevels({
    extrema: input.extrema,
    tolerancePct: input.tolerancePct,
  });

  const survivors: SwingExtremum[] = [];
  for (const cluster of clusters) {
    if (cluster.sourceIndices.length === 0) continue;
    // sourceIndices are positions in the input.extrema array, NOT candle
    // indices. Map to actual extrema, then pick the one with the highest
    // candle index (most chronologically recent).
    const members = cluster.sourceIndices.map((i) => input.extrema[i]);
    const mostRecent = members.reduce((a, b) => (b.index > a.index ? b : a));
    survivors.push(mostRecent);
  }

  // Return chronologically (by candle index) so downstream consumers can
  // process oldest-first if they care about ordering.
  return survivors.sort((a, b) => a.index - b.index);
}
