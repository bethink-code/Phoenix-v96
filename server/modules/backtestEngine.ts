// PRD §11.4 — the backtest engine must be a clean, isolated, scriptable
// module. Callable with defined inputs and outputs. No UI dependencies.
// No live-exchange dependencies. Used by the Backtest Sundays agent (Phase 3)
// and any ad-hoc operator backtest from the admin console.

import type { Regime } from "../../shared/schema";
import type { Candle } from "./strategy/types";
import { identifyLevels, detectLatestSweep, generateProposal } from "./strategy";
import { assessTrade } from "./riskManager";
import { getRegimeProfile } from "./regimeEngine";

export interface BacktestInput {
  candles: Candle[]; // chronological, oldest first
  regime: Regime;
  config: {
    riskPercentPerTrade: number;
    minRiskRewardRatio: number;
    minLevelRank: number;
    maxConcurrentPositions: number;
    dailyDrawdownLimitPct: number;
    weeklyDrawdownLimitPct: number;
  };
  startingCapital: number;
  warmupCandles?: number; // how many bars before starting to trade
}

export interface BacktestTrade {
  openedAt: number;
  closedAt: number;
  side: "long" | "short";
  setupMode: "mode_a" | "mode_b";
  entry: number;
  stop: number;
  target: number;
  size: number;
  realisedPnl: number;
  outcome: "target" | "stop" | "timeout";
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
  tradeLog: BacktestTrade[];
}

// Deterministic replay. Walks the candle array forward bar-by-bar. At each
// bar it runs the same pipeline the live bot runs (levels → sweep → proposal
// → risk manager), opens a virtual trade when approved, and resolves it on
// subsequent bars by checking whether stop or target was hit first.
export function runBacktest(input: BacktestInput): BacktestResult {
  const warmup = input.warmupCandles ?? 100;
  if (input.candles.length <= warmup) {
    return emptyResult();
  }

  let capital = input.startingCapital;
  let peakCapital = capital;
  let maxDrawdown = 0;

  const openTrades: OpenTrade[] = [];
  const closedTrades: BacktestTrade[] = [];

  for (let i = warmup; i < input.candles.length; i++) {
    const bar = input.candles[i];

    // ---- Resolve open trades against this bar ----
    for (let t = openTrades.length - 1; t >= 0; t--) {
      const ot = openTrades[t];
      const hit = resolveBar(ot, bar);
      if (hit) {
        const closed: BacktestTrade = {
          openedAt: ot.openedAt,
          closedAt: bar.openTime,
          side: ot.side,
          setupMode: ot.setupMode,
          entry: ot.entry,
          stop: ot.stop,
          target: ot.target,
          size: ot.size,
          realisedPnl: hit.pnl,
          outcome: hit.outcome,
        };
        closedTrades.push(closed);
        capital += hit.pnl;
        peakCapital = Math.max(peakCapital, capital);
        const dd = ((peakCapital - capital) / peakCapital) * 100;
        if (dd > maxDrawdown) maxDrawdown = dd;
        openTrades.splice(t, 1);
      }
    }

    // ---- Evaluate a new entry using bars up to and including this one ----
    const window = input.candles.slice(0, i + 1);
    const levels = identifyLevels(window);
    const sweep = detectLatestSweep(window, levels);
    const proposal = generateProposal(sweep, window, levels, input.regime);
    if (!proposal) continue;

    // Drawdown aggregates
    const { dailyPnlPct, weeklyPnlPct } = windowedPnl(closedTrades, bar.openTime, input.startingCapital);

    const decision = assessTrade({
      capital,
      riskPercentPerTrade: input.config.riskPercentPerTrade,
      entryPrice: proposal.entryPrice,
      stopPrice: proposal.stopPrice,
      targetPrice: proposal.targetPrice,
      regime: input.regime,
      minRiskRewardRatio: input.config.minRiskRewardRatio,
      openPositionCount: openTrades.length,
      maxConcurrentPositions: input.config.maxConcurrentPositions,
      dailyPnlPct,
      weeklyPnlPct,
      dailyDrawdownLimitPct: input.config.dailyDrawdownLimitPct,
      weeklyDrawdownLimitPct: input.config.weeklyDrawdownLimitPct,
      minLevelRank: getRegimeProfile(input.regime).entrySuppressed ? 99 : 1,
      candidateLevelRank: sweep!.level.rank,
      pairMinOrderSize: 0, // backtests assume any size is fillable
    });
    if (!decision.approved) continue;

    openTrades.push({
      openedAt: bar.openTime,
      side: proposal.side,
      setupMode: proposal.setupMode,
      entry: proposal.entryPrice,
      stop: proposal.stopPrice,
      target: proposal.targetPrice,
      size: decision.positionSize,
      riskAmount: decision.riskAmount,
    });
  }

  // Close any still-open trades at last close
  const last = input.candles[input.candles.length - 1];
  for (const ot of openTrades) {
    const pnl = pnlAt(ot, last.close);
    closedTrades.push({
      openedAt: ot.openedAt,
      closedAt: last.openTime,
      side: ot.side,
      setupMode: ot.setupMode,
      entry: ot.entry,
      stop: ot.stop,
      target: ot.target,
      size: ot.size,
      realisedPnl: pnl,
      outcome: "timeout",
    });
    capital += pnl;
  }

  return summarise(closedTrades, capital - input.startingCapital, maxDrawdown);
}

