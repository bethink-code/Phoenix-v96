// Client-side mirror of the AnalysisState shape returned from /api/zenny/braid-view-model.
// Kept in sync with server/modules/zenny/analysis/orchestrator.ts AnalysisState.

import type { Candle, Timeframe } from "@shared/zennyTypes";

export interface ScoreBreakdownClient {
  freshness: number;
  departure: number;
  depth: number;
  volume: number;
  liquidation: number;
  timeframeConfluence: number;
  touchQuality: number;
  total: number;
}

export interface AnalysisLevelClient {
  id: string;
  price: number;
  side: "RESISTANCE" | "SUPPORT";
  swingCandleTime: number;
  swingCandleIndex: number;
  source: "extrema" | "tick" | "both";
  graduatedToPoolId: string | null;
}

export interface AnalysisPoolClient {
  id: string;
  symbol: string;
  timeframe: Timeframe;
  type: "RESISTANCE" | "SUPPORT";
  wickHigh: number;
  wickLow: number;
  centreLine: number;
  birthCandleTime: number;
  birthCandleIndex: number;
  status: "active";
  scoreBreakdown: ScoreBreakdownClient;
  validationFailures: string[];
}

export interface AnalysisRejectedClient {
  candidatePrice: number;
  side: "RESISTANCE" | "SUPPORT";
  failureReasons: string[];
  scoreBreakdown: ScoreBreakdownClient | null;
  reason: "validation_failed" | "score_below_threshold";
}

export interface AnalysisStateClient {
  symbol: string;
  timeframe: Timeframe;
  candles: Candle[];
  levels: AnalysisLevelClient[];
  pools: AnalysisPoolClient[];
  rejectedCandidates: AnalysisRejectedClient[];
  computedAtMs: number;
}
