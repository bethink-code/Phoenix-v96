// Client-side mirror of the AnalysisState shape returned from
// /api/zenny/braid-view-model. Kept in sync with
// server/modules/zenny/analysis/orchestrator.ts.

import type { Candle, Timeframe } from "@shared/zennyTypes";
import {
  DEFAULT_PASS_CONFIG as SHARED_DEFAULT_PASS_CONFIG,
  DEFAULT_PASS_CONFIG_BY_TIMEFRAME as SHARED_DEFAULT_PASS_CONFIG_BY_TIMEFRAME,
  getDefaultPassConfigForTimeframe as getSharedDefaultPassConfigForTimeframe,
} from "@shared/zennyBraidDefaults";

export type LevelStrengthClient =
  | "trivial"
  | "weak"
  | "medium"
  | "strong"
  | "very_strong";

export type PoolStatusClient = "active" | "swept" | "dead";
export type PoolKindClient =
  | "pivot_probe"
  | "equal_extremes"
  | "round_number"
  | "session_extreme";
export type DeathReasonClient = "close_past_line";
export type SweepReasonClient = "wick_took_pool_extreme";

export interface RecencyPassResultClient {
  value: number;
  wouldFilter: boolean;
}

export interface TouchCountPassResultClient {
  value: number;
}

export interface LastLegPassResultClient {
  value: number;
  nearestSwing: "high" | "low" | null;
  swingsConsidered: number;
}

export interface AggregatePassResultClient {
  score: number;
  contributors: string[];
}

export interface PolarityFlipPassResultClient {
  effectiveSide: "RESISTANCE" | "SUPPORT" | "DEAD";
  flipped: boolean;
  crossings: number;
}

export interface LevelPassesClient {
  recency?: RecencyPassResultClient;
  touchCount?: TouchCountPassResultClient;
  lastLeg?: LastLegPassResultClient;
  polarityFlip?: PolarityFlipPassResultClient;
  aggregate?: AggregatePassResultClient;
  // Open-ended — new passes register here, renderer keys on presence.
  [passName: string]: unknown;
}

export interface AnalysisLevelClient {
  id: string;
  price: number; // close of the swing candle (or cluster median)
  wickPrice: number;
  side: "RESISTANCE" | "SUPPORT";
  sourceTimeframe: Timeframe;
  swingCandleTime: number;
  swingCandleIndexOnPrimary: number;
  // Identification method that produced this level. "swing" = N-bar body
  // pivot. "cluster" = horizontal price cluster (multi-touch).
  source: "swing" | "cluster";
  matchingTimeframes: Timeframe[];
  confluenceCount: number;
  clusterMemberIds: string[];
  recency: number;
  strength: LevelStrengthClient;
  graduatedToPoolId: string | null; // legacy API field; pools are standalone
  // True if a subsequent candle close on the source TF has gone past this
  // level's price. Broken levels represent consumed liquidity and should
  // not render as tradeable.
  broken: boolean;
  // Pass results bag — populated only by enabled passes. Absence = pass
  // was disabled; the renderer treats absent as "no opinion."
  passes: LevelPassesClient;
}

// ---------------------------------------------------------------------------
// Pass config — mirrors server/modules/zenny/analysis/passes/types.ts.
// Kept in sync by hand; both sides serialise the same shape.

export interface RecencyPassConfigClient {
  enabled: boolean;
  curve: "linear" | "exponential";
  halfLifeCandles: number;
  threshold: number;
}

export interface TouchCountPassConfigClient {
  enabled: boolean;
  lookforwardCandles: number;
  tolerancePct: number;
}

export interface LastLegPassConfigClient {
  enabled: boolean;
  reversalPct: number;
  tolerancePct: number;
  lastN: number;
}

export interface PolarityFlipPassConfigClient {
  enabled: boolean;
}

export interface AggregatePassConfigClient {
  enabled: boolean;
  weightRecency: number;
  weightLastLeg: number;
  weightTouchCount: number;
  brokenPenalty: number;
  strengthThreshold: number;
}

export interface WireAnglePassConfigClient {
  enabled: boolean;
  lookbackCandles: number;
  dwellBarsRequired: number;
}

export interface PassConfigClient {
  recency: RecencyPassConfigClient;
  touchCount: TouchCountPassConfigClient;
  lastLeg: LastLegPassConfigClient;
  polarityFlip: PolarityFlipPassConfigClient;
  aggregate: AggregatePassConfigClient;
  wireAngle: WireAnglePassConfigClient;
}

export const DEFAULT_PASS_CONFIG_BY_TIMEFRAME_CLIENT: Record<
  Timeframe,
  PassConfigClient
> = SHARED_DEFAULT_PASS_CONFIG_BY_TIMEFRAME;

export const DEFAULT_PASS_CONFIG_CLIENT: PassConfigClient =
  SHARED_DEFAULT_PASS_CONFIG;

export function getDefaultPassConfigForTimeframeClient(
  timeframe: Timeframe,
): PassConfigClient {
  return getSharedDefaultPassConfigForTimeframe(timeframe);
}

