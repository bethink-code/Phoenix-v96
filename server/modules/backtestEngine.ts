// PRD §11.4 — the backtest engine must be a clean, isolated, scriptable
// module from Phase 0 so Backtest Sundays (Phase 3) can drive it
// programmatically. Callable with defined inputs and outputs. No UI
// dependencies. No live-exchange dependencies.

import type { Regime } from "../../shared/schema";

export interface BacktestInput {
  pair: string;
  fromDate: Date;
  toDate: Date;
  regime: Regime;
  config: {
    riskPercentPerTrade: number;
    minRiskRewardRatio: number;
    minLevelRank: number;
    maxConcurrentPositions: number;
  };
}

export interface BacktestResult {
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  netPnl: number;
  maxDrawdown: number;
  avgRR: number;
  sharpe: number | null;
}

// Phase 0 placeholder. Returns a zeroed result so the Backtest Sundays
// interface can be plumbed end-to-end without a full strategy simulator.
export async function runBacktest(_input: BacktestInput): Promise<BacktestResult> {
  return {
    trades: 0,
    wins: 0,
    losses: 0,
    winRate: 0,
    netPnl: 0,
    maxDrawdown: 0,
    avgRR: 0,
    sharpe: null,
  };
}
