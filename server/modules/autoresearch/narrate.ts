// Server-side narration for autoresearch iterations. Each iteration gets
// a single first-person sentence stored in the row, so the live feed in
// the UI is just a list of those sentences. Same pattern as the bot's
// HeartbeatFeed, different vocabulary — this is the *researcher* voice,
// not the trader voice.
//
// Pure function. The orchestrator calls this once per iteration after
// the backtest completes and uses the result to set the row's narration
// column.

import type { ProposedParams } from "./prompt";

export interface IterationOutcome {
  idx: number;
  isBaseline: boolean;
  prevParams: ProposedParams | null;
  newParams: ProposedParams;
  prevScore: number | null;
  newScore: number;
  trades: number;
  status: "keep" | "discard" | "crash" | "baseline";
  crashReason?: string;
}

export function narrateIteration(o: IterationOutcome): string {
  if (o.status === "crash") {
    return `Iteration ${o.idx + 1}: crashed — ${o.crashReason ?? "unknown error"}. Moving on.`;
  }

  if (o.isBaseline || o.status === "baseline") {
    if (o.trades === 0) {
      return `Baseline: ${o.trades} trades, score ${o.newScore.toFixed(4)}. The current config doesn't trade at all on this dataset — that's the problem to solve.`;
    }
    return `Baseline: ${o.trades} trades, score ${o.newScore.toFixed(4)}. That's the bar to beat.`;
  }

  // Find what changed between prev and new params so the narration is
  // specific instead of vague.
  const diff = diffParams(o.prevParams, o.newParams);
  const change = diff
    ? `${diff.key} ${formatVal(diff.before)} → ${formatVal(diff.after)}`
    : "tweaked params";

  if (o.status === "keep") {
    const delta = o.prevScore != null ? o.newScore - o.prevScore : o.newScore;
    return `Iteration ${o.idx + 1}: ${change}. Score ${o.newScore.toFixed(4)} (+${delta.toFixed(4)}), ${o.trades} trades. Keeping.`;
  }

  if (o.status === "discard") {
    return `Iteration ${o.idx + 1}: ${change}. Score ${o.newScore.toFixed(4)} no better than current best, ${o.trades} trades. Reverting.`;
  }

  return `Iteration ${o.idx + 1}: ${change}. Score ${o.newScore.toFixed(4)}.`;
}

function diffParams(
  prev: ProposedParams | null,
  next: ProposedParams
): { key: string; before: number; after: number } | null {
  if (!prev) return null;
  const keys = Object.keys(next) as Array<keyof ProposedParams>;
  for (const k of keys) {
    if (prev[k] !== next[k]) {
      // First differing key wins. The system prompt asks the LLM to do
      // one-knob changes per iteration, so this is usually accurate.
      return { key: String(k), before: prev[k], after: next[k] };
    }
  }
  return null;
}

function formatVal(v: number): string {
  if (Number.isInteger(v)) return v.toString();
  return v.toFixed(2);
}
