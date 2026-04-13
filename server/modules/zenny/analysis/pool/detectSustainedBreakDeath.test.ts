import { describe, it, expect } from "vitest";
import { detectSustainedBreakDeath } from "./detectSustainedBreakDeath";
import type { Candle } from "../../../../../shared/zennyTypes";

function mkCandle(close: number, openTime = 0): Candle {
  return {
    openTime,
    closeTime: openTime + 1000,
    open: close - 1,
    close,
    high: close + 1,
    low: close - 2,
    volume: 1000,
  };
}

describe("detectSustainedBreakDeath — RESISTANCE", () => {
  const high = 100;
  const low = 95;
  const type = "RESISTANCE" as const;

  it("returns dead at exactly 3 consecutive closes above", () => {
    const candles = [mkCandle(101), mkCandle(102), mkCandle(103)];
    const r = detectSustainedBreakDeath({
      recentCandles: candles,
      poolWickHigh: high,
      poolWickLow: low,
      poolType: type,
    });
    expect(r.dead).toBe(true);
    expect(r.deathCandleIndex).toBe(2);
  });

  it("returns alive at 2 consecutive (boundary)", () => {
    const candles = [mkCandle(101), mkCandle(102)];
    const r = detectSustainedBreakDeath({
      recentCandles: candles,
      poolWickHigh: high,
      poolWickLow: low,
      poolType: type,
    });
    expect(r.dead).toBe(false);
  });

  it("resets streak on a close back inside", () => {
    // 2 above, 1 inside, 2 above — should NOT die (no 3-in-a-row)
    const candles = [mkCandle(101), mkCandle(102), mkCandle(98), mkCandle(101), mkCandle(102)];
    const r = detectSustainedBreakDeath({
      recentCandles: candles,
      poolWickHigh: high,
      poolWickLow: low,
      poolType: type,
    });
    expect(r.dead).toBe(false);
  });

  it("close exactly at wick_high does NOT count as broken", () => {
    const candles = [mkCandle(100), mkCandle(100), mkCandle(100)];
    const r = detectSustainedBreakDeath({
      recentCandles: candles,
      poolWickHigh: high,
      poolWickLow: low,
      poolType: type,
    });
    expect(r.dead).toBe(false);
  });

  it("custom N=2 fires earlier", () => {
    const candles = [mkCandle(101), mkCandle(102)];
    const r = detectSustainedBreakDeath({
      recentCandles: candles,
      poolWickHigh: high,
      poolWickLow: low,
      poolType: type,
      consecutiveCloses: 2,
    });
    expect(r.dead).toBe(true);
    expect(r.deathCandleIndex).toBe(1);
  });
});

describe("detectSustainedBreakDeath — SUPPORT", () => {
  const high = 100;
  const low = 95;
  const type = "SUPPORT" as const;

  it("dies on 3 consecutive closes below", () => {
    const candles = [mkCandle(94), mkCandle(93), mkCandle(92)];
    const r = detectSustainedBreakDeath({
      recentCandles: candles,
      poolWickHigh: high,
      poolWickLow: low,
      poolType: type,
    });
    expect(r.dead).toBe(true);
  });
});
