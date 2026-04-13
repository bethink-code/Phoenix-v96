// Orchestrator — Phase 2 refactor: multi-timeframe detection with confluence.
//
// Fetches all timeframes in parallel, runs per-TF swing detection with
// follow-through filtering, selects N most recent per side per TF, then
// clusters across TFs to compute confluence. Every level is tagged with
// its source TF and its confluence count; the "trader's four" (4H / D / W / M)
// are the TFs that contribute to confluence scoring.
//
// Lines are drawn at the CLOSE of the swing candle. Pools are one-sided
// rectangles on the stops side of the line (ATR × 1.0 by default).

import type { Candle, Timeframe } from "../../../../shared/zennyTypes";
import {
  DEFAULT_TIMEFRAME_STACK,
  CONFLUENCE_TIMEFRAMES,
} from "../../../../shared/zennyTypes";
import type { MarketDataProvider } from "../infrastructure/providers/providerInterface";
import { getCandles } from "./data/getCandles";
import {
  findLocalExtrema,
  type SwingExtremum,
} from "./candle/findLocalExtrema";
import { computeAtr14 } from "./candle/measureFollowThrough";
import { selectMostRecent } from "./level/selectMostRecent";
import {
  detectConfluence,
  type LevelInput,
} from "./level/detectConfluence";
import {
  combinedLevelStrength,
  type LevelStrength,
} from "./level/strength";
import { setPoolBoundaries } from "./pool/setPoolBoundaries";
import { detectEngulfingDeath } from "./pool/detectEngulfingDeath";
import { detectSustainedBreakDeath } from "./pool/detectSustainedBreakDeath";

// ---------------------------------------------------------------------------
// Per-TF follow-through ATR multipliers (research-backed defaults)
// Lower TFs get stricter filtering because noise is more common.

const FOLLOW_THROUGH_BY_TF: Partial<Record<Timeframe, number>> = {
  "15m": 1.8,
  "1H": 1.8,
  "4H": 2.5,
  "12H": 2.5,
  D: 2.5,
  W: 3.0,
  M: 3.0,
};

function followThroughFor(tf: Timeframe): number {
  return FOLLOW_THROUGH_BY_TF[tf] ?? 2.5;
}

// ---------------------------------------------------------------------------
// Output types

export type { LevelStrength } from "./level/strength";
export type PoolStatus = "active" | "dead";
export type DeathReason = "engulfing" | "sustained_break" | "score_exhaustion";
export type PoolKind = "historical_respect" | "untaken_liquidity";

export interface AnalysisLevel {
  id: string;
  price: number; // close of the swing candle
  wickPrice: number; // wick extreme for diagnostics
  side: "RESISTANCE" | "SUPPORT";
  sourceTimeframe: Timeframe;
  swingCandleTime: number; // ms epoch
  // The index below is into the PRIMARY timeframe's candle array, not the
  // source TF. It's computed by the orchestrator's cross-TF mapping so the
  // renderer can draw this level on the primary chart without extra work.
  swingCandleIndexOnPrimary: number;
  // Confluence enrichment
  matchingTimeframes: Timeframe[]; // which other TFs have a matching level
  confluenceCount: number; // how many of CONFLUENCE_TIMEFRAMES agree (self included)
  clusterMemberIds: string[];
  // Recency within the primary TF (0 = oldest candle, 1 = newest)
  recency: number;
  // Derived strength
  strength: LevelStrength;
  graduatedToPoolId: string | null;
}

export interface AnalysisPool {
  id: string;
  symbol: string;
  sourceTimeframe: Timeframe;
  type: "RESISTANCE" | "SUPPORT";
  kind: PoolKind;
  linePrice: number; // the level the pool sits on
  wickHigh: number;
  wickLow: number;
  centreLine: number;
  birthCandleTime: number;
  birthCandleIndexOnPrimary: number;
  deathCandleTime: number | null;
  deathCandleIndexOnPrimary: number | null;
  deathReason: DeathReason | null;
  status: PoolStatus;
  confluenceCount: number;
  strength: LevelStrength;
}

