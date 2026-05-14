// createPosition — turn a TradePlan into an initial PLANNED PositionRecord.
//
// The decision module emits TradePlans; the execution module wraps each in a
// PositionRecord that the reducer then steps over bars. This is the only
// place a record enters the lifecycle.
//
// Pure function. ID generation is the caller's concern (kept deterministic
// for replay).

import type { TradePlan } from "../decision/types";
import { computeSize } from "./computeSize";
import type { PositionRecord } from "./types";

export interface CreatePositionInput {
  id: string;
  symbol: string;
  plan: TradePlan;
  emittedAtBarTs: number;
}

export function createPosition(
  input: CreatePositionInput,
): PositionRecord {
  return {
    id: input.id,
    symbol: input.symbol,
    timeframe: input.plan.timeframe,
    phase: input.plan.phase,
    side: input.plan.side,
    entryPrice: input.plan.entry,
    stopPrice: input.plan.stop,
    targetPrice: input.plan.target,
    riskPct: input.plan.riskPct,
    sizeMultiplier: input.plan.sizeMultiplier,
    size: null,
    notional: null,
    emittedAtBarTs: input.emittedAtBarTs,
    submittedAtBarTs: null,
    filledAtBarTs: null,
    closedAtBarTs: null,
    fillPrice: null,
    closePrice: null,
    realisedPnl: null,
    status: "PLANNED",
    exitReason: null,
    rejectionReason: null,
    lastEvaluatedAt: input.emittedAtBarTs,
  };
}

export function submitPosition(
  position: PositionRecord,
  equity: number,
  submittedAtBarTs: number,
): PositionRecord {
  const sizing = computeSize({
    equity,
    plan: {
      entry: position.entryPrice,
      stop: position.stopPrice,
      riskPct: position.riskPct,
      sizeMultiplier: position.sizeMultiplier,
    },
  });
  if (sizing === null) {
    return {
      ...position,
      status: "REJECTED",
      exitReason: "sizing",
      rejectionReason: "computeSize returned null",
      lastEvaluatedAt: submittedAtBarTs,
    };
  }

  return {
    ...position,
    status: "LIVE",
    size: sizing.size,
    notional: sizing.notional,
    submittedAtBarTs,
    lastEvaluatedAt: submittedAtBarTs,
  };
}
