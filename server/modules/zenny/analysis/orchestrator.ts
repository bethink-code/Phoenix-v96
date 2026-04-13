// Orchestrator — bar-by-bar replay of the analysis pipeline over the candle
// history. Each candle close is treated as "now"; pools are born, scored, and
// killed cumulatively. The final state at end-of-window contains both still-
// active pools and historically-taken pools.
//
// Phase 1: Daily-only, no multi-TF confluence, no order book scoring,
// no liquidations. Death detection IS in.

import type { Candle, Timeframe } from "../../../../shared/zennyTypes";
import type { MarketDataProvider } from "../infrastructure/providers/providerInterface";
import { getCandles } from "./data/getCandles";
import { findLocalExtrema } from "./candle/findLocalExtrema";
import { countTouches } from "./candle/countTouches";
import { clusterPriceLevels } from "./level/clusterPriceLevels";
import { adaptiveTolerance } from "./level/adaptiveTolerance";
import { validateCandidatePool } from "./pool/validateCandidatePool";
import { setPoolBoundaries } from "./pool/setPoolBoundaries";
import { detectEngulfingDeath } from "./pool/detectEngulfingDeath";
import { detectSustainedBreakDeath } from "./pool/detectSustainedBreakDeath";
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

export type LevelStrength = "trivial" | "weak" | "medium" | "strong" | "very_strong";

export interface AnalysisLevel {
  id: string;
  price: number;
  side: "RESISTANCE" | "SUPPORT";
  swingCandleTime: number;
  swingCandleIndex: number;
  source: "extrema" | "tick" | "both";
  touchCount: number; // total candles in the lookback whose range crossed the level band
  strength: LevelStrength; // derived from touchCount
  graduatedToPoolId: string | null;
}

// Map touch count to strength tier. Used both for rendering opacity and for
// the Levels panel display. Pure function — exposed so the harness can sweep.
export function levelStrengthForTouches(touches: number): LevelStrength {
  if (touches >= 6) return "very_strong";
  if (touches >= 4) return "strong";
  if (touches >= 3) return "medium";
  if (touches >= 2) return "weak";
  return "trivial";
}

export type PoolStatus = "active" | "dead";
export type DeathReason = "engulfing" | "sustained_break" | "score_exhaustion";

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
  deathCandleTime: number | null;
  deathCandleIndex: number | null;
  deathReason: DeathReason | null;
  status: PoolStatus;
  scoreBreakdown: ReturnType<typeof aggregatePoolScore>;
  validationFailures: string[];
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
  pools: AnalysisPool[]; // includes both active and dead
  rejectedCandidates: AnalysisRejected[];
  computedAtMs: number;
}

// ---------------------------------------------------------------------------

export interface RunAnalysisInput {
  provider: MarketDataProvider;
  symbol: string;
  timeframe: Timeframe;
  candleCount?: number; // default 200
  swingN?: number; // default 7
  validityScoreThreshold?: number; // default 60
  minTouches?: number; // override; default is TF-adaptive
}

// Higher TFs naturally have fewer touches per level (each Daily candle is 24h
// of action compressed; 1H is 1h). Research-tuned minimum of 3 is fine for
// 15m/1H/4H but is too strict on 12H/Daily where even 2 touches is meaningful.
function defaultMinTouchesForTf(tf: Timeframe): number {
  if (tf === "D" || tf === "12H") return 2;
  return 3;
}

