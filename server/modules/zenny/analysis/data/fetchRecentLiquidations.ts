// Fetch recent Binance liquidation events for a symbol from the DB.
// The binanceLiquidations listener writes events as they stream in; this
// reads them back for the regime layer's liquidationProximity input.
//
// Reads only — no writes. Called by the route handler before runAnalysis
// so the orchestrator stays pure (takes events as input).

import { desc, eq, gte, and } from "drizzle-orm";
import { db } from "../../../../db";
import { binanceLiquidations } from "../../../../../shared/schema";

// What the regime layer needs per liquidation event. Flattened from the
// DB row so the analysis layer doesn't depend on the schema type.
export interface LiquidationEvent {
  price: number;
  usdValue: number;
  eventTimeMs: number;
  positionSide: "LONG" | "SHORT";
}

export interface FetchOptions {
  symbol: string;
  // Lookback window in ms. Default 7 days — recent enough to be relevant
  // for proximity scoring, long enough to accumulate clusters across
  // varied conditions.
  lookbackMs?: number;
  // Cap on rows returned. Liquidation streams can be bursty during
  // crashes; bound to avoid loading 10K+ events for a single tick.
  limit?: number;
}

const DEFAULT_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const DEFAULT_LIMIT = 5000;

export async function fetchRecentLiquidations(
  opts: FetchOptions,
): Promise<LiquidationEvent[]> {
  const lookbackMs = opts.lookbackMs ?? DEFAULT_LOOKBACK_MS;
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const since = new Date(Date.now() - lookbackMs);

  const rows = await db
    .select({
      price: binanceLiquidations.price,
      usdValue: binanceLiquidations.usdValue,
      eventTime: binanceLiquidations.eventTime,
      positionSide: binanceLiquidations.positionSide,
    })
    .from(binanceLiquidations)
    .where(
      and(
        eq(binanceLiquidations.symbol, opts.symbol),
        gte(binanceLiquidations.eventTime, since),
      ),
    )
    .orderBy(desc(binanceLiquidations.eventTime))
    .limit(limit);

  return rows.map((r) => ({
    price: Number(r.price),
    usdValue: Number(r.usdValue),
    eventTimeMs: r.eventTime.getTime(),
    positionSide: r.positionSide as "LONG" | "SHORT",
  }));
}
