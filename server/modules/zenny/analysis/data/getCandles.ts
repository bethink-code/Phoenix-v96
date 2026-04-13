// GetCandles — thin wrapper over MarketDataProvider.
// Pure delegation; analysis subsystems call this rather than importing Binance directly.

import type { Candle, Timeframe } from "../../../../../shared/zennyTypes";
import type {
  CandleQuery,
  MarketDataProvider,
} from "../../infrastructure/providers/providerInterface";

export async function getCandles(
  provider: MarketDataProvider,
  query: CandleQuery,
): Promise<Candle[]> {
  return provider.getCandles(query);
}

export function buildCandleQuery(
  symbol: string,
  timeframe: Timeframe,
  count: number,
  endTimeMs?: number,
): CandleQuery {
  return { symbol, timeframe, count, endTimeMs };
}
