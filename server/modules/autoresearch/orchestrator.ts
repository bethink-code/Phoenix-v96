// Autoresearch orchestrator. Runs a bounded LLM-driven search loop in the
// background of the long-lived Express process. Local-only — refuses to
// start if OPENAI_API_KEY is missing, which keeps it out of prd.
//
// One session per call. Each session:
//   1. Inserts an autoresearch_sessions row in 'running' state
//   2. Fetches candles for the session's pair/timeframe/lookback once
//   3. Loops up to maxIterations:
//      a. baseline iteration uses DEFAULT_PARAMS, no LLM call
//      b. subsequent iterations call the LLM with history + current best
//      c. runs the backtest with the proposed params
//      d. scores it, narrates it, persists an autoresearch_iterations row
//      e. updates session totals (best score, cost, iterations_run)
//      f. checks the stop flag — if set, exits gracefully after the row
//   4. Marks the session 'done' (or 'aborted' if stop was hit, 'error' on
//      a fatal failure)
//
// The function is async but the route handler does NOT await it — start
// returns the session id immediately and the loop runs in the background.
// The UI polls the session for progress.

import { db } from "../../db";
import { eq } from "drizzle-orm";
import {
  autoresearchSessions,
  autoresearchIterations,
  type AutoresearchSession,
  type Regime,
} from "../../../shared/schema";
import { runBacktest } from "../backtestEngine";
import { getBinance } from "../exchange/binance";
import type { Timeframe } from "../exchange/types";
import { chat, isOpenAIConfigured } from "./openai";
import {
  buildMessages,
  parseLLMResponse,
  DEFAULT_PARAMS,
  type ProposedParams,
  type SessionContext,
  type IterationSummary,
} from "./prompt";
import { narrateIteration } from "./narrate";

// In-memory stop flags by session id. The route handler sets a flag
// when the operator clicks Stop; the orchestrator checks it after each
// iteration and exits gracefully. Lost on server restart, which is
// fine — restarting kills the loop anyway.
const stopFlags = new Map<string, boolean>();

export function requestStop(sessionId: string) {
  stopFlags.set(sessionId, true);
}

export interface StartArgs {
  tenantId: string;
  userId: string;
  goal: string;
  pairId: string;
  pairSymbol: string;
  timeframe: Timeframe;
  lookbackBars: number;
  regime: Regime;
  model: string;
  maxIterations: number;
  // The system prompt the operator confirmed (or edited) at session
  // start. Stored verbatim on the session row and read by the LLM
  // call inside the loop. The orchestrator never reads any module-level
  // constant for the prompt — what's in the session row is what runs.
  systemPrompt: string;
}

export async function startSession(args: StartArgs): Promise<AutoresearchSession> {
  if (!isOpenAIConfigured()) {
    throw new Error(
      "OPENAI_API_KEY not set. Add it to Doppler dev: doppler secrets set OPENAI_API_KEY=sk-... --config dev"
    );
  }

  const [session] = await db
    .insert(autoresearchSessions)
    .values({
      tenantId: args.tenantId,
      goal: args.goal,
      pairId: args.pairId,
      timeframe: args.timeframe,
      lookbackBars: args.lookbackBars,
      regime: args.regime,
      model: args.model,
      maxIterations: args.maxIterations,
      systemPrompt: args.systemPrompt,
      status: "running",
      createdByUserId: args.userId,
    })
    .returning();

  // Fire-and-forget the loop. Errors are caught and persisted on the
  // session row so the UI can surface them.
  void runLoop(session, args).catch(async (err) => {
    console.error(`[autoresearch] session ${session.id} fatal:`, err);
    await db
      .update(autoresearchSessions)
      .set({
        status: "error",
        errorMessage: (err as Error).message,
        stoppedAt: new Date(),
      })
      .where(eq(autoresearchSessions.id, session.id));
  });

  return session;
}

