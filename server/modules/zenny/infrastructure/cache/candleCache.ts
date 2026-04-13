// In-memory candle cache, keyed by symbol+timeframe.
// Closed candles are immutable — once cached, served from memory.
// DB-backed persistence is added in Phase 6.

import type { Candle, Timeframe } from "../../../../../shared/zennyTypes";

interface CacheEntry {
  candles: Candle[]; // sorted ascending by openTime
  lastUpdatedMs: number;
}

export class CandleCache {
  private store = new Map<string, CacheEntry>();

  private key(symbol: string, timeframe: Timeframe): string {
    return `${symbol.toUpperCase()}|${timeframe}`;
  }

  // Read up to `count` most-recent candles for the symbol+timeframe.
  // Returns null if nothing cached yet (caller falls back to network).
  read(
    symbol: string,
    timeframe: Timeframe,
    count: number,
  ): Candle[] | null {
    const entry = this.store.get(this.key(symbol, timeframe));
    if (!entry) return null;
    if (entry.candles.length === 0) return null;
    if (entry.candles.length < count) return null; // not enough cached, refetch
    return entry.candles.slice(-count);
  }

  // Write candles. New candles are merged into the cache, dedup by openTime,
  // keeping latest data. Sorted on the way in.
  write(symbol: string, timeframe: Timeframe, newCandles: Candle[]): void {
    const k = this.key(symbol, timeframe);
    const existing = this.store.get(k);
    const merged = mergeCandles(existing?.candles ?? [], newCandles);
    this.store.set(k, {
      candles: merged,
      lastUpdatedMs: Date.now(),
    });
  }

  // Clear cache for a symbol+timeframe (used in tests, recovery)
  clear(symbol: string, timeframe: Timeframe): void {
    this.store.delete(this.key(symbol, timeframe));
  }

  // Return age of cached data
  ageMs(symbol: string, timeframe: Timeframe): number | null {
    const entry = this.store.get(this.key(symbol, timeframe));
    if (!entry) return null;
    return Date.now() - entry.lastUpdatedMs;
  }
}

// Pure helper: merge two sorted candle arrays by openTime.
// New candles override existing entries with the same openTime.
export function mergeCandles(existing: Candle[], incoming: Candle[]): Candle[] {
  if (incoming.length === 0) return existing;
  const byOpenTime = new Map<number, Candle>();
  for (const c of existing) byOpenTime.set(c.openTime, c);
  for (const c of incoming) byOpenTime.set(c.openTime, c);
  return Array.from(byOpenTime.values()).sort((a, b) => a.openTime - b.openTime);
}
