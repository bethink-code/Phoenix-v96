// Client-side mirror of the AnalysisState shape returned from
// /api/zenny/braid-view-model. Kept in sync with
// server/modules/zenny/analysis/orchestrator.ts.

import type { Candle, Timeframe } from "@shared/zennyTypes";

export type LevelStrengthClient =
  | "trivial"
  | "weak"
  | "medium"
  | "strong"
  | "very_strong";

export type PoolStatusClient = "active" | "dead";
export type PoolKindClient = "historical_respect" | "untaken_liquidity";
export type DeathReasonClient =
  | "engulfing"
  | "sustained_break"
  | "score_exhaustion";

export interface AnalysisLevelClient {
  id: string;
  price: number; // close of the swing candle
  wickPrice: number;
  side: "RESISTANCE" | "SUPPORT";
  sourceTimeframe: Timeframe;
  swingCandleTime: number;
  swingCandleIndexOnPrimary: number;
  matchingTimeframes: Timeframe[];
  confluenceCount: number;
  clusterMemberIds: string[];
  recency: number;
  strength: LevelStrengthClient;
  graduatedToPoolId: string | null;
  // True if a subsequent candle close on the source TF has gone past this
  // level's price. Broken levels represent consumed liquidity and should
  // not render as tradeable.
  broken: boolean;
}

export interface AnalysisPoolClient {
  id: string;
  symbol: string;
  sourceTimeframe: Timeframe;
  type: "RESISTANCE" | "SUPPORT";
  kind: PoolKindClient;
  linePrice: number;
  wickHigh: number;
  wickLow: number;
  centreLine: number;
  birthCandleTime: number;
  birthCandleIndexOnPrimary: number;
  deathCandleTime: number | null;
  deathCandleIndexOnPrimary: number | null;
  deathReason: DeathReasonClient | null;
  status: PoolStatusClient;
  confluenceCount: number;
  strength: LevelStrengthClient;
}

export interface AnalysisStateClient {
  symbol: string;
  primaryTimeframe: Timeframe;
  analysedTimeframes: Timeframe[];
  candles: Candle[];
  levels: AnalysisLevelClient[];
  pools: AnalysisPoolClient[];
  computedAtMs: number;
}