async function runLoop(session: AutoresearchSession, args: StartArgs) {
  const ctx: SessionContext = {
    goal: args.goal,
    pair: { symbol: args.pairSymbol },
    timeframe: args.timeframe,
    lookbackBars: args.lookbackBars,
    regime: args.regime,
  };

  // Fetch candles once for the session. Same dataset across all iterations
  // so scores are comparable.
  const candles = await getBinance().fetchCandles({
    symbol: args.pairSymbol,
    timeframe: args.timeframe,
    limit: args.lookbackBars,
  });

  if (candles.length < 50) {
    throw new Error(`exchange returned only ${candles.length} candles, need at least 50`);
  }

  let currentParams: ProposedParams = { ...DEFAULT_PARAMS };
  let bestParams: ProposedParams = { ...DEFAULT_PARAMS };
  let bestScore = -Infinity;
  let bestIterationId: string | null = null;
  let totalCostUsd = 0;
  const history: IterationSummary[] = [];

  for (let idx = 0; idx < args.maxIterations; idx++) {
    // Stop flag check happens BEFORE starting the next iteration so the
    // operator's Stop click is honoured promptly. The current iteration
    // runs to completion if it's already in progress.
    if (stopFlags.get(session.id)) {
      stopFlags.delete(session.id);
      await markStopped(session.id, "aborted");
      return;
    }

    const isBaseline = idx === 0;
    let proposedParams: ProposedParams;
    let rationale = "";
    let llmInputTokens = 0;
    let llmOutputTokens = 0;
    let llmCost = 0;

    if (isBaseline) {
      // The baseline is just "current params, run as-is to establish a
      // starting score". No LLM call needed — saves a request and money.
      proposedParams = currentParams;
      rationale = "baseline";
    } else {
      try {
        const messages = buildMessages({
          ctx,
          history,
          currentParams: bestParams,
          isBaseline: false,
          // Read the prompt from the session row, NOT a module-level
          // constant. The operator's confirmed/edited prompt at start
          // time is what runs.
          systemPrompt: session.systemPrompt,
        });
        const response = await chat({
          model: args.model,
          messages,
          responseFormat: "json_object",
          temperature: 0.7,
        });
        llmInputTokens = response.inputTokens;
        llmOutputTokens = response.outputTokens;
        llmCost = response.costUsd;
        totalCostUsd += llmCost;

        const parsed = parseLLMResponse(response.text);
        proposedParams = clampParams(parsed.params);
        rationale = parsed.rationale;
      } catch (err) {
        // Distinguish permanent (4xx auth/bad-request) from transient
        // (parse errors, 429, 5xx, network). Permanent failures repeat
        // forever — the next iteration will hit the same wall — so we
        // record one crash row and ABORT the session. Transient failures
        // get a single skipped iteration and the loop continues.
        const isPermanent = (err as { isPermanent?: boolean }).isPermanent === true;
        const errorMessage = (err as Error).message;
        await persistIteration({
          sessionId: session.id,
          idx,
          params: currentParams,
          score: 0,
          trades: 0,
          winRate: 0,
          netPnl: 0,
          maxDrawdownPct: 0,
          barsEvaluated: 0,
          entriesTaken: 0,
          rejectionTop: null,
          status: "crash",
          narration: narrateIteration({
            idx,
            isBaseline: false,
            prevParams: bestParams,
            newParams: currentParams,
            prevScore: bestScore,
            newScore: 0,
            trades: 0,
            status: "crash",
            crashReason: errorMessage,
          }),
          rationale: `LLM call failed: ${errorMessage}`,
          inputTokens: 0,
          outputTokens: 0,
          costUsd: 0,
        });
        await db
          .update(autoresearchSessions)
          .set({
            iterationsRun: idx + 1,
            totalCostUsd: totalCostUsd.toFixed(6),
          })
          .where(eq(autoresearchSessions.id, session.id));

        if (isPermanent) {
          // Abort the entire session — there's no point retrying a 401
          // or a 400 thirty more times in a row.
          await db
            .update(autoresearchSessions)
            .set({
              status: "error",
              errorMessage: errorMessage,
              stoppedAt: new Date(),
            })
            .where(eq(autoresearchSessions.id, session.id));
          console.error(
            `[autoresearch] aborting session ${session.id} on permanent error: ${errorMessage}`
          );
          return;
        }
        continue;
      }
    }

    // Run the backtest with the proposed params.
    const backtestResult = runBacktest({
      candles,
      regime: args.regime,
      startingCapital: 10_000,
      warmupCandles: 100,
      config: {
        riskPercentPerTrade: 1.0,
        minRiskRewardRatio: proposedParams.minRiskRewardRatio,
        minLevelRank: proposedParams.minLevelRank,
        maxConcurrentPositions: proposedParams.maxConcurrentPositions,
        dailyDrawdownLimitPct: 3.0,
        weeklyDrawdownLimitPct: 6.0,
      },
      levelConfig: {
        swingLookback: proposedParams.swingLookback,
        equalTolerancePct: proposedParams.equalTolerancePct,
        mergeTolerancePct: proposedParams.mergeTolerancePct,
        minTouches: proposedParams.minTouches,
      },
      sweepConfig: {
        minWickProtrusionPct: proposedParams.minWickProtrusionPct,
      },
      proposalConfig: {
        targetDistanceMultiplier: proposedParams.targetDistanceMultiplier,
      },
    });

    const score = scoreBacktest(backtestResult);

    // Decide keep/discard. Baseline is always kept. Subsequent iterations
    // are kept only if score strictly improved over previous best.
    let status: "keep" | "discard" | "baseline";
    if (isBaseline) {
      status = "baseline";
      bestScore = score;
      bestParams = proposedParams;
      currentParams = proposedParams;
    } else if (score > bestScore) {
      status = "keep";
      bestScore = score;
      bestParams = proposedParams;
      currentParams = proposedParams;
    } else {
      status = "discard";
      // Don't update bestParams; the LLM keeps building on the current best
      currentParams = bestParams;
    }

    const rejectionTop = topRejections(backtestResult.diagnostic.rejections, 6);
    const narration = narrateIteration({
      idx,
      isBaseline,
      prevParams: idx === 0 ? null : bestParams,
      newParams: proposedParams,
      prevScore: idx === 0 ? null : bestScore - (status === "keep" ? score - bestScore : 0),
      newScore: score,
      trades: backtestResult.trades,
      status,
    });

    const iterationRow = await persistIteration({
      sessionId: session.id,
      idx,
      params: proposedParams,
      score,
      trades: backtestResult.trades,
      winRate: backtestResult.winRate,
      netPnl: backtestResult.netPnl,
      maxDrawdownPct: backtestResult.maxDrawdown,
      barsEvaluated: backtestResult.diagnostic.barsEvaluated,
      entriesTaken: backtestResult.diagnostic.entriesTaken,
      rejectionTop,
      status,
      narration,
      rationale,
      inputTokens: llmInputTokens,
      outputTokens: llmOutputTokens,
      costUsd: llmCost,
    });

    // Push to history for the next LLM call
    history.push({
      idx,
      params: proposedParams,
      score,
      trades: backtestResult.trades,
      winRate: backtestResult.winRate,
      netPnl: backtestResult.netPnl,
      rejectionTop,
      status,
      rationale,
    });

    // Update session totals
    if (status === "keep" || status === "baseline") {
      bestIterationId = iterationRow.id;
    }
    await db
      .update(autoresearchSessions)
      .set({
        iterationsRun: idx + 1,
        bestScore: bestScore.toFixed(6),
        bestIterationId,
        totalCostUsd: totalCostUsd.toFixed(6),
      })
      .where(eq(autoresearchSessions.id, session.id));
  }

  // Loop finished naturally — mark session done
  await db
    .update(autoresearchSessions)
    .set({ status: "done", stoppedAt: new Date() })
    .where(eq(autoresearchSessions.id, session.id));
}

