// paperTradeStore — Drizzle-backed read/write for the paper-trading runner.
//
// Pure DB I/O — no business logic. Converts between in-memory shapes
// (PositionRecord uses numbers) and DB rows (Drizzle numeric → string for
// precision). Caller does the math; this module reads and writes.

import { and, eq } from "drizzle-orm";
import { db } from "../../../db";
import {
  zennyPaperAccount,
  zennyPaperPositions,
  zennyPaperTickLog,
  type InsertZennyPaperAccount,
  type InsertZennyPaperPosition,
} from "../../../../shared/schema";
import type { Timeframe } from "../../../../shared/zennyTypes";
import type { AccountState, PositionRecord, PositionStatus, TradeSide, ExitReason } from "../execution/types";
import type { KillState } from "../execution/types";

// --- Position conversions ---------------------------------------------------

function toRow(p: PositionRecord): InsertZennyPaperPosition {
  return {
    id: p.id,
    symbol: p.symbol,
    timeframe: p.timeframe,
    side: p.side,
    entryPrice: String(p.entryPrice),
    stopPrice: String(p.stopPrice),
    targetPrice: String(p.targetPrice),
    riskPct: String(p.riskPct),
    sizeMultiplier: String(p.sizeMultiplier),
    size: p.size === null ? null : String(p.size),
    notional: p.notional === null ? null : String(p.notional),
    emittedAtBarTs: String(p.emittedAtBarTs),
    submittedAtBarTs:
      p.submittedAtBarTs === null ? null : String(p.submittedAtBarTs),
    filledAtBarTs:
      p.filledAtBarTs === null ? null : String(p.filledAtBarTs),
    closedAtBarTs:
      p.closedAtBarTs === null ? null : String(p.closedAtBarTs),
    fillPrice: p.fillPrice === null ? null : String(p.fillPrice),
    closePrice: p.closePrice === null ? null : String(p.closePrice),
    realisedPnl:
      p.realisedPnl === null ? null : String(p.realisedPnl),
    status: p.status,
    exitReason: p.exitReason,
    rejectionReason: p.rejectionReason,
    lastEvaluatedAt: String(p.lastEvaluatedAt),
    updatedAt: new Date(),
  };
}

function fromRow(r: typeof zennyPaperPositions.$inferSelect): PositionRecord {
  return {
    id: r.id,
    symbol: r.symbol,
    timeframe: r.timeframe as Timeframe,
    side: r.side as TradeSide,
    entryPrice: Number(r.entryPrice),
    stopPrice: Number(r.stopPrice),
    targetPrice: Number(r.targetPrice),
    riskPct: Number(r.riskPct),
    sizeMultiplier: Number(r.sizeMultiplier),
    size: r.size === null ? null : Number(r.size),
    notional: r.notional === null ? null : Number(r.notional),
    emittedAtBarTs: Number(r.emittedAtBarTs),
    submittedAtBarTs:
      r.submittedAtBarTs === null ? null : Number(r.submittedAtBarTs),
    filledAtBarTs:
      r.filledAtBarTs === null ? null : Number(r.filledAtBarTs),
    closedAtBarTs:
      r.closedAtBarTs === null ? null : Number(r.closedAtBarTs),
    fillPrice: r.fillPrice === null ? null : Number(r.fillPrice),
    closePrice: r.closePrice === null ? null : Number(r.closePrice),
    realisedPnl:
      r.realisedPnl === null ? null : Number(r.realisedPnl),
    status: r.status as PositionStatus,
    exitReason: (r.exitReason ?? null) as ExitReason | null,
    rejectionReason: r.rejectionReason,
    lastEvaluatedAt: Number(r.lastEvaluatedAt),
  };
}

// Open positions = non-terminal (PLANNED, LIVE, FILLED). v0 expects at most
// one per (symbol, timeframe) but the function handles N just in case.
const OPEN_STATES: PositionStatus[] = ["PLANNED", "LIVE", "FILLED"];