// Mirror of PoolPull from server/modules/zenny/analysis/pool/pullPass.ts.
export interface PoolPullClient {
  raw: number;
  normalized: number;
  decayed: number;
  distancePct: number;
  candlesMovingAway: number;
  sEffectiveStandIn: number;
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
  sweptCandleTime: number | null;
  sweptCandleIndexOnPrimary: number | null;
  sweepReason: SweepReasonClient | null;
  deathCandleTime: number | null;
  deathCandleIndexOnPrimary: number | null;
  deathReason: DeathReasonClient | null;
  status: PoolStatusClient;
  confluenceCount: number;
  strength: LevelStrengthClient;
  pull: PoolPullClient | null;
}

// Mirror of ExtractedArms from server/modules/zenny/analysis/arms/extractArms.ts.
export type ArmRoleClient = "dominant" | "subordinate" | "equal";
export type ArmSideClient = "upper" | "lower";

export interface ArmClient {
  side: ArmSideClient;
  pool: AnalysisPoolClient;
  pullDecayed: number;
  role: ArmRoleClient;
}

export interface ExtractedArmsClient {
  upper: ArmClient | null;
  lower: ArmClient | null;
  dominantSide: ArmSideClient | "neither";
}

export interface DepthBucketClient {
  priceLow: number;
  priceHigh: number;
  bidSizeUsd: number;
  askSizeUsd: number;
  totalSizeUsd: number;
}

export interface DepthSnapshotClient {
  symbol: string;
  fetchedAtMs: number;
  midPrice: number;
  priceLow: number;
  priceHigh: number;
  buckets: DepthBucketClient[];
  maxBucketSizeUsd: number;
}

export interface LiqLevelClient {
  price: number;
  side: "long" | "short";
  tier: number;
}

export interface OrderFlowSnapshotClient {
  symbol: string;
  fetchedAtMs: number;
  oi: {
    value: number;
    valueUsd: number;
    change24hPct: number | null;
  } | null;
  funding: {
    rate: number;
    markPrice: number;
    annualizedPct: number;
  } | null;
  longShort: {
    ratio: number;
    longPct: number;
    shortPct: number;
  } | null;
  liqLevels: LiqLevelClient[];
}

// One ZigZag swing in primary-TF candle space.
export interface LastLegSwingClient {
  index: number;
  price: number;
  openTime: number;
  type: "high" | "low";
}

// Mirror of WireAnglePassInfo from the server's wireAnglePass.
export type GannBracketClient =
  | "NO_TRADE"
  | "ACCUMULATION"
  | "RANGING"
  | "TRENDING"
  | "BREAKOUT";

export type WireDirectionClient = "up" | "down" | "flat";

export interface WireAnglePassInfoClient {
  angleDeg: number;
  gannBracket: GannBracketClient;
  direction: WireDirectionClient;
  tradePermitted: boolean;
  lookback: number;
  smoothedClose: number;
  smoothedCloseNAgo: number;
  pctChange: number;
}

// Multi-TF agreement summary — mirrors WireAngleAgreement on the server.
// Derived from the per-TF angles. The decision module reads htfConfirms
// for conviction; the renderer reads ratio + counts for the regime column.
export interface WireAngleAgreementClient {
  matchingDirectionCount: number;
  totalAnalysed: number;
  matchingDirectionRatio: number;
  alignedTradePermittedCount: number;
  weakestAlignedBracket: GannBracketClient | null;
  htfConfirms: "yes" | "mixed" | "no";
}

// Per-bar regime classification — one entry per primary candle index that
// has enough lookback. Drives the regime overlay strip on the left frame.
export interface PerBarRegimeClient {
  candleIndex: number;
  angleDeg: number;
  bracket: GannBracketClient;
  direction: WireDirectionClient;
}

// Locked vs candidate state (primary TF only). The decision module gates
// on locked; UI shows candidate alongside so a pending flip is visible.
export interface WireAngleDwellClient {
  lockedBracket: GannBracketClient;
  lockedTradePermitted: boolean;
  candidateBracket: GannBracketClient;
  candidateBarsObserved: number;
  dwellBarsRequired: number;
  pendingFlip: boolean;
}

// Mirror of WireAnglePassResult on the server. Primary is the spec gate;
// perTimeframe is sparse (TFs with too few candles are absent); dwell +
// history are primary-TF only.
export interface WireAnglePassResultClient {
  primary: WireAnglePassInfoClient;
  primaryDwell: WireAngleDwellClient;
  primaryHistory: PerBarRegimeClient[];
  perTimeframe: Partial<Record<Timeframe, WireAnglePassInfoClient>>;
  agreement: WireAngleAgreementClient;
}

// Global pass output — non-per-level data the renderer consumes directly.
// Each pass that has structural (cross-level) output stashes it here.
export interface PassInfoClient {
  lastLeg?: {
    swings: LastLegSwingClient[];
  };
  wireAngle?: WireAnglePassResultClient;
}

export interface AnalysisStateClient {
  symbol: string;
  primaryTimeframe: Timeframe;
  analysedTimeframes: Timeframe[];
  candles: Candle[];
  levels: AnalysisLevelClient[];
  pools: AnalysisPoolClient[];
  passInfo: PassInfoClient;
  arms: ExtractedArmsClient;
  depth: DepthSnapshotClient | null;
  orderFlow: OrderFlowSnapshotClient | null;
  computedAtMs: number;
}
