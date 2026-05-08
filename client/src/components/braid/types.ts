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
  volNormalisationK: number;
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
  lookback: number;
  smoothedClose: number;
  smoothedCloseNAgo: number;
  pctChange: number;
  // Vol-normalisation transparency — see server's WireAnglePassInfo.
  realizedVolPct: number;
  expectedWindowMovePct: number;
  zScore: number;
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

// Locked vs candidate state (per-TF). Tradeability is a downstream
// composite (see RegimeAssessmentResultClient); this just tracks pattern
// stability — has the candidate held long enough to call it locked?
export interface WireAngleDwellClient {
  lockedBracket: GannBracketClient;
  candidateBracket: GannBracketClient;
  candidateBarsObserved: number;
  dwellBarsRequired: number;
  pendingFlip: boolean;
}

// Per-TF regime state — info + dwell + history per analysed timeframe.
// Each TF carries its own gate (decision module gates per-TF, not just
// primary). Mirrors TfRegime on the server.
export interface TfRegimeClient {
  info: WireAnglePassInfoClient;
  dwell: WireAngleDwellClient;
  history: PerBarRegimeClient[];
}

// Mirror of WireAnglePassResult on the server. perTimeframe is sparse
// (TFs without enough candles for the lookback window are absent). The
// caller indexes by primaryTimeframe for the chart-level primary regime.
export interface WireAnglePassResultClient {
  perTimeframe: Partial<Record<Timeframe, TfRegimeClient>>;
  agreement: WireAngleAgreementClient;
}

// === Regime assessment (mirrors server/modules/zenny/analysis/regime/types) ==
// The regime layer's per-playbook output. The card renders this; the
// trading module consumes it. Each playbook gets a verdict (tradeable
// + strength + confidence + reasons + driver breakdown).

export type PlaybookClient =
  | "accumulation"
  | "ranging"
  | "trending"
  | "breakout";

export interface RegimeInputClient<T> {
  available: boolean;
  value?: T;
  reason?: string;
}

// Available-today input value shapes — mirror server types loosely.
export type RegimeInputAngleValue = {
  angleDeg: number;
  bracket: GannBracketClient;
  direction: WireDirectionClient;
};
export type RegimeInputDwellValue = {
  lockedBracket: GannBracketClient;
  candidateBracket: GannBracketClient;
  observedBars: number;
  requiredBars: number;
  locked: boolean;
  pendingFlip: boolean;
};
export type RegimeInputBoundaryDistanceValue = {
  degreesToNearest: number;
  centerness: number;
};
export type RegimeInputHtfAgreementValue = {
  matchingDirectionCount: number;
  totalAnalysed: number;
  matchingDirectionRatio: number;
  htfConfirms: "yes" | "mixed" | "no";
  alignedTradePermittedCount: number;
};
export type RegimeInputArmPullValue = {
  upperPull: number | null;
  lowerPull: number | null;
  dominantSide: "upper" | "lower" | "neither";
  hasUsableArm: boolean;
};
export type RegimeInputPoolStrengthValue = {
  activeNearbyCount: number;
  weightedStrengthScore: number;
  hasStrongNearby: boolean;
};
export type RegimeInputPolarityFlipsValue = { recentFlipCount: number };
export type RegimeInputTouchQualityValue = {
  averageTouchCount: number;
  strongPoolCount: number;
};
export type RegimeInputRecencyValue = { averageRecency: number };
export type RegimeInputFeedHealthValue = {
  status: "healthy" | "degraded" | "unknown";
};
export type RegimeInputLiquidationProximityValue = {
  nearestDistancePct: number | null;
  withinOnePct: number;
};

// Not-yet-wired input value shapes — kept as never since the slot is
// always { available: false } on the wire, but typed so the card can
// render placeholder rows with the same generic component.
export type RegimeInputUnwiredValue = unknown;

// The full input contract — every signal that contributes to a playbook
// assessment, available or placeholder.
export interface RegimeInputsClient {
  angle: RegimeInputClient<RegimeInputAngleValue>;
  dwell: RegimeInputClient<RegimeInputDwellValue>;
  boundaryDistance: RegimeInputClient<RegimeInputBoundaryDistanceValue>;
  htfAgreement: RegimeInputClient<RegimeInputHtfAgreementValue>;
  armPull: RegimeInputClient<RegimeInputArmPullValue>;
  poolStrength: RegimeInputClient<RegimeInputPoolStrengthValue>;
  polarityFlips: RegimeInputClient<RegimeInputPolarityFlipsValue>;
  touchQuality: RegimeInputClient<RegimeInputTouchQualityValue>;
  recency: RegimeInputClient<RegimeInputRecencyValue>;
  feedHealth: RegimeInputClient<RegimeInputFeedHealthValue>;
  liquidationProximity: RegimeInputClient<RegimeInputLiquidationProximityValue>;
  spread: RegimeInputClient<RegimeInputUnwiredValue>;
  depth: RegimeInputClient<RegimeInputUnwiredValue>;
  ofi: RegimeInputClient<RegimeInputUnwiredValue>;
  volumeDelta: RegimeInputClient<RegimeInputUnwiredValue>;
  cancelPullRatio: RegimeInputClient<RegimeInputUnwiredValue>;
  realizedVolatility: RegimeInputClient<RegimeInputUnwiredValue>;
  tickDensity: RegimeInputClient<RegimeInputUnwiredValue>;
  absorption: RegimeInputClient<RegimeInputUnwiredValue>;
}

export interface AssessmentDriverClient {
  input: keyof RegimeInputsClient;
  weight: number;
  signal: number;
  contribution: number;
  available: boolean;
}

export interface PlaybookAssessmentClient {
  playbook: PlaybookClient;
  tradeable: boolean;
  strength: number;
  confidence: number;
  reasons: string[];
  drivers: AssessmentDriverClient[];
}

export interface TfRegimeAssessmentClient {
  timeframe: Timeframe;
  pattern: GannBracketClient;
  playbooks: Record<PlaybookClient, PlaybookAssessmentClient>;
  recommended: { playbook: PlaybookClient; strength: number } | null;
  inputs: RegimeInputsClient;
}

export interface RegimeAssessmentResultClient {
  primary: TfRegimeAssessmentClient;
  perTimeframe: Partial<Record<Timeframe, TfRegimeAssessmentClient>>;
}

// One row per primary candle that has wire-angle data. Drives the
// timeline strip — recommended-playbook colour at each bar.
export interface BarRegimeSnapshotClient {
  candleIndex: number;
  candleOpenTime: number;
  bracket: GannBracketClient;
  recommended: { playbook: PlaybookClient; strength: number } | null;
  playbookStrengths: Record<PlaybookClient, number>;
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
  regimeAssessment: RegimeAssessmentResultClient | null;
  regimeHistory: BarRegimeSnapshotClient[];
  depth: DepthSnapshotClient | null;
  orderFlow: OrderFlowSnapshotClient | null;
  computedAtMs: number;
}
