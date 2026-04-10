import type { Regime } from "../../shared/schema";
import { getRegimeProfile } from "./regimeEngine";

// PRD §4.2 / §7 Risk Manager. Pure calculation functions — no DB, no I/O.
// These run BEFORE any order is placed. The risk layer has no override path
// (PRD Rule 1: risk management is immutable).

export interface RiskInputs {
  capital: number;
  riskPercentPerTrade: number; // e.g. 1.0 = 1%
  entryPrice: number;
  stopPrice: number;
  targetPrice: number;
  regime: Regime;
  minRiskRewardRatio: number;
  openPositionCount: number;
  maxConcurrentPositions: number;
  dailyPnlPct: number; // signed, % of capital
  weeklyPnlPct: number; // signed, % of capital
  dailyDrawdownLimitPct: number;
  weeklyDrawdownLimitPct: number;
  minLevelRank: number;
  candidateLevelRank: number;
}

export type RiskDecision =
  | { approved: true; positionSize: number; riskAmount: number; plannedRR: number }
  | { approved: false; reason: string; detail?: Record<string, unknown> };

export function assessTrade(i: RiskInputs): RiskDecision {
  // Regime gate
  const profile = getRegimeProfile(i.regime);
  if (profile.entrySuppressed) {
    return { approved: false, reason: "regime_suppresses_entries", detail: { regime: i.regime } };
  }

  // Drawdown gates — hard halt beyond limits
  if (i.dailyPnlPct <= -i.dailyDrawdownLimitPct) {
    return { approved: false, reason: "daily_drawdown_breached", detail: { dailyPnlPct: i.dailyPnlPct } };
  }
  if (i.weeklyPnlPct <= -i.weeklyDrawdownLimitPct) {
    return { approved: false, reason: "weekly_drawdown_breached", detail: { weeklyPnlPct: i.weeklyPnlPct } };
  }

  // Concurrency cap
  if (i.openPositionCount >= i.maxConcurrentPositions) {
    return { approved: false, reason: "max_concurrent_positions_reached" };
  }

  // Level rank gate
  if (i.candidateLevelRank < i.minLevelRank) {
    return { approved: false, reason: "level_rank_below_minimum" };
  }

  // R:R check — using the strictest of profile and tenant config
  const effectiveMinRR = Math.max(i.minRiskRewardRatio, profile.minRiskRewardRatio);
  const riskPerUnit = Math.abs(i.entryPrice - i.stopPrice);
  const rewardPerUnit = Math.abs(i.targetPrice - i.entryPrice);
  if (riskPerUnit <= 0) {
    return { approved: false, reason: "invalid_stop_distance" };
  }
  const plannedRR = rewardPerUnit / riskPerUnit;
  if (plannedRR < effectiveMinRR) {
    return {
      approved: false,
      reason: "rr_below_minimum",
      detail: { plannedRR, effectiveMinRR },
    };
  }

  // Position sizing — risk % of capital, scaled by regime size multiplier.
  // Size = (capital * risk% * regimeMultiplier) / riskPerUnit.
  const riskAmount =
    (i.capital * i.riskPercentPerTrade * profile.sizeMultiplier) / 100;
  if (riskAmount <= 0) {
    return { approved: false, reason: "regime_size_multiplier_zero" };
  }
  const positionSize = riskAmount / riskPerUnit;

  return { approved: true, positionSize, riskAmount, plannedRR };
}

// Aggregate performance helpers — used by risk checks and the dashboard.
// Kept here (not in storage) because they are pure reductions over trade rows
// and must be testable without a database.

export interface TradeForStats {
  realisedPnl: number | null;
  closedAt: Date | null;
  isPaper: boolean;
}

export function dailyPnl(trades: TradeForStats[], now = new Date()): number {
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  return sumPnlSince(trades, startOfDay);
}

export function weeklyPnl(trades: TradeForStats[], now = new Date()): number {
  const start = new Date(now);
  start.setDate(start.getDate() - 7);
  return sumPnlSince(trades, start);
}

function sumPnlSince(trades: TradeForStats[], since: Date): number {
  let sum = 0;
  for (const t of trades) {
    if (t.closedAt && t.closedAt >= since && t.realisedPnl != null) {
      sum += Number(t.realisedPnl);
    }
  }
  return sum;
}
