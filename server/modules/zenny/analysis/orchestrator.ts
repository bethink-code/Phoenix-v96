// Orchestrator - analysis assembly only.
//
//   Levels = structural support/resistance references.
//            Pivots and body clusters create levels from closed candles.
//            Wicks can interact with a level, but close-through evidence
//            drives break/flip semantics.
//
//   Pools  = standalone wick-liquidity remainders.
//            They are discovered by findLiquidityPools and depleted by later
//            traded price, including lower-timeframe candles.
//
// Levels and pools are deliberately separate systems. Pivots are useful for
// structural levels; they are not a prerequisite for liquidity pools.
//
// Pure functions only. No DB writes, no side effects. Fetch candles, run
// detection, return the AnalysisState the route serializes.

import type { Candle, Timeframe } from "../../../../shared/zennyTypes";
import {
  DEFAULT_TIMEFRAME_STACK,
  TF_BAR_DURATION_MS,
} from "../../../../shared/zennyTypes";
import type { MarketDataProvider } from "../infrastructure/providers/providerInterface";
import { getCandles } from "./data/getCandles";
import {
  findBodyPivots,
  type BodyPivot,
} from "./level/findBodyPivots";
import { isLevelBroken } from "./level/isLevelBroken";
import { findBodyClusters } from "./level/findBodyClusters";
import {
  levelStrength,
  type LevelStrength,
} from "./level/levelStrength";
import {
  type PoolStatus,
  type DeathReason,
  type SweepReason,
} from "./pool/checkPoolAliveness";
import {
  runPullPass,
  DEFAULT_PULL_PASS_CONFIG,
  type PoolPull,
} from "./pool/pullPass";
import { extractArms, type ExtractedArms } from "./arms/extractArms";
import {
  findLiquidityPools,
  type LiquidityPoolKind,
} from "./liquidity/findLiquidityPools";
import { runPasses, type PassInfo } from "./passes/runPasses";
import {
  DEFAULT_PASS_CONFIG,
  getDefaultPassConfigForTimeframe,
  type PassConfig,
} from "./passes/types";
import type { LastLegSwing } from "./passes/lastLegPass";
import { assembleRegimeAssessment } from "./regime/assembleAssessment";
import {
  computeRegimeHistory,
  type BarRegimeSnapshot,
} from "./regime/regimeHistory";
import type {
  RegimeAssessmentResult,
  TfRegimeAssessment,
} from "./regime/types";
import { assembleTradePlans } from "../decision/assembleTradePlans";
import type { TradePlan, TradePlanResult } from "../decision/types";

// TF rank ordering — higher number = higher (slower) timeframe. Used to
// filter pools per-TF: a TF chart should consider only pools at or above
// its own rank (15m chart = all TFs; Monthly chart = only Monthly).
// Mirrors the same rule LeftFrameCanvas uses for level rendering.
const TF_RANK: Record<Timeframe, number> = {
  "15m": 0,
  "1H": 1,
  "4H": 2,
  "12H": 3,
  D: 4,
  W: 5,
  M: 6,
};

// ---------------------------------------------------------------------------
// Output types — kept compatible with the Braid's AnalysisStateClient.
// Fields the brief no longer computes (matchingTimeframes, confluenceCount,
// clusterMemberIds, kind) are present but populated with safe defaults so
// the renderer keeps working.

export type { LevelStrength } from "./level/levelStrength";
export type {
  PoolStatus,
  DeathReason,
  SweepReason,
} from "./pool/checkPoolAliveness";
export type PoolKind = LiquidityPoolKind;

export interface AnalysisLevel {
  id: string;
  price: number; // body extreme of swing candle (or cluster median)
  wickPrice: number; // wick extreme of swing candle (= price for clusters)
  side: "RESISTANCE" | "SUPPORT";
  sourceTimeframe: Timeframe;
  swingCandleTime: number;
  swingCandleIndexOnPrimary: number;
  // Identification method that produced this level. "swing" = N-bar body
  // pivot from findBodyPivots. "cluster" = horizontal price cluster from
  // findBodyClusters. Different shapes of the same idea — both go through
  // the same pass chain and render alongside each other.
  source: "swing" | "cluster";
  matchingTimeframes: Timeframe[]; // [] in this cut
  confluenceCount: number; // 0 in this cut
  clusterMemberIds: string[]; // [] in this cut
  recency: number; // 0..1 along primary TF window
  strength: LevelStrength;
  graduatedToPoolId: string | null; // legacy API field; pools are standalone
  broken: boolean;
  // Multi-pass results bag. Open-ended — each pass writes under its own
  // key. Absent key = pass was disabled or didn't apply. The renderer
  // keys on presence, never on shape; passes are independently
  // toggleable without breaking the contract.
  passes: Record<string, unknown>;
}

