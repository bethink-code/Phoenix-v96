// Execution module types — paper-trading position lifecycle.
//
// Single position per (symbol, timeframe). 7-state machine. Pure-function
// reducer steps over bars. See memory/zenny_execution_module.md for the full
// design and memory/zenny_paper_testing_schedule.md for the tunable
// alternatives behind the defaults.

import type { Timeframe } from "../../../../shared/zennyTypes";

export type PositionStatus =
  | "PLANNED"
  | "LIVE"
  | "FILLED"
  | "CLOSED"
  | "CANCELLED"
  | "EXPIRED"
  | "REJECTED";

export type TradeSide = "long" | "short";

// Reasons a position transitioned out of a non-terminal state. Used for the
// audit log + integrity dashboard. CLOSED has 'stop' / 'target'; CANCELLED
// has 'operator' / 'regime' / 'kill-switch'; REJECTED has 'sizing' / 'gap' /
// 'risk-veto' / 'equity-zero'; EXPIRED has only 'valid-bars-elapsed'.
export type ExitReason =
  | "stop"
  | "target"
  | "operator"
  | "regime"
  | "kill-switch"
  | "valid-bars-elapsed"
  | "sizing"
  | "gap"
  | "risk-veto"
  | "equity-zero";

// Bar shape consumed by the reducer. Subset of analysis Candle plus the
// gap-filled flag the persistence layer marks for synthesised bars.
export interface ExecutionBar {
  openTime: number;
  closeTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  // Set true by the data layer when this bar was forward-filled to cover a
  // missing exchange bar. The reducer rejects all transitions on gap bars
  // to avoid trading off synthesised data.
  gapFilled?: boolean;
}

// One position record covers the full lifecycle from PLANNED through to a
// terminal state. Decision module emits prices; execution computes size on
// PLANNED → LIVE; status field tracks current state.
export interface PositionRecord {
  id: string;
  symbol: string;
  timeframe: Timeframe;
  // Two-phase split: 'reach' = pull-target ride; 'take' = sweep-fade.
  // Position dedup key is (symbol, timeframe, phase) — REACH and TAKE can
  // coexist on the same TF.
  phase: "reach" | "take";
  side: TradeSide;

  // Geometry copied from the TradePlan at PLANNED creation. Immutable.
  entryPrice: number;
  stopPrice: number;
  targetPrice: number;
  riskPct: number;
  sizeMultiplier: number;

  // Sizing — set on PLANNED → LIVE. Null until then.
  size: number | null;
  notional: number | null;

  // Bar timestamps for lookahead-bias invariants. emittedAtBarTs is the
  // signal bar timestamp that produced the TradePlan. submittedAtBarTs is
  // when the paper order was accepted onto the book. filledAtBarTs and
  // closedAtBarTs are set on later transitions.
  emittedAtBarTs: number;
  submittedAtBarTs: number | null;
  filledAtBarTs: number | null;
  closedAtBarTs: number | null;

  // Realised execution prices — entry fill (after slippage), exit price.
  fillPrice: number | null;
  closePrice: number | null;

  // PnL in quote currency (size × (close - fill) for long; flipped for short).
  // Computed at FILLED → CLOSED.
  realisedPnl: number | null;

  // State + audit
  status: PositionStatus;
  exitReason: ExitReason | null;
  rejectionReason: string | null;

  // Last bar this position was evaluated against. Used for the lookahead
  // invariant: every reduceStep call requires bar.openTime > lastEvaluatedAt.
  lastEvaluatedAt: number;
}

// Result of applyFillRules — null when no fill, otherwise the fill price
// (post-slippage) and which order kind triggered.
export type OrderKind = "entry-limit" | "stop-market" | "target-limit";

export interface FillResult {
  kind: OrderKind;
  fillPrice: number;
}

// Account-level state used by killSwitchEvaluate. Tracked outside the
// position record because it spans positions.
export interface AccountState {
  currentEquity: number;
  peakEquity: number;
  killStatus: "OK" | "SOFT_TRIPPED" | "HARD_TRIPPED";
}

export type KillState = "OK" | "SOFT_TRIPPED" | "HARD_TRIPPED";

// Input to PLANNED creation — what we get from the decision module +
// metadata to start the lifecycle.
export interface PlanInputForPosition {
  id: string; // deterministic — caller generates
  symbol: string;
  timeframe: Timeframe;
  side: TradeSide;
  entry: number;
  stop: number;
  target: number;
  riskPct: number;
  sizeMultiplier: number;
  emittedAtBarTs: number;
}
