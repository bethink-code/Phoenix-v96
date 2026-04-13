// AggregatePoolScore — sum the 7 sub-scores into a final 0-100 (effective range -5 to 105).
// Pure. Spec §2.6.

import type { ScoreBreakdown } from "../../../../../shared/zennyTypes";

export interface AggregateInput {
  freshness: number; // 0-25
  departure: number; // 0-20 (composite: candle + base)
  depth: number; // 0-15
  volume: number; // 0-15
  liquidation: number; // 0-15
  timeframeConfluence: number; // 0-10
  touchQuality: number; // -5 to +5
}

export function aggregatePoolScore(input: AggregateInput): ScoreBreakdown {
  const total =
    input.freshness +
    input.departure +
    input.depth +
    input.volume +
    input.liquidation +
    input.timeframeConfluence +
    input.touchQuality;

  return {
    freshness: input.freshness,
    departure: input.departure,
    depth: input.depth,
    volume: input.volume,
    liquidation: input.liquidation,
    timeframeConfluence: input.timeframeConfluence,
    touchQuality: input.touchQuality,
    total,
  };
}

export function isValidPool(score: ScoreBreakdown, threshold = 60): boolean {
  return score.total >= threshold;
}