export interface AnalysisPool {
  id: string;
  symbol: string;
  sourceTimeframe: Timeframe;
  type: "RESISTANCE" | "SUPPORT";
  kind: PoolKind;
  linePrice: number;
  wickHigh: number;
  wickLow: number;
  centreLine: number;
  birthCandleTime: number;
  birthCandleIndexOnPrimary: number;
  sweptCandleTime: number | null;
  sweptCandleIndexOnPrimary: number | null;
  sweepReason: SweepReason | null;
  deathCandleTime: number | null;
  deathCandleIndexOnPrimary: number | null;
  deathReason: DeathReason | null;
  status: PoolStatus;
  confluenceCount: number;
  strength: LevelStrength;
  // Spec §4 pull score — gravitational ranking of this pool against
  // current price. Null for non-active pools and when the primary TF
  // has no candles. Populated once after all pools are formed.
  pull: PoolPull | null;
}

export interface AnalysisState {
  symbol: string;
  primaryTimeframe: Timeframe;
  analysedTimeframes: Timeframe[];
  candles: Candle[]; // primary TF only
  levels: AnalysisLevel[];
  pools: AnalysisPool[];
  // Global pass output — non-per-level data the renderer consumes
  // directly. Populated by passes whose contribution is structural
  // (e.g. lastLeg's swing prices, which mark frame bounds independent
  // of any specific level).
  passInfo: PassInfo;
  // Two-arm braid output (spec §2.10). Top-pull active pool above and
  // below current price, gated by ARM_MINIMUM_PULL=15.0. Drives the
  // right-frame canvas. Both null when no qualifying pools exist.
  // Convenience field — equal to armsPerTimeframe[primaryTimeframe].
  arms: ExtractedArms;
  // Per-TF arms — each TF runs its own arm extraction against its own
  // candles + price + relevant pool subset (pools at or above the TF's
  // rank). Implements per-TF self-containment: each TF is its own
  // complete trading environment.
  armsPerTimeframe: Partial<Record<Timeframe, ExtractedArms>>;
  // Regime layer's per-playbook output for the trading module + the UI.
  // Null when wire-angle pass didn't run on the primary TF (insufficient
  // candles). See server/modules/zenny/analysis/regime/.
  regimeAssessment: RegimeAssessmentResult | null;
  // Per-bar regime snapshots for the primary TF. Convenience field —
  // equal to regimeHistoryPerTimeframe[primaryTimeframe].
  regimeHistory: BarRegimeSnapshot[];
  // Per-TF regime history — full playbook composite at every bar of
  // every analysed TF. Cached forever per (symbol, tf, candleOpenTime).
  // Lets any TF's chart render its own timeline strip without a refetch.
  regimeHistoryPerTimeframe: Partial<Record<Timeframe, BarRegimeSnapshot[]>>;
  // Per-TF feed health — candle freshness check. Each TF marks itself
  // healthy when the last candle is within ~2 expected bar durations of
  // the analysis time, degraded otherwise. Surfaced into the regime
  // assessment's feedHealth input and into the card's input rows.
  feedHealthPerTimeframe: Partial<
    Record<
      Timeframe,
      {
        status: "healthy" | "degraded" | "unknown";
        lastCandleAgeMs: number;
        expectedBarMs: number;
      }
    >
  >;
  // Decision module output — concrete TradePlan per TF where the
  // recommended playbook produces resolvable geometry. tradePlan is
  // the convenience alias for the primary TF's plan.
  tradePlan: TradePlan | null;
  tradePlanResult: TradePlanResult;
  depth: null; // out of brief; stays null until the user asks for it back
  orderFlow: null;
  computedAtMs: number;
}

// Re-export for client type sync.
export type { LastLegSwing };

// ---------------------------------------------------------------------------