export interface AnalysisState {
  symbol: string;
  primaryTimeframe: Timeframe;
  analysedTimeframes: Timeframe[]; // all TFs successfully fetched
  candles: Candle[]; // primary TF only (what the canvas renders)
  levels: AnalysisLevel[]; // all levels from all TFs, enriched with confluence
  pools: AnalysisPool[];
  computedAtMs: number;
}

// ---------------------------------------------------------------------------
// Public API

export interface RunAnalysisInput {
  provider: MarketDataProvider;
  symbol: string;
  primaryTimeframe: Timeframe;
  candleCountPerTf?: number; // default 200
  timeframeStack?: Timeframe[]; // default DEFAULT_TIMEFRAME_STACK
  swingN?: number; // default 7
  perSide?: number; // default 2 — N most recent per side per TF
  poolOffsetAtrMultiplier?: number; // default 1.0
}

export async function runAnalysis(
  input: RunAnalysisInput,
): Promise<AnalysisState> {
  const candleCount = input.candleCountPerTf ?? 200;
  const stack = input.timeframeStack ?? DEFAULT_TIMEFRAME_STACK;
  const swingN = input.swingN ?? 7;
  const perSide = input.perSide ?? 2;
  const poolOffsetMult = input.poolOffsetAtrMultiplier ?? 1.0;

  // 1. Fetch all timeframes in parallel. Each may return different amounts
  //    of data (Monthly for BTCUSDT is limited to ~96 candles of history).
  const fetchResults = await Promise.all(
    stack.map(async (tf) => {
      try {
        const candles = await getCandles(input.provider, {
          symbol: input.symbol,
          timeframe: tf,
          count: candleCount,
        });
        return { tf, candles, error: null as Error | null };
      } catch (err) {
        return {
          tf,
          candles: [] as Candle[],
          error: err instanceof Error ? err : new Error(String(err)),
        };
      }
    }),
  );

  // 2. Per-TF: detect swings, filter by follow-through, select most recent.
  const perTfPivots = new Map<Timeframe, SwingExtremum[]>();
  const perTfCandles = new Map<Timeframe, Candle[]>();
  const analysedTfs: Timeframe[] = [];

  for (const { tf, candles } of fetchResults) {
    if (candles.length < swingN * 2 + 1) continue; // not enough data
    analysedTfs.push(tf);
    perTfCandles.set(tf, candles);

    const allPivots = findLocalExtrema({
      candles,
      n: swingN,
      minReversalAtrMultiple: followThroughFor(tf),
      lookaheadCandles: 5,
    });
    const recent = selectMostRecent({ extrema: allPivots, perSide });
    perTfPivots.set(tf, recent);
  }

  const primaryCandles =
    perTfCandles.get(input.primaryTimeframe) ??
    fetchResults.find((r) => r.tf === input.primaryTimeframe)?.candles ??
    [];

  if (primaryCandles.length === 0) {
    return {
      symbol: input.symbol,
      primaryTimeframe: input.primaryTimeframe,
      analysedTimeframes: analysedTfs,
      candles: [],
      levels: [],
      pools: [],
      computedAtMs: Date.now(),
    };
  }

  // 3. Build flat level list across TFs. Each level's index is mapped onto
  //    the primary TF's candle array so the renderer has a clean X coordinate.
  const flatLevels: AnalysisLevel[] = [];
  for (const tf of analysedTfs) {
    const pivots = perTfPivots.get(tf) ?? [];
    for (const pivot of pivots) {
      const side: "RESISTANCE" | "SUPPORT" =
        pivot.type === "swing_high" ? "RESISTANCE" : "SUPPORT";
      const swingCandleTime = pivot.candleOpenTime;
      const primaryIdx = findClosestCandleIndex(primaryCandles, swingCandleTime);
      const recency = primaryIdx / Math.max(1, primaryCandles.length - 1);

      flatLevels.push({
        id: `lvl-${input.symbol}-${tf}-${pivot.index}-${Math.round(pivot.price)}`,
        price: pivot.price,
        wickPrice: pivot.wickPrice,
        side,
        sourceTimeframe: tf,
        swingCandleTime,
        swingCandleIndexOnPrimary: primaryIdx,
        matchingTimeframes: [], // filled in by confluence pass below
        confluenceCount: 0,
        clusterMemberIds: [],
        recency,
        strength: "trivial",
        graduatedToPoolId: null,
      });
    }
  }

  // 4. Confluence pass — cluster levels across TFs within tolerance.
  const confluenceInputs: LevelInput[] = flatLevels.map((l) => ({
    id: l.id,
    price: l.price,
    side: l.side,
    sourceTimeframe: l.sourceTimeframe,
  }));
  const confluenceMap = detectConfluence({
    levels: confluenceInputs,
    tolerancePct: 0.005,
  });
  for (const level of flatLevels) {
    const info = confluenceMap.get(level.id);
    if (info) {
      level.matchingTimeframes = info.matchingTimeframes;
      level.confluenceCount = info.confluenceCount;
      level.clusterMemberIds = info.clusterMemberIds;
    }
    level.strength = combinedLevelStrength(level.confluenceCount, level.recency);
  }

  // 5. Graduate levels into pools. A level becomes a pool if its strength
  //    is medium or higher (confluence >= 2 OR recency >= 0.7). Pool
  //    rectangles are one-sided on the stops side of the line.
  const pools: AnalysisPool[] = [];
  for (const level of flatLevels) {
    if (level.strength === "trivial" || level.strength === "weak") continue;
    const sourceCandles = perTfCandles.get(level.sourceTimeframe);
    if (!sourceCandles || sourceCandles.length === 0) continue;
    const atr = computeAtr14(sourceCandles, 14);
    const currentPrice = primaryCandles[primaryCandles.length - 1].close;

    const boundaries = setPoolBoundaries({
      linePrice: level.price,
      side: level.side,
      atr,
      offsetMultiplier: poolOffsetMult,
      currentPrice,
    });

    // Choose the kind based on what dominated the strength
    const kind: PoolKind =
      level.confluenceCount >= 2 ? "historical_respect" : "untaken_liquidity";

    const poolId = `pool-${input.symbol}-${level.sourceTimeframe}-${level.id}`;
    pools.push({
      id: poolId,
      symbol: input.symbol,
      sourceTimeframe: level.sourceTimeframe,
      type: level.side,
      kind,
      linePrice: level.price,
      wickHigh: boundaries.wickHigh,
      wickLow: boundaries.wickLow,
      centreLine: boundaries.centreLine,
      birthCandleTime: level.swingCandleTime,
      birthCandleIndexOnPrimary: level.swingCandleIndexOnPrimary,
      deathCandleTime: null,
      deathCandleIndexOnPrimary: null,
      deathReason: null,
      status: "active",
      confluenceCount: level.confluenceCount,
      strength: level.strength,
    });
    level.graduatedToPoolId = poolId;
  }

  // 6. Dead-pool detection. For each pool, walk forward through its SOURCE TF
  //    candles starting from the candle after birth. Check engulfing
  //    (single candle body crosses both boundaries) and sustained break
  //    (3 consecutive closes beyond boundary). If a death event fires,
  //    mark the pool dead and map the death candle time to the primary
  //    TF's coordinate system for rendering.
  for (const pool of pools) {
    const sourceCandles = perTfCandles.get(pool.sourceTimeframe);
    if (!sourceCandles || sourceCandles.length === 0) continue;

    // Find the source-TF index of the birth candle
    const birthIdx = sourceCandles.findIndex(
      (c) => c.openTime === pool.birthCandleTime,
    );
    if (birthIdx < 0) continue;

    for (let i = birthIdx + 1; i < sourceCandles.length; i++) {
      const candle = sourceCandles[i];

      // Engulfing — single-candle death
      if (
        detectEngulfingDeath({
          candle,
          poolWickHigh: pool.wickHigh,
          poolWickLow: pool.wickLow,
          poolType: pool.type,
        })
      ) {
        pool.status = "dead";
        pool.deathCandleTime = candle.openTime;
        pool.deathCandleIndexOnPrimary = findClosestCandleIndex(
          primaryCandles,
          candle.openTime,
        );
        pool.deathReason = "engulfing";
        break;
      }

      // Sustained break — last 3 closes
      const lookbackStart = Math.max(birthIdx + 1, i - 2);
      const recent = sourceCandles.slice(lookbackStart, i + 1);
      if (recent.length >= 3) {
        const sb = detectSustainedBreakDeath({
          recentCandles: recent,
          poolWickHigh: pool.wickHigh,
          poolWickLow: pool.wickLow,
          poolType: pool.type,
        });
        if (sb.dead) {
          pool.status = "dead";
          pool.deathCandleTime = candle.openTime;
          pool.deathCandleIndexOnPrimary = findClosestCandleIndex(
            primaryCandles,
            candle.openTime,
          );
          pool.deathReason = "sustained_break";
          break;
        }
      }
    }
  }

  // 7. Merge confluent pools. After all pools have been graduated and
  //    death-checked, collapse pools that sit at the same price (within
  //    tolerance) on the same side into a single representative pool.
  //    Prefer the higher-timeframe pool as the canonical one (Monthly >
  //    Weekly > Daily > 4H > 1H > 15m), and combine confluence counts.
  const mergedPools = mergeConfluentPools(pools);

  // Re-link levels to the merged pool ids (any level whose
  // graduatedToPoolId was on a pool that got merged should now point
  // at the survivor).
  const idMap = new Map<string, string>();
  for (const original of pools) {
    const survivor = mergedPools.find(
      (m) =>
        m.id === original.id ||
        (Math.abs(m.linePrice - original.linePrice) / original.linePrice <
          0.005 &&
          m.type === original.type),
    );
    if (survivor) idMap.set(original.id, survivor.id);
  }
  for (const level of flatLevels) {
    if (level.graduatedToPoolId && idMap.has(level.graduatedToPoolId)) {
      level.graduatedToPoolId = idMap.get(level.graduatedToPoolId)!;
    }
  }

  return {
    symbol: input.symbol,
    primaryTimeframe: input.primaryTimeframe,
    analysedTimeframes: analysedTfs,
    candles: primaryCandles,
    levels: flatLevels,
    pools: mergedPools,
    computedAtMs: Date.now(),
  };
}

