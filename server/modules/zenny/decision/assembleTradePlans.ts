// assembleTradePlans — top-level entry that runs once per analysed TF and
// produces TradePlans for every playbook family that resolves geometry.
//
// V2 (2026-05-14) the proposers can still emit multiple candidate geometries
// for the same TF, but the assembler now chooses a single winner per TF.
// That keeps the paper runner and the ORDERS view focused on the most
// actionable idea instead of carrying contradictory intents at once.
//
// Per the per-TF self-containment model, each TF stands alone: its own
// regime assessment, its own arms + pools, its own trade plans.
//
// Pure function. No DB. No order placement. The execution module
// consumes these plans and turns them into orders.

import type { Candle, Timeframe } from "../../../../shared/zennyTypes";
import type { ExtractedArms } from "../analysis/arms/extractArms";
import type { AnalysisPool } from "../analysis/orchestrator";
import type {
  RegimeAssessmentResult,
  TfRegimeAssessment,
} from "../analysis/regime/types";
import { proposeReachTrade } from "./reach/proposeReachTrade";
import type { ReachTradeConfig } from "./reach/types";
import { selectTradePlansForTimeframe } from "./selectTradePlans";
import type { TradePlan, TradePlanResult } from "./types";
import { proposeWickTrade } from "./wick/proposeWickTrade";
import type { WickTradeConfig } from "./wick/types";

export interface AssembleTradePlansInput {
  primaryTimeframe: Timeframe;
  perTfCandles: Map<Timeframe, Candle[]>;
  armsPerTimeframe: Partial<Record<Timeframe, ExtractedArms>>;
  enrichedPoolsPerTimeframe: Partial<Record<Timeframe, AnalysisPool[]>>;
  regimeAssessment: RegimeAssessmentResult | null;
  wickConfig?: WickTradeConfig;
  reachConfig?: ReachTradeConfig;
}

export function assembleTradePlans(
  input: AssembleTradePlansInput,
): TradePlanResult {
  const perTimeframe: Partial<Record<Timeframe, TradePlan>> = {};
  const plansPerTimeframe: Partial<Record<Timeframe, TradePlan[]>> = {};
  if (!input.regimeAssessment) {
    return { primary: null, perTimeframe, plansPerTimeframe };
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

    const tfPlans: TradePlan[] = [];

    // TAKE — sweep-fade (the wick module). Higher per-trade edge.
    const takePlan = proposeWickTrade({
      timeframe: tf,
      candles: tfCandles,
      currentPrice,
      arms: tfArms,
      pools: tfPools,
      assessment: tfAssessment,
      config: input.wickConfig,
    });
    if (takePlan !== null) tfPlans.push(takePlan);

    // REACH — pull-target (Phase 1). Fires more often than TAKE.
    const reachPlan = proposeReachTrade({
      timeframe: tf,
      candles: tfCandles,
      currentPrice,
      arms: tfArms,
      pools: tfPools,
      assessment: tfAssessment,
      config: input.reachConfig,
    });
    if (reachPlan !== null) tfPlans.push(reachPlan);

    const selectedPlans = selectTradePlansForTimeframe(tfPlans, currentPrice);
    if (selectedPlans.length > 0) {
      plansPerTimeframe[tf] = selectedPlans;
      perTimeframe[tf] = selectedPlans[0];
    }
  }

  return {
    primary: perTimeframe[input.primaryTimeframe] ?? null,
    perTimeframe,
    plansPerTimeframe,
  };
}