async function markStopped(sessionId: string, status: "aborted" | "done") {
  await db
    .update(autoresearchSessions)
    .set({ status, stoppedAt: new Date() })
    .where(eq(autoresearchSessions.id, sessionId));
}

interface PersistArgs {
  sessionId: string;
  idx: number;
  params: ProposedParams;
  score: number;
  trades: number;
  winRate: number;
  netPnl: number;
  maxDrawdownPct: number;
  barsEvaluated: number;
  entriesTaken: number;
  rejectionTop: Record<string, number> | null;
  status: "keep" | "discard" | "crash" | "baseline";
  narration: string;
  rationale: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

async function persistIteration(args: PersistArgs) {
  const [row] = await db
    .insert(autoresearchIterations)
    .values({
      sessionId: args.sessionId,
      idx: args.idx,
      params: args.params as unknown as object,
      score: args.score.toFixed(6),
      trades: args.trades,
      winRate: args.winRate.toFixed(4),
      netPnl: args.netPnl.toFixed(2),
      maxDrawdownPct: args.maxDrawdownPct.toFixed(2),
      barsEvaluated: args.barsEvaluated,
      entriesTaken: args.entriesTaken,
      rejectionTop: args.rejectionTop as unknown as object | null,
      status: args.status,
      narration: args.narration,
      rationale: args.rationale,
      inputTokens: args.inputTokens,
      outputTokens: args.outputTokens,
      costUsd: args.costUsd.toFixed(6),
    })
    .returning();
  return row;
}

// Score function — single source of truth, mirrors the experiments
// framework's scoreBacktest. Higher is better.
function scoreBacktest(r: ReturnType<typeof runBacktest>): number {
  if (r.trades < 3) return 0;
  const sharpe = r.sharpe ?? 0;
  const tradesPenalty = Math.min(1, r.trades / 20);
  const winBonus = r.winRate;
  return Math.max(0, sharpe * tradesPenalty + winBonus);
}

function topRejections(
  rejections: Record<string, number>,
  n: number
): Record<string, number> {
  const sorted = Object.entries(rejections).sort((a, b) => b[1] - a[1]);
  const top: Record<string, number> = {};
  for (const [k, v] of sorted.slice(0, n)) {
    top[k] = v;
  }
  return top;
}

// Defensive clamp: even with the system prompt's bounds documented, the
// LLM can occasionally return out-of-range values. We clamp here so a
// rogue proposal can't crash the backtest engine with e.g. swingLookback=0.
function clampParams(p: ProposedParams): ProposedParams {
  return {
    minLevelRank: clamp(Math.round(p.minLevelRank), 1, 5),
    minRiskRewardRatio: clamp(p.minRiskRewardRatio, 0.5, 5.0),
    maxConcurrentPositions: clamp(Math.round(p.maxConcurrentPositions), 1, 10),
    swingLookback: clamp(Math.round(p.swingLookback), 2, 20),
    equalTolerancePct: clamp(p.equalTolerancePct, 0.001, 1.0),
    mergeTolerancePct: clamp(p.mergeTolerancePct, 0.01, 1.0),
    minTouches: clamp(Math.round(p.minTouches), 1, 5),
    minWickProtrusionPct: clamp(p.minWickProtrusionPct, 0.001, 1.0),
    targetDistanceMultiplier: clamp(p.targetDistanceMultiplier, 0.5, 5.0),
  };
}

function clamp(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo;
  return Math.max(lo, Math.min(hi, v));
}