// TF priority for merging — higher-TF pools win when collapsed.
const TF_PRIORITY: Record<Timeframe, number> = {
  M: 6,
  W: 5,
  D: 4,
  "12H": 3,
  "4H": 2,
  "1H": 1,
  "15m": 0,
};

// Merge pools that are at the same price (within 0.5%) on the same side.
// Higher-TF pool wins. The survivor's confluenceCount is the max of the group.
function mergeConfluentPools(pools: AnalysisPool[]): AnalysisPool[] {
  const tolerance = 0.005;
  const used = new Set<string>();
  const survivors: AnalysisPool[] = [];

  for (const a of pools) {
    if (used.has(a.id)) continue;
    const cluster = [a];
    used.add(a.id);
    for (const b of pools) {
      if (used.has(b.id)) continue;
      if (b.type !== a.type) continue;
      const distance = Math.abs(b.linePrice - a.linePrice) / a.linePrice;
      if (distance > tolerance) continue;
      cluster.push(b);
      used.add(b.id);
    }
    // Pick the highest-TF pool as the canonical
    cluster.sort(
      (x, y) => TF_PRIORITY[y.sourceTimeframe] - TF_PRIORITY[x.sourceTimeframe],
    );
    const winner = { ...cluster[0] };
    winner.confluenceCount = Math.max(...cluster.map((c) => c.confluenceCount));
    // If any pool in the cluster died, the cluster is dead
    const dead = cluster.find((c) => c.status === "dead");
    if (dead) {
      winner.status = "dead";
      winner.deathCandleTime = dead.deathCandleTime;
      winner.deathCandleIndexOnPrimary = dead.deathCandleIndexOnPrimary;
      winner.deathReason = dead.deathReason;
    }
    survivors.push(winner);
  }

  return survivors;
}

// ---------------------------------------------------------------------------
// Helpers

// Find the candle whose openTime is closest to the given time.
// Returns negative index marker if the time is before the window starts
// (so the renderer can clip pool rectangles to the visible left edge
// without pretending the swing happened at index 0).
//   - if openTime < first candle: returns -1 (pool is "older than visible")
//   - if openTime > last candle:  returns candles.length (pool is "newer than visible" — should never happen)
//   - otherwise:                  returns the closest index inside the window
function findClosestCandleIndex(candles: Candle[], openTime: number): number {
  if (candles.length === 0) return 0;
  if (openTime < candles[0].openTime) return -1;
  if (openTime > candles[candles.length - 1].openTime) return candles.length;
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
