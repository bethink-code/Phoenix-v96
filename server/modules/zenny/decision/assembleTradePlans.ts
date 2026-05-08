// assembleTradePlans — top-level entry that runs once per analysed TF
// and produces a TradePlan when the regime layer has a recommended
// playbook for that TF.
//
// Per the per-TF self-containment model, each TF stands alone: its own
// regime assessment, its own arms + pools, its own trade plan. Cross-TF
// trades aren't a thing — each TF makes its own decision.
//
// Pure function. No DB. No order placement. The execution module
// consumes these plans (when built) and turns them into orders.

import type { Timeframe } from "../../../../shared/zennyTypes";
import type {
  AnalysisPool,
} from "../analysis/orchestrator";
import type { ExtractedArms } from "../analysis/arms/extractArms";
import type {
  Playbook,
  RegimeAssessmentResult,
  TfRegimeAssessment,
} from "../analysis/regime/types";
import type { Candle } from "../../../../shared/zennyTypes";
import {
  proposeAccumulationTrade,
  proposeBreakoutTrade,
  proposeRangingTrade,
  proposeTrendingTrade,
} from "./proposeTradePlan";
import type { TradePlan, TradePlanResult } from "./types";

export interface AssembleTradePlansInput {
  primaryTimeframe: Timeframe;
  // Per-TF candles + arms + pools. Only TFs present here get a trade
  // plan computed — TFs without these inputs are skipped.
  perTfCandles: Map<Timeframe, Candle[]>;
  armsPerTimeframe: Partial<Record<Timeframe, ExtractedArms>>;
  enrichedPoolsPerTimeframe: Partial<Record<Timeframe, AnalysisPool[]>>;
  regimeAssessment: RegimeAssessmentResult | null;
}

export function assembleTradePlans(
  input: AssembleTradePlansInput,
): TradePlanResult {
  const perTimeframe: Partial<Record<Timeframe, TradePlan>> = {};
  if (!input.regimeAssessment) {
    return { primary: null, perTimeframe };
  }

  for (const [tf, tfAssessment] of Object.entries(
    input.regimeAssessment.perTimeframe,
  ) as Array<[Timeframe, TfRegimeAssessment]>) {
    if (!tfAssessment.recommended) continue;

    const tfCandles = input.perTfCandles.get(tf);
    const tfArms = input.armsPerTimeframe[tf];
    const tfPools = input.enrichedPoolsPerTimeframe[tf];
    if (!tfCandles || !tfArms || !tfPools) continue;
    if (tfCandles.length === 0) continue;
    const currentPrice = tfCandles[tfCandles.length - 1].close;
    if (currentPrice <= 0) continue;

    const plan = proposeForPlaybook(tfAssessment.recommended.playbook, {
      timeframe: tf,
      candles: tfCandles,
      currentPrice,
      arms: tfArms,
      pools: tfPools,
      assessment: tfAssessment,
    });
    if (plan !== null) perTimeframe[tf] = plan;
  }

  return {
    primary: perTimeframe[input.primaryTimeframe] ?? null,
    perTimeframe,
  };
}

// Dispatch to the right proposer based on playbook name. Single switch
// keeps the assembler agnostic of per-playbook geometry.
function proposeForPlaybook(
  playbook: Playbook,
  ctx: Parameters<typeof proposeRangingTrade>[0],
): TradePlan | null {
  switch (playbook) {
    case "ranging":
      return proposeRangingTrade(ctx);
    case "trending":
      return proposeTrendingTrade(ctx);
    case "breakout":
      return proposeBreakoutTrade(ctx);
    case "accumulation":
      return proposeAccumulationTrade(ctx);
    default:
      // Exhaustiveness check — TS will yell if a new playbook lands
      // without a case here.
      return null;
  }
}
