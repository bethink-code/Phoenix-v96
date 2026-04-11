// Experiment template runners. One function per template kind. Each takes
// the experiment's config + the candles + the tenant's current live params,
// runs whatever it needs through `runBacktest`, and returns:
//   - a `metrics` blob (raw run output for storage)
//   - a `Recommendation` (structured operator-facing output)
//
// Runners are pure-ish — they call no DB and no exchange. Candle fetching
// and persistence happen in routes.ts. Keeping runners pure means they're
// trivially testable and a future Phase 3 agent can call them in a tight
// loop without touching infrastructure.

import { runBacktest, type BacktestResult } from "../backtestEngine";
import type { Candle } from "../strategy/types";
import type { Regime } from "../../../shared/schema";
import type {
  DiagnosticConfig,
  ParamSweepConfig,
  ComparisonConfig,
  Recommendation,
  ScoredVariant,
} from "../../../shared/experiments";

// The current live params we feed to the engine. Sourced from tenant_configs.
export interface LiveParams {
  riskPercentPerTrade: number;
  minRiskRewardRatio: number;
  minLevelRank: number;
  maxConcurrentPositions: number;
  dailyDrawdownLimitPct: number;
  weeklyDrawdownLimitPct: number;
  startingCapital: number;
}

// One scalar score, higher is better. The current operator-chosen objective.
//
// Strawman: Sharpe normalised, but penalised when the variant produces too
// few trades (overfit-prone) and rewarded for win rate. Crucially this is
// the SINGLE place to change the objective, so when the operator decides
// they care more about drawdown than Sharpe, this is the one-line edit.
export function scoreBacktest(r: BacktestResult): number {
  if (r.trades < 3) return 0; // not enough data — refuse to score
  const sharpe = r.sharpe ?? 0;
  const tradesPenalty = Math.min(1, r.trades / 20); // ramps up to 1 at 20 trades
  const winBonus = r.winRate; // 0..1
  return Math.max(0, sharpe * tradesPenalty + winBonus);
}

function variantOf(label: string, r: BacktestResult): ScoredVariant {
  return {
    label,
    score: scoreBacktest(r),
    trades: r.trades,
    winRate: r.winRate,
    netPnl: r.netPnl,
    maxDrawdown: r.maxDrawdown,
  };
}

// ---------------------------------------------------------------------------
// Diagnostic — single run, no variation. Produces a structured report. May
// or may not include a diff depending on what the rejection histogram shows.
// ---------------------------------------------------------------------------

