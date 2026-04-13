// MarketDataProvider — the interface analysis/ depends on.
// Three implementations: BinanceProvider (real), ReplayProvider (historical), MockProvider (test).
// Analysis functions take this interface as a parameter so they're testable without network.

import type { Candle, Timeframe } from "../../../../../shared/zennyTypes";

export interface CandleQuery {
  symbol: string;
  timeframe: Timeframe;
  count: number;
  endTimeMs?: number; // optional: latest candle to include (defaults to "latest available")
}

export interface MarketDataProvider {
  // Fetch historical/recent candles. Closed candles only — current forming candle excluded.
  getCandles(query: CandleQuery): Promise<Candle[]>;

  // Provider name for logging/diagnostics.
  readonly name: "binance" | "replay" | "mock";
}
