import type { Candle } from "../strategy/types";
import type { ExchangeAdapter, Timeframe } from "./types";

// Binance adapter — REST only for Phase 1. Websocket live data is a Phase 2
// upgrade once the decision loop is proven.
//
// BINANCE_API_BASE_URL points at the testnet in dev and mainnet in prd.
// Public endpoints (klines, ticker) don't need signing; those are the only
// ones we use until real order placement lands.

const TIMEFRAME_MAP: Record<Timeframe, string> = {
  "15m": "15m",
  "1h": "1h",
  "4h": "4h",
  "12h": "12h",
  "1d": "1d",
};

export class BinanceAdapter implements ExchangeAdapter {
  readonly name = "binance";
  private readonly baseUrl: string;

  constructor(baseUrl = process.env.BINANCE_API_BASE_URL ?? "https://testnet.binance.vision") {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async fetchCandles(args: {
    symbol: string;
    timeframe: Timeframe;
    limit: number;
    endTime?: number;
  }): Promise<Candle[]> {
    const params = new URLSearchParams({
      symbol: args.symbol,
      interval: TIMEFRAME_MAP[args.timeframe],
      limit: String(Math.min(1000, args.limit)),
    });
    if (args.endTime) params.set("endTime", String(args.endTime));

    const url = `${this.baseUrl}/api/v3/klines?${params}`;
    const res = await fetch(url);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`binance klines ${res.status}: ${text}`);
    }
    // Binance kline shape:
    // [ openTime, open, high, low, close, volume, closeTime, quoteVolume, trades, ... ]
    const rows = (await res.json()) as unknown[][];
    return rows.map((r) => ({
      openTime: Number(r[0]),
      open: Number(r[1]),
      high: Number(r[2]),
      low: Number(r[3]),
      close: Number(r[4]),
      volume: Number(r[5]),
      closeTime: Number(r[6]),
    }));
  }

  async fetchPrice(symbol: string): Promise<number> {
    const res = await fetch(`${this.baseUrl}/api/v3/ticker/price?symbol=${symbol}`);
    if (!res.ok) throw new Error(`binance ticker ${res.status}`);
    const body = (await res.json()) as { price: string };
    return Number(body.price);
  }

  // Tradable pair listing for the admin registry. Cached for an hour so
  // the admin UI can hit /api/admin/.../symbols freely without hammering
  // the exchange.
  private symbolsCache: SymbolInfo[] | null = null;
  private symbolsCacheAt = 0;

  async fetchSymbols(): Promise<SymbolInfo[]> {
    const now = Date.now();
    if (this.symbolsCache && now - this.symbolsCacheAt < 60 * 60 * 1000) {
      return this.symbolsCache;
    }
    const res = await fetch(`${this.baseUrl}/api/v3/exchangeInfo`);
    if (!res.ok) throw new Error(`binance exchangeInfo ${res.status}`);
    const body = (await res.json()) as {
      symbols: Array<{
        symbol: string;
        status: string;
        baseAsset: string;
        quoteAsset: string;
        filters: Array<{ filterType: string; minQty?: string }>;
      }>;
    };
    const out: SymbolInfo[] = body.symbols
      .filter((s) => s.status === "TRADING")
      .map((s) => ({
        symbol: s.symbol,
        baseAsset: s.baseAsset,
        quoteAsset: s.quoteAsset,
        minQty:
          s.filters.find((f) => f.filterType === "LOT_SIZE")?.minQty ??
          "0.00000001",
      }));
    this.symbolsCache = out;
    this.symbolsCacheAt = now;
    return out;
  }
}

export interface SymbolInfo {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  minQty: string;
}

// Singleton — the adapter is stateless so one instance per process is fine.
let singleton: BinanceAdapter | null = null;
export function getBinance(): BinanceAdapter {
  if (!singleton) singleton = new BinanceAdapter();
  return singleton;
}
