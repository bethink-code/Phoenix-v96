// Orchestrator — runs the analysis pipeline for a single symbol on a single timeframe.
// Phase 1: Daily-only, no multi-TF confluence, no order book scoring, no liquidations.
// Pure (given a provider + config) — returns the full AnalysisState.

import type { Candle, Timeframe } from "../../../../shared/zennyTypes";
import type { MarketDataProvider } from "../infrastructure/providers/providerInterface";
import { getCandles } from "./data/getCandles";
import { findLocalExtrema } from "./candle/findLocalExtrema";
import { classifyCandle } from "./candle/classifyCandle";
import { clusterPriceLevels, type CandidateLevel } from "./level/clusterPriceLevels";
import { adaptiveTolerance } from "./level/adaptiveTolerance";
import { validateCandidatePool } from "./pool/validateCandidatePool";
import { setPoolBoundaries } from "./pool/setPoolBoundaries";
import { scoreFreshness } from "./score/scoreFreshness";
import { scoreDepartureStrength } from "./score/scoreDepartureStrength";
import { scoreVolumeProfile } from "./score/scoreVolumeProfile";
import { scoreOrderBookDepth } from "./score/scoreOrderBookDepth";
import { scoreLiquidationCluster } from "./score/scoreLiquidationCluster";
import { scoreTimeframeConfluence } from "./score/scoreTimeframeConfluence";
import { scoreTouchQuality } from "./score/scoreTouchQuality";
import { aggregatePoolScore } from "./score/aggregatePoolScore";

// ---------------------------------------------------------------------------
// Output types

export interface AnalysisLevel {
  id: string; // synthetic for v1 (deterministic from price+side+time)
  price: number;
  side: "RESISTANCE" | "SUPPORT";
  swingCandleTime: number;
  swingCandleIndex: number;
  source: "extrema" | "tick" | "both";
  graduatedToPoolId: string | null;
}

export interface AnalysisPool {
  id: string;
  symbol: string;
  timeframe: Timeframe;
  type: "RESISTANCE" | "SUPPORT";
  wickHigh: number;
  wickLow: number;
  centreLine: number;
  birthCandleTime: number;
  birthCandleIndex: number;
  status: "active"; // Phase 1: all pools are alive (death detection deferred)
  scoreBreakdown: ReturnType<typeof aggregatePoolScore>;
  validationFailures: string[]; // empty if valid
}

export interface AnalysisRejected {
  candidatePrice: number;
  side: "RESISTANCE" | "SUPPORT";
  failureReasons: string[];
  scoreBreakdown: ReturnType<typeof aggregatePoolScore> | null;
  reason: "validation_failed" | "score_below_threshold";
}

export interface AnalysisState {
  symbol: string;
  timeframe: Timeframe;
  candles: Candle[];
  levels: AnalysisLevel[];
  pools: AnalysisPool[];
  rejectedCandidates: AnalysisRejected[];
  computedAtMs: number;
}

// ---------------------------------------------------------------------------

export interface RunAnalysisInput {
  provider: MarketDataProvider;
  symbol: string;
  timeframe: Timeframe;
  candleCount?: number; // default 200
  swingN?: number; // candles each side for swing detection (default 7)
  validityScoreThreshold?: number; // default 60
}

