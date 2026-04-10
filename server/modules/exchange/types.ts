import type { Candle } from "../strategy/types";

// Exchange adapter interface. Concrete implementations (Binance, Bybit) live
// in sibling files. Swapping exchanges = swapping the implementation; the
// bot runner and strategy engine only see this shape.

export type Timeframe = "1m" | "5m" | "15m" | "1h" | "4h" | "1d";

export interface ExchangeAdapter {
  readonly name: string;

  // Fetch N most recent closed candles for a pair + timeframe. Used by the
  // bot runner on every tick and by the backtest replay.
  fetchCandles(args: {
    symbol: string; // e.g. "BTCUSDT"
    timeframe: Timeframe;
    limit: number;
    endTime?: number; // ms — fetch candles ending at or before this time
  }): Promise<Candle[]>;

  // Last traded price — used as a fallback when candles haven't closed yet.
  fetchPrice(symbol: string): Promise<number>;
}
