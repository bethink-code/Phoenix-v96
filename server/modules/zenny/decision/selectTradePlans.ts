import type { TradePhase, TradePlan } from "./types";

const PHASE_PRIORITY: Record<TradePhase, number> = {
  take: 0,
  reach: 1,
};

// The engine may be able to describe multiple geometries on the same
// timeframe, but the paper runner should carry one active idea at a time.
// We therefore rank candidate plans by how actionable they are NOW:
//   1. fewer risk units between current price and entry wins
//   2. then smaller raw entry distance
//   3. then higher reward/risk
//   4. then larger size multiplier
//   5. then TAKE ahead of REACH as the later / higher-edge phase
export function selectTradePlansForTimeframe(
  plans: TradePlan[],
  currentPrice: number,
): TradePlan[] {
  if (plans.length <= 1) return plans;
  const [winner] = [...plans].sort((a, b) =>
    compareTradePlans(a, b, currentPrice),
  );
  return winner ? [winner] : [];
}

function compareTradePlans(
  a: TradePlan,
  b: TradePlan,
  currentPrice: number,
): number {
  const actionabilityDiff =
    entryTravelInRiskUnits(a, currentPrice) -
    entryTravelInRiskUnits(b, currentPrice);
  if (Math.abs(actionabilityDiff) > 1e-9) return actionabilityDiff;

  const rawEntryDistanceDiff =
    Math.abs(a.entry - currentPrice) - Math.abs(b.entry - currentPrice);
  if (Math.abs(rawEntryDistanceDiff) > 1e-9) return rawEntryDistanceDiff;

  const rrDiff = b.riskRewardRatio - a.riskRewardRatio;
  if (Math.abs(rrDiff) > 1e-9) return rrDiff;

  const sizeDiff = b.sizeMultiplier - a.sizeMultiplier;
  if (Math.abs(sizeDiff) > 1e-9) return sizeDiff;

  return PHASE_PRIORITY[a.phase] - PHASE_PRIORITY[b.phase];
}

function entryTravelInRiskUnits(plan: TradePlan, currentPrice: number): number {
  const riskAbs = Math.abs(plan.entry - plan.stop);
  if (riskAbs <= 0) return Number.POSITIVE_INFINITY;
  return Math.abs(plan.entry - currentPrice) / riskAbs;
}
