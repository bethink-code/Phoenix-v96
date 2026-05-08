// Input extractors — convert AnalysisState into the regime input contract.
//
// Every input gets a function. Wired inputs return `{ available: true, value }`;
// inputs that need data we don't compute yet (tick processing, market quality,
// etc.) return `{ available: false, reason }`. The card surfaces both — the
// operator can see "what's evidence" and "what's missing" at the same time.
//
// Pure functions only. No side effects. Each takes a focused slice of state.

import type {
  AnalysisLevel,
  AnalysisPool,
} from "../orchestrator";
import type { ExtractedArms } from "../arms/extractArms";
import type { TfRegime } from "../passes/wireAnglePass";
import type { WireAngleAgreement } from "../passes/wireAnglePass";
import type {
  AbsorptionValue,
  AngleInputValue,
  ArmPullValue,
  BoundaryDistanceValue,
  CancelPullRatioValue,
  DepthValue,
  DwellInputValue,
  FeedHealthValue,
  HtfAgreementValue,
  LiquidationProximityValue,
  OFIValue,
  PolarityFlipsValue,
  PoolStrengthValue,
  RealizedVolatilityValue,
  RecencyValue,
  RegimeInput,
  SpreadValue,
  TickDensityValue,
  TouchQualityValue,
  VolumeDeltaValue,
} from "./types";

// Spec-fixed bracket boundaries (matches wireAnglePass). Re-declared here
// as public constants because the boundary-distance extractor needs them.
export const BRACKET_BOUNDARIES = [14, 26.25, 45, 63.75] as const;

// Active-pool proximity window. Pools more than this fraction away from
// current price don't contribute to pool-based extractors — they're
// structural background, not actionable.
const POOL_PROXIMITY_PCT = 0.05; // 5% of price

// === Available-today extractors ============================================

export function extractAngle(tfRegime: TfRegime): RegimeInput<AngleInputValue> {
  return {
    available: true,
    value: {
      angleDeg: tfRegime.info.angleDeg,
      bracket: tfRegime.info.gannBracket,
      direction: tfRegime.info.direction,
    },
  };
}

export function extractDwell(tfRegime: TfRegime): RegimeInput<DwellInputValue> {
  return {
    available: true,
    value: {
      lockedBracket: tfRegime.dwell.lockedBracket,
      candidateBracket: tfRegime.dwell.candidateBracket,
      observedBars: tfRegime.dwell.candidateBarsObserved,
      requiredBars: tfRegime.dwell.dwellBarsRequired,
      locked:
        tfRegime.dwell.candidateBarsObserved >= tfRegime.dwell.dwellBarsRequired,
      pendingFlip: tfRegime.dwell.pendingFlip,
    },
  };
}

export function extractBoundaryDistance(
  tfRegime: TfRegime,
): RegimeInput<BoundaryDistanceValue> {
  const absAngle = Math.abs(tfRegime.info.angleDeg);
  // Boundaries: 0, 14, 26.25, 45, 63.75, 90 — current bracket lives between
  // two adjacent boundaries. Find the closer one.
  const allBoundaries = [0, ...BRACKET_BOUNDARIES, 90];
  let lower = 0;
  let upper = 90;
  for (let i = 0; i < allBoundaries.length - 1; i++) {
    if (absAngle >= allBoundaries[i] && absAngle < allBoundaries[i + 1]) {
      lower = allBoundaries[i];
      upper = allBoundaries[i + 1];
      break;
    }
  }
  const distLower = absAngle - lower;
  const distUpper = upper - absAngle;
  const degreesToNearest = Math.min(distLower, distUpper);
  const bracketWidth = upper - lower;
  // centerness: 1.0 at exact bracket centre, 0.0 at either boundary.
  const centerness =
    bracketWidth === 0
      ? 0
      : 1 - Math.abs(absAngle - (lower + upper) / 2) / (bracketWidth / 2);
  return {
    available: true,
    value: {
      degreesToNearest,
      centerness: Math.max(0, Math.min(1, centerness)),
    },
  };
}

export function extractHtfAgreement(
  agreement: WireAngleAgreement,
): RegimeInput<HtfAgreementValue> {
  return {
    available: true,
    value: {
      matchingDirectionCount: agreement.matchingDirectionCount,
      totalAnalysed: agreement.totalAnalysed,
      matchingDirectionRatio: agreement.matchingDirectionRatio,
      htfConfirms: agreement.htfConfirms,
      alignedTradePermittedCount: agreement.alignedTradePermittedCount,
    },
  };
}

export function extractArmPull(
  arms: ExtractedArms,
): RegimeInput<ArmPullValue> {
  const upperPull = arms.upper?.pullDecayed ?? null;
  const lowerPull = arms.lower?.pullDecayed ?? null;
  const hasUsableArm = arms.upper !== null || arms.lower !== null;
  return {
    available: true,
    value: {
      upperPull,
      lowerPull,
      dominantSide: arms.dominantSide,
      hasUsableArm,
    },
  };
}

export function extractPoolStrength(
  pools: AnalysisPool[],
  currentPrice: number,
): RegimeInput<PoolStrengthValue> {
  const proximityFloor = currentPrice * (1 - POOL_PROXIMITY_PCT);
  const proximityCeil = currentPrice * (1 + POOL_PROXIMITY_PCT);
  const nearby = pools.filter(
    (p) =>
      p.status === "active" &&
      p.linePrice >= proximityFloor &&
      p.linePrice <= proximityCeil,
  );
  let weightedScore = 0;
  let strongCount = 0;
  for (const p of nearby) {
    const strengthScore = strengthToNumber(p.strength);
    const pullDecayed = p.pull?.decayed ?? 0;
    weightedScore += strengthScore * (1 + pullDecayed);
    if (p.strength === "strong" || p.strength === "very_strong") {
      strongCount += 1;
    }
  }
  return {
    available: true,
    value: {
      activeNearbyCount: nearby.length,
      weightedStrengthScore: weightedScore,
      hasStrongNearby: strongCount > 0,
    },
  };
}