export interface RunAnalysisInput {
  provider: MarketDataProvider;
  symbol: string;
  primaryTimeframe: Timeframe;
  candleCountPerTf?: number;
  timeframeStack?: Timeframe[];
  pivotN?: number; // bars on each side of swing (default 2 → 5-bar swing)
  passConfig?: PassConfig; // overrides DEFAULT_PASS_CONFIG
  // Optional recent liquidation events for the symbol — fetched by the
  // route layer from binance_liquidations and threaded in. Used by the
  // regime layer's liquidationProximity input. Absent → input unavailable.
  liquidations?: Array<{ price: number; usdValue: number }>;
}

export async function runAnalysis(
  input: RunAnalysisInput,
): Promise<AnalysisState> {
  const candleCount = input.candleCountPerTf ?? 200;
  const stack = input.timeframeStack ?? DEFAULT_TIMEFRAME_STACK;
  const pivotN = input.pivotN ?? 2;

  // 1. Fetch all timeframes in parallel. A failed fetch for one TF doesn't
  //    fail the whole analysis — that TF is just absent from the result.
  const fetchResults = await Promise.all(
    stack.map(async (tf) => {
      try {
        const candles = await getCandles(input.provider, {
          symbol: input.symbol,
          timeframe: tf,
          count: candleCount,
        });
        return { tf, candles };
      } catch {
        return { tf, candles: [] as Candle[] };
      }
    }),
  );

  const perTfCandles = new Map<Timeframe, Candle[]>();
  const analysedTfs: Timeframe[] = [];
  for (const { tf, candles } of fetchResults) {
    if (candles.length < pivotN * 2 + 1) continue;
    perTfCandles.set(tf, candles);
    analysedTfs.push(tf);
  }

  const primaryCandles =
    perTfCandles.get(input.primaryTimeframe) ?? [];

  if (primaryCandles.length === 0) {
    return {
      symbol: input.symbol,
      primaryTimeframe: input.primaryTimeframe,
      analysedTimeframes: analysedTfs,
      candles: [],
      levels: [],
      pools: [],
      passInfo: {},
      arms: { upper: null, lower: null, dominantSide: "neither" },
      armsPerTimeframe: {},
      regimeAssessment: null,
      regimeHistory: [],
      regimeHistoryPerTimeframe: {},
      feedHealthPerTimeframe: {},
      tradePlan: null,
      tradePlanResult: { primary: null, perTimeframe: {} },
      depth: null,
      orderFlow: null,
      computedAtMs: Date.now(),
    };
  }

  // 2. Per-TF detection: pivots → broken flag → strength → pool boundaries
  //    → aliveness. Each pivot becomes one level + one pool, mapped onto
  //    the primary TF's index space for rendering.
  const levels: AnalysisLevel[] = [];
  const pools: AnalysisPool[] = [];

  for (const tf of analysedTfs) {
    const candles = perTfCandles.get(tf)!;
    const pivots = findBodyPivots({ candles, n: pivotN });

    for (const pivot of pivots) {
      const breakResult = isLevelBroken(candles, pivot);
      const rawIndex = findClosestCandleIndex(
        primaryCandles,
        pivot.candleOpenTime,
      );
      // Clamp the index into the visible primary window. A pivot from a
      // lower TF can sit between two primary candles or beyond the last
      // one — render it at the nearest edge so the X coordinate is valid.
      const swingCandleIndexOnPrimary =
        rawIndex < 0
          ? -1
          : Math.min(rawIndex, primaryCandles.length - 1);
      const recency =
        swingCandleIndexOnPrimary < 0
          ? 0
          : Math.min(
              1,
              swingCandleIndexOnPrimary /
                Math.max(1, primaryCandles.length - 1),
            );

      const strength = levelStrength({
        sourceTimeframe: tf,
        recency,
        isPrimaryTimeframe: tf === input.primaryTimeframe,
      });

      const levelId = makeLevelId(input.symbol, tf, pivot);
      levels.push({
        id: levelId,
        price: pivot.price,
        wickPrice: pivot.wickPrice,
        side: pivot.side,
        sourceTimeframe: tf,
        swingCandleTime: pivot.candleOpenTime,
        swingCandleIndexOnPrimary,
        source: "swing",
        matchingTimeframes: [],
        confluenceCount: 0,
        clusterMemberIds: [],
        recency,
        strength,
        graduatedToPoolId: null,
        broken: breakResult.broken,
        passes: {},
      });

      // Pool — wick territory beside the line
    }

    // Body-cluster identification — additive, runs per TF alongside swing
    // pivots. Each cluster becomes a level with source="cluster" so the
    // chart and table can distinguish them. Clusters do not generate pools
    // (no single candle to define the wick zone).
    const liquidityCandidates = findLiquidityPools({
      symbol: input.symbol,
      timeframe: tf,
      candles,
      depletionCandles: primaryCandles,
    });

    for (const candidate of liquidityCandidates) {
      const rawIndex = findClosestCandleIndex(
        primaryCandles,
        candidate.sourceOpenTime,
      );
      const sourceIndexOnPrimary =
        rawIndex < 0 ? -1 : Math.min(rawIndex, primaryCandles.length - 1);
      const recency =
        sourceIndexOnPrimary < 0
          ? 0
          : Math.min(
              1,
              sourceIndexOnPrimary / Math.max(1, primaryCandles.length - 1),
            );
      const strength = levelStrength({
        sourceTimeframe: tf,
        recency,
        isPrimaryTimeframe: tf === input.primaryTimeframe,
      });
      pools.push({
        id: `pool-${candidate.kind}-${candidate.idSeed}`,
        symbol: input.symbol,
        sourceTimeframe: tf,
        type: candidate.side,
        kind: candidate.kind,
        linePrice: candidate.targetPrice,
        wickHigh: candidate.zoneHigh,
        wickLow: candidate.zoneLow,
        centreLine: (candidate.zoneHigh + candidate.zoneLow) / 2,
        birthCandleTime: candidate.sourceOpenTime,
        birthCandleIndexOnPrimary: sourceIndexOnPrimary,
        sweptCandleTime: null,
        sweptCandleIndexOnPrimary: null,
        sweepReason: null,
        deathCandleTime: null,
        deathCandleIndexOnPrimary: null,
        deathReason: null,
        status: "active",
        confluenceCount: candidate.touchCount,
        strength,
        pull: null,
      });
    }

    const closedCandles = candles.length > 1 ? candles.slice(0, -1) : candles;
    const clusters = findBodyClusters({
      candles: closedCandles,
      tolerancePct: clusterTolerancePct(tf),
    });
    for (const cluster of clusters) {
      const lastTouchPrimaryIdxRaw = findClosestCandleIndex(
        primaryCandles,
        cluster.lastTouchOpenTime,
      );
      const lastTouchPrimaryIdx =
        lastTouchPrimaryIdxRaw < 0
          ? -1
          : Math.min(lastTouchPrimaryIdxRaw, primaryCandles.length - 1);
      const firstTouchPrimaryIdxRaw = findClosestCandleIndex(
        primaryCandles,
        cluster.firstTouchOpenTime,
      );
      const firstTouchPrimaryIdx =
        firstTouchPrimaryIdxRaw < 0
          ? -1
          : Math.min(firstTouchPrimaryIdxRaw, primaryCandles.length - 1);

      // Brokenness for clusters: walk forward from the LAST touch on the
      // source TF. If any subsequent close moved past the cluster price,
      // it's broken. Reuses the same isLevelBroken contract by synthesising
      // a pivot-shaped object pointing at the last touch index.
      const synthPivot: BodyPivot = {
        index: cluster.lastTouchIndex,
        side: cluster.side,
        price: cluster.price,
        wickPrice: cluster.price,
        candleOpenTime: cluster.lastTouchOpenTime,
      };
      const breakResult = isLevelBroken(candles, synthPivot);

      // Recency from LAST touch — how recently the cluster was respected.
      // The render start (swingCandleIndexOnPrimary) uses firstTouch so the
      // line spans the whole respect history, but the relevance score
      // tracks whether it's still in play.
      const recencyClus =
        lastTouchPrimaryIdx < 0
          ? 0
          : Math.min(
              1,
              lastTouchPrimaryIdx /
                Math.max(1, primaryCandles.length - 1),
            );

      const strengthClus = levelStrength({
        sourceTimeframe: tf,
        recency: recencyClus,
        isPrimaryTimeframe: tf === input.primaryTimeframe,
      });

      const clusterId = `cluster-${input.symbol}-${tf}-${cluster.firstTouchIndex}-${Math.round(cluster.price)}`;
      levels.push({
        id: clusterId,
        price: cluster.price,
        wickPrice: cluster.price,
        side: cluster.side,
        sourceTimeframe: tf,
        swingCandleTime: cluster.firstTouchOpenTime,
        swingCandleIndexOnPrimary: firstTouchPrimaryIdx,
        source: "cluster",
        matchingTimeframes: [],
        confluenceCount: 0,
        clusterMemberIds: [],
        recency: recencyClus,
        strength: strengthClus,
        graduatedToPoolId: null,
        broken: breakResult.broken,
        passes: {},
      });
    }
  }

  // 3. Run pass chain. Each pass is independent, sees the original
  //    identified levels, writes its result under its own key. No pass
  //    consumes another's evidence. Disabled passes write nothing.
  const passConfig =
    input.passConfig ??
    getDefaultPassConfigForTimeframe(input.primaryTimeframe) ??
    DEFAULT_PASS_CONFIG;
  const passResult = runPasses(
    {
      levels,
      perTfCandles,
      primaryCandles,
      primaryTimeframe: input.primaryTimeframe,
    },
    passConfig,
  );

  // 4–7. Per-TF self-containment chain — for every analysed TF, run
  //      pull → arms → assessment → regime-history independently against
  //      that TF's own candles, price, and pool subset (pools at or
  //      above the TF's rank — sub-resolution pools from faster TFs are
  //      noise on slower charts). Each TF becomes its own complete
  //      trading environment.
  const wireAngle = passResult.passInfo.wireAngle;
  const armsPerTimeframe: Partial<Record<Timeframe, ExtractedArms>> = {};
  const enrichedPoolsPerTimeframe: Partial<Record<Timeframe, AnalysisPool[]>> = {};
  const regimeAssessmentPerTimeframe: Partial<
    Record<Timeframe, TfRegimeAssessment>
  > = {};
  const regimeHistoryPerTimeframe: Partial<
    Record<Timeframe, BarRegimeSnapshot[]>
  > = {};
  const feedHealthPerTimeframe: Partial<
    Record<
      Timeframe,
      {
        status: "healthy" | "degraded" | "unknown";
        lastCandleAgeMs: number;
        expectedBarMs: number;
      }
    >
  > = {};
  const nowMs = Date.now();

  for (const tf of analysedTfs) {
    const tfCandles = perTfCandles.get(tf);
    if (!tfCandles || tfCandles.length === 0) continue;
    const tfPrice = tfCandles[tfCandles.length - 1].close;
    if (tfPrice <= 0) continue;

    // Feed health for this TF — last candle within 2× expected bar
    // duration is "healthy"; older is "degraded". Captures both stale
    // feeds and gappy feeds (a missing candle pushes the last-seen
    // openTime further back than expected).
    const lastOpenTime = tfCandles[tfCandles.length - 1].openTime;
    const lastCandleAgeMs = Math.max(0, nowMs - lastOpenTime);
    const expectedBarMs = TF_BAR_DURATION_MS[tf];
    feedHealthPerTimeframe[tf] = {
      status: lastCandleAgeMs <= expectedBarMs * 2 ? "healthy" : "degraded",
      lastCandleAgeMs,
      expectedBarMs,
    };

    // Pools at or above this TF's rank. A 4H trader doesn't care about
    // 15m / 1H pools (sub-resolution); a Daily trader cares about D/W/M
    // only; etc.
    const tfRank = TF_RANK[tf];
    const relevantPools = pools.filter(
      (p) => (TF_RANK[p.sourceTimeframe] ?? 0) >= tfRank,
    );

    // Pull recomputed against THIS TF's candles + price.
    const tfPulls = runPullPass(
      { pools: relevantPools, primaryCandles: tfCandles },
      DEFAULT_PULL_PASS_CONFIG,
    );
    const tfEnrichedPools = relevantPools.map((p) => ({
      ...p,
      pull: tfPulls.get(p.id) ?? null,
    }));
    enrichedPoolsPerTimeframe[tf] = tfEnrichedPools;

    // Arms for this TF.
    const tfArms = extractArms({
      pools: tfEnrichedPools,
      currentPrice: tfPrice,
    });
    armsPerTimeframe[tf] = tfArms;

    // Regime assessment + history depend on the wire-angle pass running
    // on this TF (it must have enough candles for the lookback).
    if (wireAngle !== undefined && wireAngle.perTimeframe[tf]) {
      const tfAssessment = assembleRegimeAssessment({
        primaryTimeframe: tf,
        wireAngle,
        arms: tfArms,
        pools: tfEnrichedPools,
        levels: passResult.levels,
        currentPrice: tfPrice,
        totalCandles: tfCandles.length,
        feedHealth: feedHealthPerTimeframe[tf],
        liquidations: input.liquidations,
      });
      if (tfAssessment) {
        regimeAssessmentPerTimeframe[tf] = tfAssessment.primary;
      }

      // Per-bar history — cached per (symbol, tf, candleOpenTime, N) so
      // first analysis tick computes; subsequent ticks only compute new
      // bars on each TF.
      regimeHistoryPerTimeframe[tf] = computeRegimeHistory({
        symbol: input.symbol,
        primaryTimeframe: tf,
        primaryCandles: tfCandles,
        pools: tfEnrichedPools,
        levels: passResult.levels,
        wireAngle,
      });
    }
  }

  // 8. Decision module — once per TF where the regime layer recommends
  //    a playbook, build a concrete TradePlan (entry/stop/target/side/
  //    size/rationale). Pure derivation from regime assessment + arms +
  //    pools; no order placement happens here.
  const tradePlanResult: TradePlanResult =
    regimeAssessmentPerTimeframe[input.primaryTimeframe]
      ? assembleTradePlans({
          primaryTimeframe: input.primaryTimeframe,
          perTfCandles,
          armsPerTimeframe,
          enrichedPoolsPerTimeframe,
          regimeAssessment: {
            primary: regimeAssessmentPerTimeframe[input.primaryTimeframe]!,
            perTimeframe: regimeAssessmentPerTimeframe,
          },
        })
      : { primary: null, perTimeframe: {} };

  // Top-level convenience fields — alias the primary TF's per-TF entries
  // so existing consumers (right-frame canvas, current strip render) keep
  // working without indexing through the maps.
  const primaryArms = armsPerTimeframe[input.primaryTimeframe] ?? {
    upper: null,
    lower: null,
    dominantSide: "neither",
  };
  const primaryEnrichedPools =
    enrichedPoolsPerTimeframe[input.primaryTimeframe] ??
    pools.map((p) => ({ ...p, pull: null }));
  const primaryRegimeHistory =
    regimeHistoryPerTimeframe[input.primaryTimeframe] ?? [];
  const regimeAssessment: RegimeAssessmentResult | null =
    regimeAssessmentPerTimeframe[input.primaryTimeframe]
      ? {
          primary: regimeAssessmentPerTimeframe[input.primaryTimeframe]!,
          perTimeframe: regimeAssessmentPerTimeframe,
        }
      : null;

  return {
    symbol: input.symbol,
    primaryTimeframe: input.primaryTimeframe,
    analysedTimeframes: analysedTfs,
    candles: primaryCandles,
    levels: passResult.levels,
    pools: primaryEnrichedPools,
    passInfo: passResult.passInfo,
    arms: primaryArms,
    armsPerTimeframe,
    regimeAssessment,
    regimeHistory: primaryRegimeHistory,
    regimeHistoryPerTimeframe,
    feedHealthPerTimeframe,
    tradePlan: tradePlanResult.primary,
    tradePlanResult,
    depth: null,
    orderFlow: null,
    computedAtMs: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Helpers

function makeLevelId(symbol: string, tf: Timeframe, pivot: BodyPivot): string {
  return `lvl-${symbol}-${tf}-${pivot.index}-${Math.round(pivot.price)}`;
}

function clusterTolerancePct(tf: Timeframe): number {
  switch (tf) {
    case "15m":
      return 0.0015;
    case "1H":
      return 0.002;
    case "4H":
      return 0.0028;
    case "12H":
      return 0.0035;
    case "D":
      return 0.0045;
    case "W":
      return 0.007;
    case "M":
      return 0.01;
    default:
      return 0.0025;
  }
}

// Map a candle openTime into the primary TF's index space so the renderer
// has a clean X coordinate. Returns -1 if the time predates the visible
// window (renderer clips to left edge).
function findClosestCandleIndex(
  candles: Candle[],
  openTime: number,
): number {
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
