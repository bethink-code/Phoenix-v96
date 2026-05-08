// assembleRegimeAssessment — top-level entry that composes the full
// regime layer output for the primary timeframe.
//
//   1. Extract every input from the analysis state (one slot per signal,
//      available or placeholder).
//   2. Run each of the four playbook assessments against the input snapshot.
//   3. Pick the recommended playbook = highest-strength tradeable verdict.
//   4. Return the bundle the trading module + UI consume.
//
// Pure function. No side effects. Today only the primary TF gets a full
// assessment; HTFs surface via wire-angle perTimeframe but don't compute
// playbook verdicts (they would need per-TF arms, market quality, etc.).

import type { Timeframe } from "../../../../../shared/zennyTypes";
import type {
  AnalysisLevel,
  AnalysisPool,
} from "../orchestrator";
import type { ExtractedArms } from "../arms/extractArms";
import type { WireAnglePassResult } from "../passes/wireAnglePass";
import type {
  Playbook,
  PlaybookAssessment,
  RegimeAssessmentResult,
  RegimeInputs,
  TfRegimeAssessment,
} from "./types";
import {
  extractAbsorption,
  extractAngle,
  extractArmPull,
  extractBoundaryDistance,
  extractCancelPullRatio,
  extractDepth,
  extractDwell,
  extractFeedHealth,
  extractHtfAgreement,
  extractLiquidationProximity,
  extractOFI,
  extractPolarityFlips,
  extractPoolStrength,
  extractRealizedVolatility,
  extractRecency,
  extractSpread,
  extractTickDensity,
  extractTouchQuality,
  extractVolumeDelta,
} from "./extractInputs";
import {
  assessAccumulation,
  assessBreakout,
  assessRanging,
  assessTrending,
} from "./assessPlaybooks";

export interface AssembleInput {
  primaryTimeframe: Timeframe;
  wireAngle: WireAnglePassResult;
  arms: ExtractedArms;
  pools: AnalysisPool[];
  levels: AnalysisLevel[];
  currentPrice: number;
  totalCandles: number;
}

export function assembleRegimeAssessment(
  input: AssembleInput,
): RegimeAssessmentResult | null {
  const primaryTfRegime = input.wireAngle.perTimeframe[input.primaryTimeframe];
  if (!primaryTfRegime) return null;

  const inputs = extractInputs(input, primaryTfRegime);

  const playbooks: Record<Playbook, PlaybookAssessment> = {
    accumulation: assessAccumulation(inputs),
    ranging: assessRanging(inputs),
    trending: assessTrending(inputs),
    breakout: assessBreakout(inputs),
  };

  const recommended = pickRecommended(playbooks);

  const primary: TfRegimeAssessment = {
    timeframe: input.primaryTimeframe,
    pattern: primaryTfRegime.info.gannBracket,
    playbooks,
    recommended,
    inputs,
  };

  return {
    primary,
    perTimeframe: { [input.primaryTimeframe]: primary },
  };
}

function extractInputs(
  ctx: AssembleInput,
  primaryTfRegime: NonNullable<
    WireAnglePassResult["perTimeframe"][Timeframe]
  >,
): RegimeInputs {
  return {
    angle: extractAngle(primaryTfRegime),
    dwell: extractDwell(primaryTfRegime),
    boundaryDistance: extractBoundaryDistance(primaryTfRegime),
    htfAgreement: extractHtfAgreement(ctx.wireAngle.agreement),
    armPull: extractArmPull(ctx.arms),
    poolStrength: extractPoolStrength(ctx.pools, ctx.currentPrice),
    polarityFlips: extractPolarityFlips(ctx.levels),
    touchQuality: extractTouchQuality(ctx.pools, ctx.currentPrice),
    recency: extractRecency(ctx.pools, ctx.currentPrice, ctx.totalCandles),
    feedHealth: extractFeedHealth(),
    liquidationProximity: extractLiquidationProximity(),

    // Not yet wired
    spread: extractSpread(),
    depth: extractDepth(),
    ofi: extractOFI(),
    volumeDelta: extractVolumeDelta(),
    cancelPullRatio: extractCancelPullRatio(),
    realizedVolatility: extractRealizedVolatility(),
    tickDensity: extractTickDensity(),
    absorption: extractAbsorption(),
  };
}

function pickRecommended(
  playbooks: Record<Playbook, PlaybookAssessment>,
): TfRegimeAssessment["recommended"] {
  let best: { playbook: Playbook; strength: number } | null = null;
  for (const [name, assessment] of Object.entries(playbooks) as Array<
    [Playbook, PlaybookAssessment]
  >) {
    if (!assessment.tradeable) continue;
    if (best === null || assessment.strength > best.strength) {
      best = { playbook: name, strength: assessment.strength };
    }
  }
  return best;
}