export function runDiagnostic(args: {
  config: DiagnosticConfig;
  candles: Candle[];
  regime: Regime;
  live: LiveParams;
}): { metrics: BacktestResult; recommendation: Recommendation } {
  const { candles, regime, live } = args;
  const result = runBacktest({
    candles,
    regime,
    startingCapital: live.startingCapital,
    config: {
      riskPercentPerTrade: live.riskPercentPerTrade,
      minRiskRewardRatio: live.minRiskRewardRatio,
      minLevelRank: live.minLevelRank,
      maxConcurrentPositions: live.maxConcurrentPositions,
      dailyDrawdownLimitPct: live.dailyDrawdownLimitPct,
      weeklyDrawdownLimitPct: live.weeklyDrawdownLimitPct,
    },
  });

  const diag = result.diagnostic;
  const totalRejected = Object.values(diag.rejections).reduce((a, b) => a + b, 0);

  // Build operator-readable findings from the histogram. Always include the
  // full top-N breakdown so the operator can see the shape even when no
  // single reason dominates — that's the most common diagnostic failure
  // mode and "no dominant reason" alone is unhelpful without the numbers.
  const findings: string[] = [];
  findings.push(
    `${diag.barsEvaluated} bars evaluated · ${diag.entriesTaken} entries taken · ${totalRejected} rejected.`
  );
  const sorted = Object.entries(diag.rejections).sort((a, b) => b[1] - a[1]);
  for (const [reason, count] of sorted.slice(0, 6)) {
    const pct = totalRejected > 0 ? Math.round((count / totalRejected) * 100) : 0;
    findings.push(`${humanReason(reason)}: ${count} bars (${pct}%)`);
  }
  if (diag.bestLevelRankSeen > 0 && diag.bestLevelRankSeen < diag.minLevelRankFloor) {
    findings.push(
      `Best level rank seen was ${diag.bestLevelRankSeen}; your floor is ${diag.minLevelRankFloor}. Every sweep in this window was below the bar.`
    );
  }
  if (diag.bestRRSeen > 0 && diag.bestRRSeen < diag.minRRFloor) {
    findings.push(
      `Best R:R produced was ${diag.bestRRSeen.toFixed(2)}; your minimum is ${diag.minRRFloor.toFixed(2)}.`
    );
  }

  // Decide whether to suggest a concrete diff. Heuristic:
  //   - level_rank_below_minimum dominates AND best rank seen is one below floor
  //     → suggest minLevelRank--
  //   - rr_below_minimum dominates AND best RR seen is within reach
  //     → suggest minRiskRewardRatio = floor(bestRR * 10)/10
  let diff: Recommendation["diff"];
  const rejKey = (k: string) => diag.rejections[`risk_rejected:${k}`] ?? 0;
  const dominantRank = rejKey("level_rank_below_minimum");
  const dominantRR = rejKey("rr_below_minimum");

  if (
    dominantRank > 0 &&
    dominantRank >= totalRejected * 0.5 &&
    diag.bestLevelRankSeen >= 1 &&
    diag.bestLevelRankSeen < diag.minLevelRankFloor
  ) {
    diff = {
      paramKey: "minLevelRank",
      fromValue: diag.minLevelRankFloor,
      toValue: diag.bestLevelRankSeen,
      rationale: `${Math.round((dominantRank / totalRejected) * 100)}% of rejections were level_rank_below_minimum, and the best rank seen in this window was ${diag.bestLevelRankSeen}. Lowering the floor to ${diag.bestLevelRankSeen} would have admitted those sweeps for evaluation.`,
    };
  } else if (
    dominantRR > 0 &&
    dominantRR >= totalRejected * 0.5 &&
    diag.bestRRSeen >= 1.0 &&
    diag.bestRRSeen < diag.minRRFloor
  ) {
    const floor = Math.floor(diag.bestRRSeen * 10) / 10;
    diff = {
      paramKey: "minRiskRewardRatio",
      fromValue: diag.minRRFloor,
      toValue: floor,
      rationale: `${Math.round((dominantRR / totalRejected) * 100)}% of rejections were rr_below_minimum, and the best R:R any proposal produced was ${diag.bestRRSeen.toFixed(2)}. Lowering the minimum to ${floor.toFixed(1)} would have admitted those.`,
    };
  }

  const summary = diff
    ? `Found a likely blocker — suggesting ${diff.paramKey} ${diff.fromValue} → ${diff.toValue}.`
    : diag.entriesTaken > 0
      ? `Bot is trading (${diag.entriesTaken} entries in window). No change suggested.`
      : `Bot found no entries, but no single rejection reason dominates. No change suggested — review findings.`;

  return {
    metrics: result,
    recommendation: {
      summary,
      findings,
      diff,
      diagnosticPayload: {
        diagnostic: diag,
        trades: result.trades,
        winRate: result.winRate,
        netPnl: result.netPnl,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Param sweep — vary one tunable across N values, score each, pick the best.
// ---------------------------------------------------------------------------

export function runParamSweep(args: {
  config: ParamSweepConfig;
  candles: Candle[];
  regime: Regime;
  live: LiveParams;
}): { metrics: { variants: ScoredVariant[] }; recommendation: Recommendation } {
  const { config, candles, regime, live } = args;
  const variants: ScoredVariant[] = [];
  const baseConfig = {
    riskPercentPerTrade: live.riskPercentPerTrade,
    minRiskRewardRatio: live.minRiskRewardRatio,
    minLevelRank: live.minLevelRank,
    maxConcurrentPositions: live.maxConcurrentPositions,
    dailyDrawdownLimitPct: live.dailyDrawdownLimitPct,
    weeklyDrawdownLimitPct: live.weeklyDrawdownLimitPct,
  };

  for (const value of config.values) {
    const cfg = { ...baseConfig, [config.paramKey]: value };
    const r = runBacktest({
      candles,
      regime,
      startingCapital: live.startingCapital,
      config: cfg,
    });
    variants.push(variantOf(`${config.paramKey}=${value}`, r));
  }

  // Pick the highest-scoring variant. Ties broken by trade count (more is
  // less overfit-prone within reason).
  const ranked = [...variants].sort((a, b) =>
    b.score !== a.score ? b.score - a.score : b.trades - a.trades
  );
  const winner = ranked[0];
  const currentValue = (live as unknown as Record<string, number>)[config.paramKey];

  const findings: string[] = [
    `Tested ${variants.length} values of ${config.paramKey}: ${config.values.join(", ")}.`,
    `Best: ${winner.label} (score ${winner.score.toFixed(2)}, ${winner.trades} trades, ${Math.round(winner.winRate * 100)}% wins).`,
    `Current live value: ${currentValue}.`,
  ];

  const winnerValue = Number(winner.label.split("=")[1]);
  let diff: Recommendation["diff"];
  if (winnerValue !== currentValue && winner.score > 0) {
    diff = {
      paramKey: config.paramKey,
      fromValue: currentValue,
      toValue: winnerValue,
      rationale: `Sweeping ${config.paramKey} over ${config.values.length} values, ${winner.label} produced the highest score (${winner.score.toFixed(2)}) versus the current live value of ${currentValue}.`,
    };
  }

  return {
    metrics: { variants },
    recommendation: {
      summary: diff
        ? `Recommend ${config.paramKey}: ${diff.fromValue} → ${diff.toValue}.`
        : `Current ${config.paramKey} (${currentValue}) is already optimal.`,
      findings,
      diff,
      variants,
    },
  };
}

// ---------------------------------------------------------------------------
// Comparison — N labelled alternatives, each is a partial param override.
// ---------------------------------------------------------------------------

export function runComparison(args: {
  config: ComparisonConfig;
  candles: Candle[];
  regime: Regime;
  live: LiveParams;
}): { metrics: { variants: ScoredVariant[] }; recommendation: Recommendation } {
  const { config, candles, regime, live } = args;
  const baseConfig = {
    riskPercentPerTrade: live.riskPercentPerTrade,
    minRiskRewardRatio: live.minRiskRewardRatio,
    minLevelRank: live.minLevelRank,
    maxConcurrentPositions: live.maxConcurrentPositions,
    dailyDrawdownLimitPct: live.dailyDrawdownLimitPct,
    weeklyDrawdownLimitPct: live.weeklyDrawdownLimitPct,
  };

  const variants: ScoredVariant[] = [];
  for (const alt of config.alternatives) {
    const cfg = { ...baseConfig, ...alt.overrides };
    const r = runBacktest({
      candles,
      regime,
      startingCapital: live.startingCapital,
      config: cfg,
    });
    variants.push(variantOf(alt.label, r));
  }

  const ranked = [...variants].sort((a, b) =>
    b.score !== a.score ? b.score - a.score : b.trades - a.trades
  );
  const winner = ranked[0];

  // For comparison, we don't auto-build a diff because the alternative may
  // touch multiple keys. The operator reads the table and picks the
  // recommendation if they like it. This keeps the applier honest — it
  // only ever applies single-key changes from sweeps and diagnostics.
  const findings: string[] = [
    `Compared ${variants.length} alternatives.`,
    ...ranked.map(
      (v, i) =>
        `${i + 1}. ${v.label} — score ${v.score.toFixed(2)}, ${v.trades} trades, ${Math.round(v.winRate * 100)}% wins`
    ),
  ];

  return {
    metrics: { variants },
    recommendation: {
      summary: `Best alternative: ${winner.label} (score ${winner.score.toFixed(2)}).`,
      findings,
      variants,
      // diff intentionally omitted — comparison results are read-only insights.
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function humanReason(machineReason: string): string {
  const map: Record<string, string> = {
    no_levels: "no levels identified",
    no_sweep: "no liquidity sweep detected",
    no_proposal: "sweep found but no valid setup",
    "risk_rejected:regime_suppresses_entries": "regime suppresses entries",
    "risk_rejected:daily_drawdown_breached": "daily drawdown breached",
    "risk_rejected:weekly_drawdown_breached": "weekly drawdown breached",
    "risk_rejected:max_concurrent_positions_reached": "at max concurrent positions",
    "risk_rejected:level_rank_below_minimum": "level rank below minimum",
    "risk_rejected:rr_below_minimum": "R:R below minimum",
    "risk_rejected:invalid_stop_distance": "invalid stop distance",
    "risk_rejected:regime_size_multiplier_zero": "regime size multiplier zero",
    "risk_rejected:below_min_order_size": "position below exchange minimum",
    "risk_rejected:position_exceeds_capital": "position would exceed capital",
  };
  return map[machineReason] ?? machineReason;
}
