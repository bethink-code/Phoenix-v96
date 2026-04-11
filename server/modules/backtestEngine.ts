// PRD §11.4 — the backtest engine must be a clean, isolated, scriptable
// module. Callable with defined inputs and outputs. No UI dependencies.
// No live-exchange dependencies. Used by the Backtest Sundays agent (Phase 3)
// and any ad-hoc operator backtest from the admin console.

import type { Regime } from "../../shared/schema";
import type { Candle } from "./strategy/types";
import { identifyLevels, detectLatestSweep, generateProposal } from "./strategy";
import {
  DEFAULT_LEVEL_CONFIG,
  type LevelConfig,
} from "./strategy/levels";
import {
  DEFAULT_SWEEP_CONFIG,
  type SweepConfig,
} from "./strategy/sweeps";
import {
  DEFAULT_PROPOSAL_CONFIG,
  type ProposalConfig,
} from "./strategy/entries";
import { assessTrade } from "./riskManager";

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
  // Strategy-internal configs. All optional; defaults preserve the live bot's
  // behaviour. Autoresearch's train.ts varies these to find good values.
  levelConfig?: LevelConfig;
  sweepConfig?: SweepConfig;
  proposalConfig?: ProposalConfig;
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
  // The liquidity level whose sweep triggered this entry. Preserved so
  // UI overlays can draw a connector from the trade marker back to the
  // pool that justified it.
  triggerPrice: number;
  triggerSide: "support" | "resistance";
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
  diagnostic: BacktestDiagnostic;
}

// Per-bar rejection accounting. Every evaluated bar lands in exactly one
// bucket: an opened trade, or a rejection reason. Sums to barsEvaluated.
export interface BacktestDiagnostic {
  barsEvaluated: number;
  entriesTaken: number;
  rejections: Record<string, number>;
  // Closest-miss trackers — "the bot almost traded, but..."
  bestLevelRankSeen: number; // highest candidate level rank across all bars with a sweep
  minLevelRankFloor: number; // the floor used during this run
  bestRRSeen: number; // highest R:R of any generated proposal
  minRRFloor: number;
  // Sample of recent rejections with context so the UI can show "last 5"
  recentRejections: Array<{
    atMs: number;
    reason: string;
    detail?: Record<string, unknown>;
  }>;
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

  const diag: BacktestDiagnostic = {
    barsEvaluated: 0,
    entriesTaken: 0,
    rejections: {},
    bestLevelRankSeen: 0,
    minLevelRankFloor: input.config.minLevelRank,
    bestRRSeen: 0,
    minRRFloor: input.config.minRiskRewardRatio,
    recentRejections: [],
  };
  const reject = (barTime: number, reason: string, detail?: Record<string, unknown>) => {
    diag.rejections[reason] = (diag.rejections[reason] ?? 0) + 1;
    if (diag.recentRejections.length < 20) {
      diag.recentRejections.push({ atMs: barTime, reason, detail });
    }
  };

  // Level identification is the most expensive call in the engine — six
  // O(n) passes plus O(n²) clustering. Recomputing per bar gave O(n³)
  // and timed out on serverless functions. We compute levels ONCE on the
  // full candle window and reuse for every bar.
  //
  // Trade-off: this introduces lookahead bias (bar i sees levels that
  // depend on bars > i). For all current experiment shapes (diagnostic,
  // param sweep, comparison) this is fine — every variant sees the same
  // level set, so comparisons are still valid, and the diagnostic question
  // "why isn't the bot trading right now?" is naturally answered against
  // the current level set anyway.
  const levelConfig = input.levelConfig ?? DEFAULT_LEVEL_CONFIG;
  const sweepConfig = input.sweepConfig ?? DEFAULT_SWEEP_CONFIG;
  const proposalConfig = input.proposalConfig ?? DEFAULT_PROPOSAL_CONFIG;
  const fullWindowLevels = identifyLevels(input.candles, levelConfig);

  for (let i = warmup; i < input.candles.length; i++) {
    const bar = input.candles[i];
    diag.barsEvaluated++;

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
          triggerPrice: ot.triggerPrice,
          triggerSide: ot.triggerSide,
        };
        closedTrades.push(closed);
        capital += hit.pnl;
        peakCapital = Math.max(peakCapital, capital);
        const dd = ((peakCapital - capital) / peakCapital) * 100;
        if (dd > maxDrawdown) maxDrawdown = dd;
        openTrades.splice(t, 1);
      }
    }

    // Reuse the precomputed level set, filtering to those that existed by
    // this bar's time so we don't sweep against a level a future swing
    // created. Cheap O(L) filter per bar.
    const levels = fullWindowLevels.filter((l) => l.firstSeenAt <= bar.openTime);
    if (levels.length === 0) {
      reject(bar.openTime, "no_levels");
      continue;
    }
    // Sweep detection still runs every bar against cached levels — it's
    // the cheap part of the pipeline and the time-sensitive one. It only
    // looks at the latest candle, so pass a 1-element array instead of
    // slicing the whole history.
    const sweep = detectLatestSweep([bar], levels, sweepConfig);
    if (!sweep) {
      reject(bar.openTime, "no_sweep", { levelCount: levels.length });
      continue;
    }
    // Track the best candidate rank any sweep produced — even if we reject
    // it, this tells the operator how close they got to the floor.
    if (sweep.level.rank > diag.bestLevelRankSeen) {
      diag.bestLevelRankSeen = sweep.level.rank;
    }

    const proposal = generateProposal(sweep, levels, input.regime, proposalConfig);
    if (!proposal) {
      reject(bar.openTime, "no_proposal", {
        levelType: sweep.level.type,
        sweepDirection: sweep.direction,
        closedBack: sweep.closedBack,
      });
      continue;
    }

    // Track best R:R seen on any generated proposal
    const proposalRisk = Math.abs(proposal.entryPrice - proposal.stopPrice);
    const proposalReward = Math.abs(proposal.targetPrice - proposal.entryPrice);
    const proposalRR = proposalRisk > 0 ? proposalReward / proposalRisk : 0;
    if (proposalRR > diag.bestRRSeen) diag.bestRRSeen = proposalRR;

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
      minLevelRank: input.config.minLevelRank,
      candidateLevelRank: sweep.level.rank,
      pairMinOrderSize: 0, // backtests assume any size is fillable
    });
    if (!decision.approved) {
      reject(bar.openTime, `risk_rejected:${decision.reason}`, decision.detail);
      continue;
    }

    diag.entriesTaken++;
    openTrades.push({
      openedAt: bar.openTime,
      side: proposal.side,
      setupMode: proposal.setupMode,
      entry: proposal.entryPrice,
      stop: proposal.stopPrice,
      target: proposal.targetPrice,
      size: decision.positionSize,
      riskAmount: decision.riskAmount,
      triggerPrice: sweep.level.price,
      triggerSide: sweep.level.side,
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
      triggerPrice: ot.triggerPrice,
      triggerSide: ot.triggerSide,
    });
    capital += pnl;
  }

  return summarise(closedTrades, capital - input.startingCapital, maxDrawdown, diag);
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
  triggerPrice: number;
  triggerSide: "support" | "resistance";
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
  maxDrawdown: number,
  diagnostic: BacktestDiagnostic
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
    diagnostic,
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
    diagnostic: {
      barsEvaluated: 0,
      entriesTaken: 0,
      rejections: {},
      bestLevelRankSeen: 0,
      minLevelRankFloor: 0,
      bestRRSeen: 0,
      minRRFloor: 0,
      recentRejections: [],
    },
  };
}
