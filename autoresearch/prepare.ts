// AUTORESEARCH — one-time setup. The agent does NOT modify this file.
//
// Mirrors Karpathy's prepare.py: download data once, cache to disk, never
// re-fetch. Subsequent runs of train.ts read from the cache so each
// experiment is deterministic and runs in milliseconds without hitting
// Binance.
//
// Usage:
//   npx tsx autoresearch/prepare.ts <SYMBOL> <TIMEFRAME> <LIMIT>
//
// Example:
//   npx tsx autoresearch/prepare.ts CRVUSDT 1h 1000
//
// Output:
//   ~/.cache/phoenix-autoresearch/<SYMBOL>_<TIMEFRAME>_<LIMIT>.json
//
// The cache is keyed by (symbol, timeframe, limit). Re-running with the
// same args is idempotent — already-cached datasets are skipped unless
// you pass --force.

import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { pathToFileURL } from "node:url";

const CACHE_DIR = path.join(os.homedir(), ".cache", "phoenix-autoresearch");
// Production Binance, not testnet — autoresearch needs real market data.
const BINANCE_BASE = "https://api.binance.com";

interface Candle {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
}

interface CachedDataset {
  symbol: string;
  timeframe: string;
  candles: Candle[];
  fetchedAt: string;
  source: string;
}

export function cachePathFor(symbol: string, timeframe: string, limit: number): string {
  return path.join(CACHE_DIR, `${symbol}_${timeframe}_${limit}.json`);
}

export async function loadPreparedCandles(
  symbol: string,
  timeframe: string,
  limit: number
): Promise<Candle[]> {
  const file = cachePathFor(symbol, timeframe, limit);
  const raw = await fs.readFile(file, "utf-8");
  const data = JSON.parse(raw) as CachedDataset;
  return data.candles;
}

async function fetchKlines(
  symbol: string,
  timeframe: string,
  limit: number
): Promise<Candle[]> {
  // Binance allows up to 1000 candles per request. If the user asks for
  // more, paginate backwards using endTime. Most autoresearch runs sit
  // comfortably under 1000 so this is mostly a future-proofing thing.
  const out: Candle[] = [];
  let endTime: number | undefined;
  while (out.length < limit) {
    const want = Math.min(1000, limit - out.length);
    const params = new URLSearchParams({
      symbol,
      interval: timeframe,
      limit: String(want),
    });
    if (endTime) params.set("endTime", String(endTime));

    const url = `${BINANCE_BASE}/api/v3/klines?${params}`;
    const res = await fetch(url);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`binance klines ${res.status}: ${text}`);
    }
    const rows = (await res.json()) as unknown[][];
    if (rows.length === 0) break;
    const batch: Candle[] = rows.map((r) => ({
      openTime: Number(r[0]),
      open: Number(r[1]),
      high: Number(r[2]),
      low: Number(r[3]),
      close: Number(r[4]),
      volume: Number(r[5]),
      closeTime: Number(r[6]),
    }));
    // Prepend so the final array is chronological oldest-first
    out.unshift(...batch);
    if (rows.length < want) break;
    endTime = batch[0].openTime - 1;
  }
  // Sort defensively in case pagination got out of order
  out.sort((a, b) => a.openTime - b.openTime);
  return out;
}

async function main() {
  const [symbolArg, timeframeArg, limitArg, forceArg] = process.argv.slice(2);
  if (!symbolArg || !timeframeArg || !limitArg) {
    console.error(
      "Usage: tsx autoresearch/prepare.ts <SYMBOL> <TIMEFRAME> <LIMIT> [--force]"
    );
    console.error("Example: tsx autoresearch/prepare.ts CRVUSDT 1h 1000");
    process.exit(1);
  }
  const limit = Number(limitArg);
  if (!Number.isFinite(limit) || limit < 50) {
    console.error(`Invalid limit: ${limitArg}. Must be a number >= 50.`);
    process.exit(1);
  }
  const force = forceArg === "--force";

  await fs.mkdir(CACHE_DIR, { recursive: true });
  const file = cachePathFor(symbolArg, timeframeArg, limit);

  if (!force) {
    try {
      await fs.access(file);
      console.log(`Cache hit: ${file}`);
      console.log("Use --force to refetch.");
      return;
    } catch {
      // miss — fall through to fetch
    }
  }

  console.log(`Fetching ${limit} ${timeframeArg} candles for ${symbolArg}...`);
  const candles = await fetchKlines(symbolArg, timeframeArg, limit);
  console.log(`Got ${candles.length} candles.`);
  if (candles.length === 0) {
    console.error("No candles returned. Check symbol and timeframe.");
    process.exit(1);
  }

  const dataset: CachedDataset = {
    symbol: symbolArg,
    timeframe: timeframeArg,
    candles,
    fetchedAt: new Date().toISOString(),
    source: BINANCE_BASE,
  };
  await fs.writeFile(file, JSON.stringify(dataset, null, 2));
  console.log(`Cached to ${file}`);
  console.log(
    `First candle: ${new Date(candles[0].openTime).toISOString()}`
  );
  console.log(
    `Last candle:  ${new Date(candles[candles.length - 1].openTime).toISOString()}`
  );
}

// Only run main when invoked directly, not when imported as a module.
// pathToFileURL handles Windows drive letters and slashes correctly.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