export async function runAnalysis(
  input: RunAnalysisInput,
): Promise<AnalysisState> {
  const candleCount = input.candleCount ?? 200;
  const swingN = input.swingN ?? 7;
  const validityThreshold = input.validityScoreThreshold ?? 60;

  // 1. Fetch candles
  const candles = await getCandles(input.provider, {
    symbol: input.symbol,
    timeframe: input.timeframe,
    count: candleCount,
  });

  if (candles.length === 0) {
    return {
      symbol: input.symbol,
      timeframe: input.timeframe,
      candles: [],
      levels: [],
      pools: [],
      rejectedCandidates: [],
      computedAtMs: Date.now(),
    };
  }

  const currentPrice = candles[candles.length - 1].close;

  // 2. Find swing extrema
  const extrema = findLocalExtrema({ candles, n: swingN });

  // 3. Cluster into candidate levels with adaptive tolerance
  const tolerance = adaptiveTolerance({ candles });
  const candidates = clusterPriceLevels({
    extrema,
    tolerancePct: tolerance,
  });

  // 4. Build the levels output (every candidate is rendered, pool or not)
  const levels: AnalysisLevel[] = candidates.map((c, i) => ({
    id: `lvl-${input.symbol}-${input.timeframe}-${i}-${Math.round(c.centrePrice)}`,
    price: c.centrePrice,
    side: c.side,
    swingCandleTime: c.earliestSwingTime,
    swingCandleIndex: findCandleIndexByTime(candles, c.earliestSwingTime),
    source: "extrema",
    graduatedToPoolId: null,
  }));

  // 5. Validate, build boundaries, score each candidate
  const pools: AnalysisPool[] = [];
  const rejectedCandidates: AnalysisRejected[] = [];

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    const validation = validateCandidatePool({
      candidatePrice: candidate.centrePrice,
      side: candidate.side,
      candles,
    });

    if (!validation.valid) {
      rejectedCandidates.push({
        candidatePrice: candidate.centrePrice,
        side: candidate.side,
        failureReasons: validation.failureReasons,
        scoreBreakdown: null,
        reason: "validation_failed",
      });
      continue;
    }

    const boundaries = setPoolBoundaries({
      candidatePrice: candidate.centrePrice,
      side: candidate.side,
      candles,
      currentPrice,
    });

    // Score the pool
    const poolScore = scorePool({
      touchCount: validation.touchCount,
      volumePercentile: validation.volumePercentile,
      candidatePrice: candidate.centrePrice,
      candles,
      side: candidate.side,
    });

    if (poolScore.total < validityThreshold) {
      rejectedCandidates.push({
        candidatePrice: candidate.centrePrice,
        side: candidate.side,
        failureReasons: [`score ${poolScore.total} < ${validityThreshold}`],
        scoreBreakdown: poolScore,
        reason: "score_below_threshold",
      });
      continue;
    }

    const poolId = `pool-${input.symbol}-${input.timeframe}-${i}-${Math.round(candidate.centrePrice)}`;
    pools.push({
      id: poolId,
      symbol: input.symbol,
      timeframe: input.timeframe,
      type: candidate.side,
      wickHigh: boundaries.wickHigh,
      wickLow: boundaries.wickLow,
      centreLine: boundaries.centreLine,
      birthCandleTime: candidate.earliestSwingTime,
      birthCandleIndex: findCandleIndexByTime(candles, candidate.earliestSwingTime),
      status: "active",
      scoreBreakdown: poolScore,
      validationFailures: [],
    });
    levels[i].graduatedToPoolId = poolId;
  }

  return {
    symbol: input.symbol,
    timeframe: input.timeframe,
    candles,
    levels,
    pools,
    rejectedCandidates,
    computedAtMs: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Helpers

function findCandleIndexByTime(candles: Candle[], openTime: number): number {
  for (let i = 0; i < candles.length; i++) {
    if (candles[i].openTime === openTime) return i;
  }
  // Closest match (fallback)
  let closestIdx = 0;
  let closestDelta = Infinity;
  for (let i = 0; i < candles.length; i++) {
    const d = Math.abs(candles[i].openTime - openTime);
    if (d < closestDelta) {
      closestDelta = d;
      closestIdx = i;
    }
  }
  return closestIdx;
}

interface ScorePoolInput {
  touchCount: number;
  volumePercentile: number;
  candidatePrice: number;
  candles: Candle[];
  side: "RESISTANCE" | "SUPPORT";
}

function scorePool(input: ScorePoolInput): ReturnType<typeof aggregatePoolScore> {
  const freshness = scoreFreshness(input.touchCount);
  // Departure: synthesise from the most recent touch's next candle
  // (simplified for v1 — full base detection comes later)
  const departure = computeDepartureScore(input);
  const volume = scoreVolumeProfile(input.volumePercentile);
  const depth = scoreOrderBookDepth(0); // stubbed
  const liquidation = scoreLiquidationCluster(null); // stubbed
  const tfConf = scoreTimeframeConfluence(1); // stubbed: single TF
  const touchQuality = scoreTouchQuality({ qualityScores: [] }); // simplified

  return aggregatePoolScore({
    freshness,
    departure,
    depth,
    volume,
    liquidation,
    timeframeConfluence: tfConf,
    touchQuality,
  });
}

function computeDepartureScore(input: ScorePoolInput): number {
  // Find the most recent candle that touched the level and use the candle after
  // it as the departure. Use 1 base candle as a simplification for v1.
  const tolerance = 0.005;
  const upper = input.candidatePrice * (1 + tolerance);
  const lower = input.candidatePrice * (1 - tolerance);

  for (let i = input.candles.length - 1; i >= 1; i--) {
    const c = input.candles[i];
    const touched =
      input.side === "RESISTANCE"
        ? c.high >= lower && c.high <= upper
        : c.low >= lower && c.low <= upper;
    if (touched && i + 1 < input.candles.length) {
      return scoreDepartureStrength({
        baseCandles: [c],
        departureCandle: input.candles[i + 1],
        previousCandle: input.candles[i - 1] ?? null,
        side: input.side,
      });
    }
  }
  return 0;
}
