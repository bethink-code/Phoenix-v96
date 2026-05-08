// Regime assessment — per-TF, per-playbook trading verdicts.
//
// The regime layer answers two distinct questions every tick:
//   Q1 — What pattern are we in?     → wire-angle bracket (the playbook router)
//   Q2 — Is this a trading environment?  → composite verdict per playbook
//
// Q2 is computed from a thorough input contract: every signal the deep
// research identified gets a first-class slot, even if it's not yet wired.
// Inputs not yet computed land as `{ available: false, reason: "..." }` —
// honest about the lookback boundary instead of fabricating a value.
//
// Each of the four playbooks weights inputs differently (a breakout cares
// about momentum + freshness; a ranging trade cares about wick rejection
// at extremes). The output is a per-playbook table the trading module
// consumes; the user-facing card shows the row for the active playbook
// and the constituent inputs that produced its verdict.

import type { Timeframe } from "../../../../../shared/zennyTypes";
import type {
  GannBracket,
  WireDirection,
} from "../passes/wireAnglePass";

// The four playbooks. NO_TRADE bracket maps to "no playbook applicable" —
// no entry in this Record, all four assessments will simply have
// `tradeable: false` with the bracket reason.
export type Playbook = "accumulation" | "ranging" | "trending" | "breakout";

export const PLAYBOOKS: Playbook[] = [
  "accumulation",
  "ranging",
  "trending",
  "breakout",
];

// One slot in the input contract. `available: false` means the signal
// isn't computed yet (e.g., tick processing not built) — the reason
// surfaces in the card so the operator sees what's missing.
export interface RegimeInput<T> {
  available: boolean;
  value?: T;
  reason?: string; // present when available=false
}

// === Available-today inputs ===

export interface AngleInputValue {
  angleDeg: number;
  bracket: GannBracket;
  direction: WireDirection;
}

export interface DwellInputValue {
  lockedBracket: GannBracket;
  candidateBracket: GannBracket;
  observedBars: number;
  requiredBars: number;
  locked: boolean; // observedBars >= requiredBars
  pendingFlip: boolean;
}

export interface BoundaryDistanceValue {
  // Degrees to the next bracket boundary (whichever direction is closer).
  // Small = right at a transition; large = deep inside the current bracket.
  degreesToNearest: number;
  // Normalised: degreesToNearest divided by the current bracket's width.
  // 0..1 — 0 means at the boundary, 1 means at the centre of the bracket.
  centerness: number;
}

export interface HtfAgreementValue {
  matchingDirectionCount: number;
  totalAnalysed: number;
  matchingDirectionRatio: number;
  htfConfirms: "yes" | "mixed" | "no";
  alignedTradePermittedCount: number;
}

export interface ArmPullValue {
  upperPull: number | null; // decayed pull score on the upper arm
  lowerPull: number | null;
  dominantSide: "upper" | "lower" | "neither";
  // True if at least one arm cleared the ARM_MINIMUM_PULL floor.
  hasUsableArm: boolean;
}

export interface PoolStrengthValue {
  // Active pools within ~5% of current price, ranked by strength.
  activeNearbyCount: number;
  // Sum of pool strengths weighted by decayed pull.
  weightedStrengthScore: number;
  // True if at least one nearby active pool is "strong" or above.
  hasStrongNearby: boolean;
}

export interface PolarityFlipsValue {
  // How many recent polarity flips have happened. High flip count =
  // chop / no clear regime. Useful as a negative signal for ranging.
  recentFlipCount: number;
}

export interface TouchQualityValue {
  // Average touch count across nearby active pools — proxy for level
  // robustness. High = well-respected level.
  averageTouchCount: number;
  // Count of nearby pools with very_strong / strong rating.
  strongPoolCount: number;
}

export interface RecencyValue {
  // Average recency across nearby active pools (0..1). Closer to 1 = fresh.
  averageRecency: number;
}

export interface FeedHealthValue {
  // Continuity of the candle feed (gaps detected) and liquidations stream
  // health. Coarse for now — future market-quality state replaces this.
  status: "healthy" | "degraded" | "unknown";
}

export interface LiquidationProximityValue {
  // Liquidation cluster proximity — nearest cluster distance in % from
  // current price. Small = price near a liquidation magnet.
  nearestDistancePct: number | null;
  // Total notional of liquidations within 1% of current price.
  withinOnePct: number;
}

// === Not-yet-wired inputs (the rest of the deep-research list) ===
// These are placeholder slots that land as `available: false` today.
// Wiring them in is purely additive — playbook weights already account
// for them, so when they go from "not-wired" to "wired" they just start
// contributing without touching the playbook logic.

export interface SpreadValue {
  bps: number; // bid-ask spread in basis points
  percentile: number; // 0..1 vs the rolling spread distribution
}

export interface DepthValue {
  coveragePct: number; // 0..1 — fraction of book depth available
  asymmetryPct: number; // bid-ask depth imbalance
}

