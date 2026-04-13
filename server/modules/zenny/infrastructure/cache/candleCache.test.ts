import { describe, it, expect } from "vitest";
import { CandleCache, mergeCandles } from "./candleCache";
import type { Candle } from "../../../../../shared/zennyTypes";

function mkCandle(openTime: number, close: number): Candle {
  return {
    openTime,
    closeTime: openTime + 86_400_000 - 1,
    open: close,
    high: close,
    low: close,
    close,
    volume: 1000,
  };
}

describe("mergeCandles", () => {
  it("returns existing when incoming empty", () => {
    const a = [mkCandle(1, 100), mkCandle(2, 110)];
    expect(mergeCandles(a, [])).toEqual(a);
  });

  it("merges and sorts by openTime", () => {
    const a = [mkCandle(1, 100), mkCandle(3, 130)];
    const b = [mkCandle(2, 120), mkCandle(4, 140)];
    const merged = mergeCandles(a, b);
    expect(merged.map((c) => c.openTime)).toEqual([1, 2, 3, 4]);
  });

  it("incoming overrides existing on same openTime", () => {
    const a = [mkCandle(1, 100)];
    const b = [mkCandle(1, 999)];
    const merged = mergeCandles(a, b);
    expect(merged).toHaveLength(1);
    expect(merged[0].close).toBe(999);
  });

  it("dedups multiple incoming with same openTime (last wins)", () => {
    const a: Candle[] = [];
    const b = [mkCandle(1, 100), mkCandle(1, 200)];
    const merged = mergeCandles(a, b);
    expect(merged).toHaveLength(1);
    expect(merged[0].close).toBe(200);
  });
});

describe("CandleCache", () => {
  it("returns null on cache miss", () => {
    const cache = new CandleCache();
    expect(cache.read("BTCUSDT", "D", 100)).toBeNull();
  });

  it("returns cached candles after write", () => {
    const cache = new CandleCache();
    const candles = [mkCandle(1, 100), mkCandle(2, 110), mkCandle(3, 120)];
    cache.write("BTCUSDT", "D", candles);
    const read = cache.read("BTCUSDT", "D", 3);
    expect(read).toEqual(candles);
  });

  it("returns null when fewer cached than requested", () => {
    const cache = new CandleCache();
    cache.write("BTCUSDT", "D", [mkCandle(1, 100), mkCandle(2, 110)]);
    expect(cache.read("BTCUSDT", "D", 5)).toBeNull();
  });

  it("returns the most-recent N when more cached than requested", () => {
    const cache = new CandleCache();
    cache.write("BTCUSDT", "D", [
      mkCandle(1, 100),
      mkCandle(2, 110),
      mkCandle(3, 120),
      mkCandle(4, 130),
      mkCandle(5, 140),
    ]);
    const read = cache.read("BTCUSDT", "D", 3);
    expect(read?.map((c) => c.openTime)).toEqual([3, 4, 5]);
  });

  it("isolates cache by symbol and timeframe", () => {
    const cache = new CandleCache();
    cache.write("BTCUSDT", "D", [mkCandle(1, 100)]);
    cache.write("ETHUSDT", "D", [mkCandle(1, 200)]);
    cache.write("BTCUSDT", "1H", [mkCandle(1, 300)]);
    expect(cache.read("BTCUSDT", "D", 1)?.[0].close).toBe(100);
    expect(cache.read("ETHUSDT", "D", 1)?.[0].close).toBe(200);
    expect(cache.read("BTCUSDT", "1H", 1)?.[0].close).toBe(300);
  });

  it("normalises symbol case", () => {
    const cache = new CandleCache();
    cache.write("btcusdt", "D", [mkCandle(1, 100)]);
    expect(cache.read("BTCUSDT", "D", 1)).not.toBeNull();
    expect(cache.read("BtcUsdt", "D", 1)).not.toBeNull();
  });

  it("clear() removes data", () => {
    const cache = new CandleCache();
    cache.write("BTCUSDT", "D", [mkCandle(1, 100)]);
    cache.clear("BTCUSDT", "D");
    expect(cache.read("BTCUSDT", "D", 1)).toBeNull();
  });
});
