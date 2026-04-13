// Fetch historical klines from Binance Futures REST API.
// Uses makeRestRequest under the hood for rate limiting / retries / circuit breaking.
// Returns canonical Candle objects (not raw Binance arrays).

import type { Candle, Timeframe } from "../../../../../../shared/zennyTypes";
import { makeRestRequest, type RestDeps } from "./makeRestRequest";

const BINANCE_FUTURES_BASE = "https://fapi.binance.com";

// Map our canonical timeframe enum to Binance's interval strings.
const TIMEFRAME_TO_BINANCE: Record<Timeframe, string> = {
  "15m": "15m",
  "1H": "1h",
  "4H": "4h",
  "12H": "12h",
  D: "1d",
};

export interface FetchKlinesInput {
  symbol: string;
  timeframe: Timeframe;
  limit: number; // max 1500
  endTimeMs?: number; // optional
}

// Binance returns: [openTime, open, high, low, close, volume, closeTime, ...]
type BinanceKlineRow = [
  number, // 0 openTime
  string, // 1 open
  string, // 2 high
  string, // 3 low
  string, // 4 close
  string, // 5 volume
  number, // 6 closeTime
  string, // 7 quoteAssetVolume
  number, // 8 trades
  string, // 9 takerBuyBaseAssetVolume
  string, // 10 takerBuyQuoteAssetVolume
  string, // 11 ignore
];

export async function fetchKlinesRest(
  input: FetchKlinesInput,
  deps: RestDeps,
): Promise<Candle[]> {
  const interval = TIMEFRAME_TO_BINANCE[input.timeframe];
  const params = new URLSearchParams({
    symbol: input.symbol.toUpperCase(),
    interval,
    limit: String(Math.min(input.limit, 1500)),
  });
  if (input.endTimeMs !== undefined) {
    params.set("endTime", String(input.endTimeMs));
  }
  const url = `${BINANCE_FUTURES_BASE}/fapi/v1/klines?${params.toString()}`;

  // Binance weight: 1 for limit <= 100, 2 for limit <= 500, 5 for limit <= 1000, 10 for >1000
  const weightCost =
    input.limit <= 100 ? 1 : input.limit <= 500 ? 2 : input.limit <= 1000 ? 5 : 10;

  const rows = await makeRestRequest<BinanceKlineRow[]>(
    {
      url,
      method: "GET",
      weightCost,
      endpoint: "GET /fapi/v1/klines",
    },
    deps,
  );

  return rows.map(
    (r): Candle => ({
      openTime: r[0],
      open: parseFloat(r[1]),
      high: parseFloat(r[2]),
      low: parseFloat(r[3]),
      close: parseFloat(r[4]),
      volume: parseFloat(r[5]),
      closeTime: r[6],
    }),
  );
}
