// AUTORESEARCH — THIS IS THE FILE YOU EDIT.
//
// Mirrors Karpathy's train.py: a single self-contained file with all the
// tunable params at the top. The agent edits the constants in the PARAMS
// section, runs `npm run autoresearch:train > run.log 2>&1`, then greps
// the score out of run.log. Keep what improves; revert what doesn't.
//
// The lower portion of this file is the evaluation pipeline. The agent
// is allowed to edit it too if a more radical change is justified — for
// example, adding a new param, changing how levels are filtered, or
// swapping the scoring function. But edits below the PARAMS block should
// be deliberate and the description should call them out.
//
// Output format (last block before exit) is exactly:
//   ---
//   score:            <float>
//   trades:           <int>
//   wins:             <int>
//   losses:           <int>
//   win_rate:         <float 0..1>
//   net_pnl:          <float>
//   max_drawdown_pct: <float>
//   bars_evaluated:   <int>
//   entries_taken:    <int>
//   total_seconds:    <float>
//
// The agent greps `^score:` for the headline metric.

import { runBacktest } from "../server/modules/backtestEngine";
import {
  DEFAULT_LEVEL_CONFIG,
  type LevelConfig,
} from "../server/modules/strategy/levels";
import {
  DEFAULT_SWEEP_CONFIG,
  type SweepConfig,
} from "../server/modules/strategy/sweeps";
import { loadPreparedCandles } from "./prepare";
import type { Regime } from "../shared/schema";

// ============================================================================
// PARAMS — edit these
// ============================================================================
//
// Dataset selection. Must already be cached via `npm run autoresearch:prepare`.
const DATASET = {
  symbol: "CRVUSDT",
  timeframe: "1h",
  limit: 1000,
};

// The regime the bot would be running in. Drives mode gating + size mult.
// Options: "no_trade" | "ranging" | "trending" | "breakout"
//        | "high_volatility" | "low_liquidity" | "accumulation_distribution"
const REGIME: Regime = "trending";

// Risk parameters that the live applier can write back. Anything edited
// here that the agent wants to recommend must be in this allowlist:
// minLevelRank, minRiskRewardRatio, maxConcurrentPositions.
const RISK_PARAMS = {
  riskPercentPerTrade: 1.0,
  minRiskRewardRatio: 2.0,
  minLevelRank: 2,
  maxConcurrentPositions: 2,
  dailyDrawdownLimitPct: 3.0,
  weeklyDrawdownLimitPct: 6.0,
  startingCapital: 10_000,
};

// Strategy internals — currently NOT live-appliable, but the agent can
// vary them here to find good defaults that the operator might harden into
// the codebase later.
const LEVEL_CONFIG: LevelConfig = {
  ...DEFAULT_LEVEL_CONFIG,
  // swingLookback: 5,         // bars on each side for swing detection
  // equalTolerancePct: 0.05,  // 5 bps — tight for crypto
  // mergeTolerancePct: 0.1,   // 10 bps — confluence merge window
  // minTouches: 1,
};

const SWEEP_CONFIG: SweepConfig = {
  ...DEFAULT_SWEEP_CONFIG,
  // minWickProtrusionPct: 0.02, // 2 bps — noise floor
};

// Target distance multiplier — sweep generates a proposal only if there's
// an opposing-side level at least this multiple of the wick risk away.
// 1.5 is the production default. Lowering admits tighter ranges.
const TARGET_DISTANCE_MULTIPLIER = 1.5;

// Backtest warmup: ignore the first N bars (need enough history for swings).
const WARMUP_BARS = 100;

// ============================================================================
// EVALUATION PIPELINE — usually leave alone, but editable if justified
// ============================================================================

async function main() {
  const startedAt = performance.now();

  // ---- Load prepared candles -----------------------------------------------
  let candles;
  try {
    candles = await loadPreparedCandles(
      DATASET.symbol,
      DATASET.timeframe,
      DATASET.limit
    );
  } catch (err) {
    console.error(
      `\nFailed to load dataset ${DATASET.symbol}_${DATASET.timeframe}_${DATASET.limit}.json`
    );
    console.error(`Run: npm run autoresearch:prepare ${DATASET.symbol} ${DATASET.timeframe} ${DATASET.limit}`);
    console.error(`Underlying error: ${(err as Error).message}`);
    process.exit(1);
  }
  if (candles.length < WARMUP_BARS + 50) {
    console.error(
      `Not enough candles: have ${candles.length}, need ${WARMUP_BARS + 50}.`
    );
    process.exit(1);
  }

  // ---- Run backtest -------------------------------------------------------
  const result = runBacktest({
    candles,
    regime: REGIME,
    startingCapital: RISK_PARAMS.startingCapital,
    warmupCandles: WARMUP_BARS,
    config: {
      riskPercentPerTrade: RISK_PARAMS.riskPercentPerTrade,
      minRiskRewardRatio: RISK_PARAMS.minRiskRewardRatio,
      minLevelRank: RISK_PARAMS.minLevelRank,
      maxConcurrentPositions: RISK_PARAMS.maxConcurrentPositions,
      dailyDrawdownLimitPct: RISK_PARAMS.dailyDrawdownLimitPct,
      weeklyDrawdownLimitPct: RISK_PARAMS.weeklyDrawdownLimitPct,
    },
    levelConfig: LEVEL_CONFIG,
    sweepConfig: SWEEP_CONFIG,
    proposalConfig: { targetDistanceMultiplier: TARGET_DISTANCE_MULTIPLIER },
  });

  const totalSeconds = (performance.now() - startedAt) / 1000;

  // ---- Score ---------------------------------------------------------------
  // Higher is better. Mirrors the score function used in the experiments
  // framework so train.ts and the deployed UI agree on what "good" means.
  // Refuse to score variants with too few trades to avoid rewarding flukes.
  const score = scoreBacktest(result);

  // ---- Output -------------------------------------------------------------
  // Single block at end. The agent greps `^score:` to read the headline.
  console.log("---");
  console.log(`score:            ${score.toFixed(6)}`);
  console.log(`trades:           ${result.trades}`);
  console.log(`wins:             ${result.wins}`);
  console.log(`losses:           ${result.losses}`);
  console.log(`win_rate:         ${result.winRate.toFixed(4)}`);
  console.log(`net_pnl:          ${result.netPnl.toFixed(2)}`);
  console.log(`max_drawdown_pct: ${result.maxDrawdown.toFixed(2)}`);
  console.log(`bars_evaluated:   ${result.diagnostic.barsEvaluated}`);
  console.log(`entries_taken:    ${result.diagnostic.entriesTaken}`);
  console.log(`total_seconds:    ${totalSeconds.toFixed(1)}`);

  // Also print the top rejection reasons so the agent can read WHY a
  // configuration didn't trade. Helps it pick the next hypothesis.
  const rejections = Object.entries(result.diagnostic.rejections)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  if (rejections.length > 0) {
    console.log("---");
    console.log("rejection_breakdown:");
    for (const [reason, count] of rejections) {
      console.log(`  ${reason}: ${count}`);
    }
  }
}

function scoreBacktest(r: ReturnType<typeof runBacktest>): number {
  if (r.trades < 3) return 0;
  const sharpe = r.sharpe ?? 0;
  const tradesPenalty = Math.min(1, r.trades / 20);
  const winBonus = r.winRate;
  return Math.max(0, sharpe * tradesPenalty + winBonus);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
