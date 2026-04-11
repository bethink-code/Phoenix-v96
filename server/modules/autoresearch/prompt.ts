// Prompt construction for the autoresearch orchestrator. The LLM is given:
//   1. The operator's stated goal in plain English
//   2. A schema of the params it's allowed to vary, with current values
//      and bounds
//   3. The history of iterations so far (what was tried, what scored)
//   4. The rejection breakdown of the LAST iteration (where the bot got
//      blocked) — most informative signal for picking the next hypothesis
//   5. A strict JSON output schema
//
// We use response_format=json_object so the model returns parsable JSON
// directly. No markdown fences, no explanations outside the structured
// fields.

import type { Regime } from "../../../shared/schema";

// Operator's intent + the search frame for one session.
export interface SessionContext {
  goal: string;
  pair: { symbol: string }; // e.g. { symbol: "CRVUSDT" }
  timeframe: string; // e.g. "1h"
  lookbackBars: number;
  regime: Regime;
}

// What the LLM is allowed to set. This IS the search space. Adding a
// param means listing it here AND making sure the orchestrator threads
// it through to runBacktest.
export interface ProposedParams {
  // Risk-style (live-appliable later via the experiments framework)
  minLevelRank: number; // 1..5
  minRiskRewardRatio: number; // typically 1.0..3.0
  maxConcurrentPositions: number; // 1..5

  // Strategy-internal (not currently live-appliable, but the agent can
  // sweep them to find good values to harden into defaults later)
  swingLookback: number; // 3..15
  equalTolerancePct: number; // 0.01..0.5
  mergeTolerancePct: number; // 0.05..0.5
  minTouches: number; // 1..3
  minWickProtrusionPct: number; // 0.005..0.5
  targetDistanceMultiplier: number; // 1.0..3.0
}

// One past iteration as the LLM sees it.
export interface IterationSummary {
  idx: number;
  params: ProposedParams;
  score: number;
  trades: number;
  winRate: number;
  netPnl: number;
  rejectionTop: Record<string, number> | null;
  status: "keep" | "discard" | "crash" | "baseline";
  rationale?: string;
}

// What we expect back from the LLM.
export interface LLMProposal {
  params: ProposedParams;
  rationale: string; // 1-2 sentences explaining the hypothesis
}

const SYSTEM_PROMPT = `You are an autonomous trading-strategy researcher running a Karpathy-style autoresearch loop. Your job is to find a parameter configuration that meets the operator's stated goal by iterating: read previous results, propose a change, the system runs a backtest, you read the score, you propose another change.

You are NOT a chatbot. You do not greet the user, apologize, hedge, or explain what you're about to do outside the JSON output. Every response is a single JSON object with the shape:

{
  "params": { ... full ProposedParams object ... },
  "rationale": "1-2 sentences explaining the hypothesis"
}

The params object MUST contain ALL of the following fields. Missing any field is a hard error. Use the value from the most recent kept iteration if you don't want to change a particular field:

- minLevelRank (integer 1..5): minimum strength level the strategy will trade against. Lower = more setups admitted, weaker quality.
- minRiskRewardRatio (number 1.0..3.0): minimum reward:risk ratio. Lower = more setups admitted, smaller wins.
- maxConcurrentPositions (integer 1..5): how many positions can be open at once.
- swingLookback (integer 3..15): bars on each side for swing-point detection. Lower = more swings detected (noisier), higher = fewer (more significant).
- equalTolerancePct (number 0.01..0.5): % tolerance for equal-high/low clustering. Higher = looser clustering, more equal-level signals.
- mergeTolerancePct (number 0.05..0.5): % tolerance for merging nearby levels into one. Higher = more confluence merging.
- minTouches (integer 1..3): minimum candle touches for a level to be valid.
- minWickProtrusionPct (number 0.005..0.5): minimum wick protrusion % to count as a sweep. Lower = more sweeps detected.
- targetDistanceMultiplier (number 1.0..3.0): target must be at least this multiple of the risk distance away. Lower = tighter targets accepted.

When picking your next hypothesis:
1. Read the rejection_top of the most recent iteration. If one reason dominates (>50% of rejections), the parameters governing that reason are your prime target.
2. If "no_proposal" dominates → consider lowering targetDistanceMultiplier or changing swingLookback to surface different levels.
3. If "no_sweep" dominates → consider lowering minWickProtrusionPct.
4. If "no_levels" dominates → consider lowering minTouches or increasing equalTolerancePct.
5. If "risk_rejected:level_rank_below_minimum" dominates → consider lowering minLevelRank.
6. If "risk_rejected:rr_below_minimum" dominates → consider lowering minRiskRewardRatio OR lowering targetDistanceMultiplier (which produces lower R:R proposals).
7. If "risk_rejected:position_exceeds_capital" dominates → consider increasing minRiskRewardRatio (forces wider stops, smaller positions).
8. Avoid proposing the exact same params as a previous iteration. Check the history.
9. Prefer one-knob changes per iteration so you can attribute score deltas. Two-knob changes only when you have a strong joint hypothesis.
10. After ~10 iterations on a single dimension with no improvement, broaden to a different dimension.

Your responses are machine-parsed. JSON only. No markdown fences. No commentary outside the rationale field.`;