export async function loadOpenPositions(
  symbol: string,
  timeframe: Timeframe,
): Promise<PositionRecord[]> {
  const rows = await db
    .select()
    .from(zennyPaperPositions)
    .where(
      and(
        eq(zennyPaperPositions.symbol, symbol),
        eq(zennyPaperPositions.timeframe, timeframe),
      ),
    );
  return rows
    .filter((r) => OPEN_STATES.includes(r.status as PositionStatus))
    .map(fromRow);
}

export async function upsertPosition(p: PositionRecord): Promise<void> {
  const row = toRow(p);
  await db
    .insert(zennyPaperPositions)
    .values(row)
    .onConflictDoUpdate({
      target: zennyPaperPositions.id,
      set: {
        ...row,
        updatedAt: new Date(),
      },
    });
}

export async function listPositions(
  symbol: string,
  timeframe: Timeframe,
  limit: number = 100,
): Promise<PositionRecord[]> {
  const rows = await db
    .select()
    .from(zennyPaperPositions)
    .where(
      and(
        eq(zennyPaperPositions.symbol, symbol),
        eq(zennyPaperPositions.timeframe, timeframe),
      ),
    )
    .limit(limit);
  return rows.map(fromRow);
}

export async function listAllPositions(
  limit: number = 100,
): Promise<PositionRecord[]> {
  const rows = await db.select().from(zennyPaperPositions).limit(limit);
  return rows.map(fromRow);
}

// --- Account conversions ---------------------------------------------------

export interface PaperAccountRow {
  id: string;
  startingEquity: number;
  currentEquity: number;
  peakEquity: number;
  killStatus: KillState;
  drawdownPct: number;
}

const DEFAULT_ACCOUNT_ID = "default";
const DEFAULT_STARTING_EQUITY = 500;

export async function loadAccount(
  id: string = DEFAULT_ACCOUNT_ID,
): Promise<PaperAccountRow> {
  const rows = await db
    .select()
    .from(zennyPaperAccount)
    .where(eq(zennyPaperAccount.id, id));
  if (rows.length === 0) {
    // First run — initialise.
    const init: InsertZennyPaperAccount = {
      id,
      startingEquity: String(DEFAULT_STARTING_EQUITY),
      currentEquity: String(DEFAULT_STARTING_EQUITY),
      peakEquity: String(DEFAULT_STARTING_EQUITY),
      killStatus: "OK",
      drawdownPct: "0",
    };
    await db.insert(zennyPaperAccount).values(init);
    return {
      id,
      startingEquity: DEFAULT_STARTING_EQUITY,
      currentEquity: DEFAULT_STARTING_EQUITY,
      peakEquity: DEFAULT_STARTING_EQUITY,
      killStatus: "OK",
      drawdownPct: 0,
    };
  }
  const r = rows[0];
  return {
    id: r.id,
    startingEquity: Number(r.startingEquity),
    currentEquity: Number(r.currentEquity),
    peakEquity: Number(r.peakEquity),
    killStatus: r.killStatus as KillState,
    drawdownPct: Number(r.drawdownPct),
  };
}

export async function upsertAccount(
  acct: PaperAccountRow,
): Promise<void> {
  await db
    .insert(zennyPaperAccount)
    .values({
      id: acct.id,
      startingEquity: String(acct.startingEquity),
      currentEquity: String(acct.currentEquity),
      peakEquity: String(acct.peakEquity),
      killStatus: acct.killStatus,
      drawdownPct: String(acct.drawdownPct),
    })
    .onConflictDoUpdate({
      target: zennyPaperAccount.id,
      set: {
        currentEquity: String(acct.currentEquity),
        peakEquity: String(acct.peakEquity),
        killStatus: acct.killStatus,
        drawdownPct: String(acct.drawdownPct),
        updatedAt: new Date(),
      },
    });
}

// --- Tick log --------------------------------------------------------------

export async function logTick(input: {
  symbol: string;
  timeframe: Timeframe;
  summary: unknown;
  error?: string;
}): Promise<void> {
  await db.insert(zennyPaperTickLog).values({
    symbol: input.symbol,
    timeframe: input.timeframe,
    summary: input.summary as object,
    error: input.error,
  });
}

// Re-export shape for callers that don't want to import AccountState directly.
export type { AccountState };