export function extractPolarityFlips(
  levels: AnalysisLevel[],
): RegimeInput<PolarityFlipsValue> {
  let count = 0;
  for (const lvl of levels) {
    const pf = (lvl.passes as Record<string, unknown>).polarityFlip as
      | { flipped?: boolean }
      | undefined;
    if (pf?.flipped) count += 1;
  }
  return {
    available: true,
    value: { recentFlipCount: count },
  };
}

export function extractTouchQuality(
  pools: AnalysisPool[],
  currentPrice: number,
): RegimeInput<TouchQualityValue> {
  const proximityFloor = currentPrice * (1 - POOL_PROXIMITY_PCT);
  const proximityCeil = currentPrice * (1 + POOL_PROXIMITY_PCT);
  const nearby = pools.filter(
    (p) =>
      p.status === "active" &&
      p.linePrice >= proximityFloor &&
      p.linePrice <= proximityCeil,
  );
  if (nearby.length === 0) {
    return {
      available: true,
      value: { averageTouchCount: 0, strongPoolCount: 0 },
    };
  }
  const avgTouch =
    nearby.reduce((sum, p) => sum + p.confluenceCount, 0) / nearby.length;
  const strongCount = nearby.filter(
    (p) => p.strength === "strong" || p.strength === "very_strong",
  ).length;
  return {
    available: true,
    value: { averageTouchCount: avgTouch, strongPoolCount: strongCount },
  };
}

export function extractRecency(
  pools: AnalysisPool[],
  currentPrice: number,
  totalCandles: number,
): RegimeInput<RecencyValue> {
  if (totalCandles <= 1) {
    return { available: true, value: { averageRecency: 0 } };
  }
  const proximityFloor = currentPrice * (1 - POOL_PROXIMITY_PCT);
  const proximityCeil = currentPrice * (1 + POOL_PROXIMITY_PCT);
  const nearby = pools.filter(
    (p) =>
      p.status === "active" &&
      p.linePrice >= proximityFloor &&
      p.linePrice <= proximityCeil,
  );
  if (nearby.length === 0) {
    return { available: true, value: { averageRecency: 0 } };
  }
  const recencies = nearby.map((p) =>
    p.birthCandleIndexOnPrimary < 0
      ? 0
      : Math.min(1, p.birthCandleIndexOnPrimary / (totalCandles - 1)),
  );
  return {
    available: true,
    value: {
      averageRecency: recencies.reduce((a, b) => a + b, 0) / recencies.length,
    },
  };
}

// === Inputs that need data we don't have yet ===============================
// These return placeholders — the card surfaces them as "needs X" so the
// operator can see what evidence is missing without the regime pretending
// to know.

export function extractFeedHealth(): RegimeInput<FeedHealthValue> {
  // Today: continuity scheduler runs but its state isn't surfaced into
  // AnalysisState. Until that wiring lands, mark unknown — neither healthy
  // nor degraded, just not visible.
  return {
    available: false,
    reason: "feed health not surfaced into AnalysisState yet",
  };
}

export function extractLiquidationProximity(): RegimeInput<LiquidationProximityValue> {
  // orderFlow is hard-null in the current orchestrator output. When the
  // OrderFlowColumn data feeds back in, this will compute proximity from
  // orderFlow.liqLevels.
  return {
    available: false,
    reason: "orderFlow not in AnalysisState (Coinglass / Hyblock liq feed)",
  };
}

// All inputs below need tick processing — the spec §2.3 pipeline that
// hasn't been built yet. Each lands as a clearly-named placeholder.

export function extractSpread(): RegimeInput<SpreadValue> {
  return { available: false, reason: "tick processing not built (§2.3)" };
}
export function extractDepth(): RegimeInput<DepthValue> {
  return {
    available: false,
    reason: "L2 depth not subscribed (NO DEPTH per UI)",
  };
}
export function extractOFI(): RegimeInput<OFIValue> {
  return { available: false, reason: "tick processing not built (§2.3)" };
}
export function extractVolumeDelta(): RegimeInput<VolumeDeltaValue> {
  return { available: false, reason: "tick processing not built (§2.3)" };
}
export function extractCancelPullRatio(): RegimeInput<CancelPullRatioValue> {
  return {
    available: false,
    reason: "tick processing + L2 depth not built",
  };
}
export function extractRealizedVolatility(): RegimeInput<RealizedVolatilityValue> {
  return {
    available: false,
    reason: "realized-vol estimator not built",
  };
}
export function extractTickDensity(): RegimeInput<TickDensityValue> {
  return { available: false, reason: "tick processing not built (§2.3)" };
}
export function extractAbsorption(): RegimeInput<AbsorptionValue> {
  return { available: false, reason: "tick processing not built (§2.3)" };
}

// === Helpers ===============================================================

function strengthToNumber(s: AnalysisPool["strength"]): number {
  switch (s) {
    case "very_strong":
      return 4;
    case "strong":
      return 3;
    case "medium":
      return 2;
    case "weak":
      return 1;
    case "trivial":
    default:
      return 0;
  }
}