export interface OFIValue {
  cvd: number; // cumulative volume delta
  imbalanceRatio: number; // -1..1 — buy-vs-sell pressure
  divergence: boolean; // CVD vs price divergence flag
}

export interface VolumeDeltaValue {
  delta: number;
  ratio: number; // -1..1
}

export interface CancelPullRatioValue {
  cancelRate: number; // cancellations per second
  pullRatio: number; // pull-orders / total-orders
}

export interface RealizedVolatilityValue {
  pct: number; // realized vol as % over a rolling window
  percentile: number; // 0..1 vs longer-window distribution
}

export interface TickDensityValue {
  ticksPerSecond: number;
  cluster: boolean; // density Z-score > 2 (per spec §2.5)
}

export interface AbsorptionValue {
  absorbed: boolean;
  side: "bid" | "ask" | "neither";
  strength: number; // 0..1
}

// The full input contract. Every input has a slot whether it's wired or not.
// Adding a new input = adding a new slot here + an extractor + per-playbook
// weight updates (additive, no playbook logic refactor).
export interface RegimeInputs {
  angle: RegimeInput<AngleInputValue>;
  dwell: RegimeInput<DwellInputValue>;
  boundaryDistance: RegimeInput<BoundaryDistanceValue>;
  htfAgreement: RegimeInput<HtfAgreementValue>;
  armPull: RegimeInput<ArmPullValue>;
  poolStrength: RegimeInput<PoolStrengthValue>;
  polarityFlips: RegimeInput<PolarityFlipsValue>;
  touchQuality: RegimeInput<TouchQualityValue>;
  recency: RegimeInput<RecencyValue>;
  feedHealth: RegimeInput<FeedHealthValue>;
  liquidationProximity: RegimeInput<LiquidationProximityValue>;

  // Not-yet-wired
  spread: RegimeInput<SpreadValue>;
  depth: RegimeInput<DepthValue>;
  ofi: RegimeInput<OFIValue>;
  volumeDelta: RegimeInput<VolumeDeltaValue>;
  cancelPullRatio: RegimeInput<CancelPullRatioValue>;
  realizedVolatility: RegimeInput<RealizedVolatilityValue>;
  tickDensity: RegimeInput<TickDensityValue>;
  absorption: RegimeInput<AbsorptionValue>;
}

// One driver row — a specific input and its contribution to a playbook's
// strength. Drivers are ordered by absolute contribution so the card can
// surface "what's pushing this playbook up / down" at a glance.
export interface AssessmentDriver {
  input: keyof RegimeInputs;
  weight: number; // playbook-specific weight, 0..1
  signal: number; // input's signal in [-1..+1] (negative = pushes against)
  contribution: number; // weight * signal (the actual effect)
  available: boolean;
  // For unavailable inputs: the weight is held in reserve — confidence
  // drops because evidence is missing — but contribution is 0.
}

export interface PlaybookAssessment {
  playbook: Playbook;
  // Final verdict — composite of all available inputs, gated by veto rules
  // (no playbook is tradeable if bracket is NO_TRADE, dwell isn't locked,
  // or a hard-fail input fires).
  tradeable: boolean;
  // 0..1 — how strong the case is. Independent of confidence.
  strength: number;
  // 0..1 — how complete the evidence is. Drops as more inputs are
  // unavailable. Trading module should treat low confidence as a flag
  // even if strength is high.
  confidence: number;
  // Human-readable justifications, in order: positive drivers first, then
  // veto reasons (if not tradeable), then "missing evidence" notes.
  reasons: string[];
  // Per-input contribution table — feeds the card's detail rows.
  drivers: AssessmentDriver[];
}

// Per-TF assessment. Today only computed for the primary TF; HTFs carry
// pattern info via wire-angle perTimeframe but no assessment.
export interface TfRegimeAssessment {
  timeframe: Timeframe;
  // The current pattern from the wire-angle bracket. Drives which
  // playbook the card highlights as "active" by default.
  pattern: GannBracket;
  // The four playbook verdicts.
  playbooks: Record<Playbook, PlaybookAssessment>;
  // Convenience pointer to the highest-strength `tradeable: true` playbook,
  // or null if no playbook is tradeable. The trading module can default to
  // this; the operator can override.
  recommended: { playbook: Playbook; strength: number } | null;
  // The full input snapshot — what every signal looked like at compute time.
  inputs: RegimeInputs;
}

// Top-level result — primary TF assessment plus a sparse map for HTFs
// (currently empty; reserved for future per-TF computation).
export interface RegimeAssessmentResult {
  primary: TfRegimeAssessment;
  // Sparse — present only for TFs that have full assessment data. Today
  // only primary is populated; structure exists so HTF assessments can
  // slot in without changing the shape.
  perTimeframe: Partial<Record<Timeframe, TfRegimeAssessment>>;
}