export async function runAnalysis(
  input: RunAnalysisInput,
): Promise<AnalysisState> {
  const candleCount = input.candleCount ?? 200;
  const swingN = input.swingN ?? 7;
  const validityThreshold = input.validityScoreThreshold ?? 60;
  const minTouches = input.minTouches ?? defaultMinTouchesForTf(input.timeframe);

  // 1. Fetch the full candle history for this run
  const candles = await getCandles(input.provider, {
    symbol: input.symbol,
    timeframe: input.timeframe,
    count: candleCount,
  });

  if (candles.length < swingN * 2 + 1) {
    return {
      symbol: input.symbol,
      timeframe: input.timeframe,
      candles,
      levels: [],
      pools: [],
      rejectedCandidates: [],
      computedAtMs: Date.now(),
    };
  }

  // 2. Pre-compute swing extrema across the whole window. We then "stream" them
  //    into the replay loop in the order they would have stabilised at, which
  //    is candle index = pivotIndex + swingN (the moment N candles past it close).
  const allExtrema = findLocalExtrema({ candles, n: swingN });

  // Track which candidate pools we've already considered (dedup by clustered price)
  const consideredCandidates = new Map<string, true>();
  const pools: AnalysisPool[] = [];
  const rejectedCandidates: AnalysisRejected[] = [];
  const levels: AnalysisLevel[] = [];

  // 3. Bar-by-bar replay. At each candle close (index `i`), we:
  //    a. Find any extrema that have just stabilised (their pivot was at i-swingN)
  //    b. Cluster them with each other into candidate levels
  //    c. Validate / score / birth new pools using only candles[0..=i]
  //    d. Check existing active pools for death events at candles[i]
  for (let i = swingN; i < candles.length; i++) {
    // a. Find pivots whose stabilisation moment is exactly this candle (pivot at i - swingN)
    const pivotIndex = i - swingN;
    const newPivots = allExtrema.filter((e) => e.index === pivotIndex);

    if (newPivots.length > 0) {
      // b. Cluster the new pivot(s) and any other unstabilised pivots within the same window
      const tolerance = adaptiveTolerance({ candles: candles.slice(0, i + 1) });

      for (const pivot of newPivots) {
        const candidateKey = `${pivot.type}-${Math.round(pivot.price * 100)}`;
        if (consideredCandidates.has(candidateKey)) continue;
        consideredCandidates.set(candidateKey, true);

        const side = pivot.type === "swing_high" ? "RESISTANCE" : "SUPPORT";
        const candidatePrice = pivot.price;

        // Touch count for STRENGTH/visualisation: use the full candle window so
        // visits that happen AFTER the pivot stabilises are counted. This
        // answers "how meaningful is this level across the visible chart?"
        // The validation pipeline below uses a different (history-only) count
        // because it must answer "would the engine have known this live?"
        const fullWindowTouches = countTouches({
          candles, // full window, including post-pivot candles
          price: candidatePrice,
          tolerancePct: tolerance,
          side,
        }).length;

        // Record the level (every candidate gets a level entry, even if it
        // never graduates to a pool — strong unattended levels are useful
        // visual context).
        const levelId = `lvl-${input.symbol}-${input.timeframe}-${pivot.index}-${Math.round(candidatePrice)}`;
        levels.push({
          id: levelId,
          price: candidatePrice,
          side,
          swingCandleTime: candles[pivot.index].openTime,
          swingCandleIndex: pivot.index,
          source: "extrema",
          touchCount: fullWindowTouches,
          strength: levelStrengthForTouches(fullWindowTouches),
          graduatedToPoolId: null,
        });

        // c. Validate against the historical window we know about so far (candles[0..=i]).
        //    The tolerance just adapts to local volatility.
        const historyWindow = candles.slice(0, i + 1);
        const validation = validateCandidatePool({
          candidatePrice,
          side,
          candles: historyWindow,
          provisionalTolerancePct: tolerance,
          minTouches,
        });

        if (!validation.valid) {
          rejectedCandidates.push({
            candidatePrice,
            side,
            failureReasons: validation.failureReasons,
            scoreBreakdown: null,
            reason: "validation_failed",
          });
          continue;
        }

        const boundaries = setPoolBoundaries({
          candidatePrice,
          side,
          candles: historyWindow,
          currentPrice: candles[i].close,
          provisionalTolerancePct: tolerance,
        });

        const breakdown = scoreNewPool({
          touchCount: validation.touchCount,
          volumePercentile: validation.volumePercentile,
          candidatePrice,
          candles: historyWindow,
          side,
        });

        if (breakdown.total < validityThreshold) {
          rejectedCandidates.push({
            candidatePrice,
            side,
            failureReasons: [`score ${breakdown.total} < ${validityThreshold}`],
            scoreBreakdown: breakdown,
            reason: "score_below_threshold",
          });
          continue;
        }

        const poolId = `pool-${input.symbol}-${input.timeframe}-${pivot.index}-${Math.round(candidatePrice)}`;
        pools.push({
          id: poolId,
          symbol: input.symbol,
          timeframe: input.timeframe,
          type: side,
          wickHigh: boundaries.wickHigh,
          wickLow: boundaries.wickLow,
          centreLine: boundaries.centreLine,
          birthCandleTime: candles[pivot.index].openTime,
          birthCandleIndex: pivot.index,
          deathCandleTime: null,
          deathCandleIndex: null,
          deathReason: null,
          status: "active",
          scoreBreakdown: breakdown,
          validationFailures: [],
        });
        levels[levels.length - 1].graduatedToPoolId = poolId;
      }
    }

    // d. Check existing active pools for death at the *current* candle close.
    const currentCandle = candles[i];
    for (const pool of pools) {
      if (pool.status === "dead") continue;
      if (i <= pool.birthCandleIndex) continue;

      // Engulfing — single-candle death
      if (
        detectEngulfingDeath({
          candle: currentCandle,
          poolWickHigh: pool.wickHigh,
          poolWickLow: pool.wickLow,
          poolType: pool.type,
        })
      ) {
        pool.status = "dead";
        pool.deathCandleTime = currentCandle.openTime;
        pool.deathCandleIndex = i;
        pool.deathReason = "engulfing";
        continue;
      }

      // Sustained break — last 3 candles
      const lookbackStart = Math.max(pool.birthCandleIndex + 1, i - 2);
      const recent = candles.slice(lookbackStart, i + 1);
      if (recent.length >= 3) {
        const sb = detectSustainedBreakDeath({
          recentCandles: recent,
          poolWickHigh: pool.wickHigh,
          poolWickLow: pool.wickLow,
          poolType: pool.type,
        });
        if (sb.dead) {
          pool.status = "dead";
          pool.deathCandleTime = currentCandle.openTime;
          pool.deathCandleIndex = i;
          pool.deathReason = "sustained_break";
        }
      }
      // Score exhaustion deferred — needs a per-candle score history that
      // we're not yet tracking. Phase 2 will wire it via pool_score_history.
    }
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

interface ScorePoolInput {
  touchCount: number;
  volumePercentile: number;
  candidatePrice: number;
  candles: Candle[];
  side: "RESISTANCE" | "SUPPORT";
}

function scoreNewPool(input: ScorePoolInput): ReturnType<typeof aggregatePoolScore> {
  const freshness = scoreFreshness(input.touchCount);
  const departure = computeDepartureScore(input);
  const volume = scoreVolumeProfile(input.volumePercentile);
  const depth = scoreOrderBookDepth(0); // stubbed
  const liquidation = scoreLiquidationCluster(null); // stubbed
  const tfConf = scoreTimeframeConfluence(1); // stubbed: single TF
  const touchQuality = scoreTouchQuality({ qualityScores: [] });

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