export function buildMessages(args: {
  ctx: SessionContext;
  history: IterationSummary[];
  currentParams: ProposedParams;
  isBaseline: boolean;
}): { role: "system" | "user"; content: string }[] {
  const { ctx, history, currentParams, isBaseline } = args;

  const userContent = isBaseline
    ? `Goal: ${ctx.goal}

Pair: ${ctx.pair.symbol} · timeframe: ${ctx.timeframe} · lookback: ${ctx.lookbackBars} bars · regime: ${ctx.regime}

This is the BASELINE iteration. Return the current params as-is so we can establish a starting score:

${JSON.stringify(currentParams, null, 2)}

Respond with the same params and a one-sentence rationale that says "baseline".`
    : `Goal: ${ctx.goal}

Pair: ${ctx.pair.symbol} · timeframe: ${ctx.timeframe} · lookback: ${ctx.lookbackBars} bars · regime: ${ctx.regime}

History so far (${history.length} iterations):
${formatHistory(history)}

Current best params:
${JSON.stringify(currentParams, null, 2)}

Propose the next iteration. Return a JSON object with "params" (all fields) and "rationale" (1-2 sentences).`;

  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userContent },
  ];
}

function formatHistory(history: IterationSummary[]): string {
  if (history.length === 0) return "(none yet)";
  // Last 12 iterations is enough context for the LLM without bloating
  // tokens. The LLM has the dominant signals in its working set without
  // having to remember every single past attempt.
  const recent = history.slice(-12);
  return recent
    .map((it) => {
      const top = it.rejectionTop
        ? Object.entries(it.rejectionTop)
            .slice(0, 3)
            .map(([k, v]) => `${k}=${v}`)
            .join(", ")
        : "";
      return `#${it.idx} [${it.status}] score=${it.score.toFixed(4)} trades=${it.trades} win_rate=${it.winRate.toFixed(2)} pnl=${it.netPnl.toFixed(2)}
       params=${JSON.stringify(it.params)}
       top_rejections=${top}
       rationale="${it.rationale ?? ""}"`;
    })
    .join("\n");
}

// Validate and normalise an LLM response. Returns the parsed proposal or
// throws with a human-readable error. The orchestrator catches and logs
// the iteration as a "crash" so the loop continues.
export function parseLLMResponse(text: string): LLMProposal {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(`LLM did not return valid JSON: ${(err as Error).message}`);
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("LLM response is not an object");
  }
  const obj = parsed as Record<string, unknown>;
  if (!obj.params || typeof obj.params !== "object") {
    throw new Error("LLM response missing 'params' object");
  }
  const params = obj.params as Record<string, unknown>;
  const required: Array<keyof ProposedParams> = [
    "minLevelRank",
    "minRiskRewardRatio",
    "maxConcurrentPositions",
    "swingLookback",
    "equalTolerancePct",
    "mergeTolerancePct",
    "minTouches",
    "minWickProtrusionPct",
    "targetDistanceMultiplier",
  ];
  for (const key of required) {
    if (typeof params[key] !== "number" || !Number.isFinite(params[key] as number)) {
      throw new Error(`LLM response params.${key} is missing or not a number`);
    }
  }
  return {
    params: params as unknown as ProposedParams,
    rationale: typeof obj.rationale === "string" ? obj.rationale : "",
  };
}

// Default starting params used as the baseline for the first iteration.
// Mirrors the production defaults so the baseline matches what the live
// bot would do today.
export const DEFAULT_PARAMS: ProposedParams = {
  minLevelRank: 2,
  minRiskRewardRatio: 2.0,
  maxConcurrentPositions: 2,
  swingLookback: 5,
  equalTolerancePct: 0.05,
  mergeTolerancePct: 0.1,
  minTouches: 1,
  minWickProtrusionPct: 0.02,
  targetDistanceMultiplier: 1.5,
};