// ------------ helpers ------------

interface OpenTrade {
  openedAt: number;
  side: "long" | "short";
  setupMode: "mode_a" | "mode_b";
  entry: number;
  stop: number;
  target: number;
  size: number;
  riskAmount: number;
}

function resolveBar(ot: OpenTrade, bar: Candle): { pnl: number; outcome: "target" | "stop" } | null {
  if (ot.side === "long") {
    // Conservative: if both stop and target are touched in the same bar,
    // assume stop hit first (pessimistic).
    if (bar.low <= ot.stop) return { pnl: -ot.riskAmount, outcome: "stop" };
    if (bar.high >= ot.target) {
      const reward = (ot.target - ot.entry) * ot.size;
      return { pnl: reward, outcome: "target" };
    }
  } else {
    if (bar.high >= ot.stop) return { pnl: -ot.riskAmount, outcome: "stop" };
    if (bar.low <= ot.target) {
      const reward = (ot.entry - ot.target) * ot.size;
      return { pnl: reward, outcome: "target" };
    }
  }
  return null;
}

function pnlAt(ot: OpenTrade, price: number): number {
  return ot.side === "long"
    ? (price - ot.entry) * ot.size
    : (ot.entry - price) * ot.size;
}

function windowedPnl(
  closed: BacktestTrade[],
  nowMs: number,
  startingCapital: number
): { dailyPnlPct: number; weeklyPnlPct: number } {
  const day = nowMs - 24 * 60 * 60 * 1000;
  const week = nowMs - 7 * 24 * 60 * 60 * 1000;
  let d = 0,
    w = 0;
  for (const t of closed) {
    if (t.closedAt >= day) d += t.realisedPnl;
    if (t.closedAt >= week) w += t.realisedPnl;
  }
  return {
    dailyPnlPct: (d / startingCapital) * 100,
    weeklyPnlPct: (w / startingCapital) * 100,
  };
}

function summarise(
  trades: BacktestTrade[],
  netPnl: number,
  maxDrawdown: number
): BacktestResult {
  const wins = trades.filter((t) => t.realisedPnl > 0).length;
  const losses = trades.filter((t) => t.realisedPnl <= 0).length;
  const rrSum = trades.reduce((s, t) => {
    const risk = Math.abs(t.entry - t.stop);
    const reward = Math.abs(t.target - t.entry);
    return s + (risk > 0 ? reward / risk : 0);
  }, 0);

  // Sharpe: daily return std-dev normalised. Without per-day aggregation
  // this is a loose approximation — good enough for Phase 1 comparison.
  const returns = trades.map((t) => t.realisedPnl);
  const mean = returns.reduce((a, b) => a + b, 0) / (returns.length || 1);
  const variance =
    returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length || 1);
  const std = Math.sqrt(variance);
  const sharpe = std > 0 ? (mean / std) * Math.sqrt(365) : null;

  return {
    trades: trades.length,
    wins,
    losses,
    winRate: trades.length ? wins / trades.length : 0,
    netPnl,
    maxDrawdown,
    avgRR: trades.length ? rrSum / trades.length : 0,
    sharpe,
    tradeLog: trades,
  };
}

function emptyResult(): BacktestResult {
  return {
    trades: 0,
    wins: 0,
    losses: 0,
    winRate: 0,
    netPnl: 0,
    maxDrawdown: 0,
    avgRR: 0,
    sharpe: null,
    tradeLog: [],
  };
}
