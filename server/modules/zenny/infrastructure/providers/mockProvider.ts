// MockProvider — in-memory MarketDataProvider for unit tests.
// Pre-load it with candles via setCandles(), then analysis functions that take
// a MarketDataProvider can be tested without any network.

import type { Candle, Timeframe } from "../../../../../shared/zennyTypes";
import type { MarketDataProvider, CandleQuery } from "./providerInterface";

export class MockProvider implements MarketDataProvider {
  readonly name = "mock" as const;
  private candles = new Map<string, Candle[]>();

  private key(symbol: string, timeframe: Timeframe): string {
    return `${symbol.toUpperCase()}|${timeframe}`;
  }

  setCandles(symbol: string, timeframe: Timeframe, candles: Candle[]): void {
    this.candles.set(this.key(symbol, timeframe), [...candles]);
  }

  async getCandles(query: CandleQuery): Promise<Candle[]> {
    const all = this.candles.get(this.key(query.symbol, query.timeframe)) ?? [];
    if (all.length === 0) return [];
    const filtered =
      query.endTimeMs !== undefined
        ? all.filter((c) => c.openTime <= query.endTimeMs!)
        : all;
    return filtered.slice(-query.count);
  }
}
