import { describe, it, expect } from "vitest";
import { detectEngulfingDeath } from "./detectEngulfingDeath";
import type { Candle } from "../../../../../shared/zennyTypes";

function mkCandle(open: number, close: number, high: number, low: number): Candle {
  return {
    openTime: 0,
    closeTime: 1000,
    open,
    close,
    high,
    low,
    volume: 1000,
  };
}

describe("detectEngulfingDeath — RESISTANCE", () => {
  const poolHigh = 100;
  const poolLow = 95;
  const type = "RESISTANCE" as const;

  it("returns true when body engulfs from below to above", () => {
    // open at 90 (below low), close at 105 (above high)
    const candle = mkCandle(90, 105, 106, 89);
    expect(detectEngulfingDeath({ candle, poolWickHigh: poolHigh, poolWickLow: poolLow, poolType: type })).toBe(true);
  });

  it("returns false when only wick pierces (sweep, not death)", () => {
    // open below, close inside the pool — wick pierced but body didn't cross
    const candle = mkCandle(90, 98, 102, 89);
    expect(detectEngulfingDeath({ candle, poolWickHigh: poolHigh, poolWickLow: poolLow, poolType: type })).toBe(false);
  });

  it("returns false when close is exactly at wick_high (boundary)", () => {
    const candle = mkCandle(90, 100, 100, 89);
    expect(detectEngulfingDeath({ candle, poolWickHigh: poolHigh, poolWickLow: poolLow, poolType: type })).toBe(false);
  });

  it("returns false when wrong direction (close below open)", () => {
    const candle = mkCandle(105, 90, 106, 89);
    expect(detectEngulfingDeath({ candle, poolWickHigh: poolHigh, poolWickLow: poolLow, poolType: type })).toBe(false);
  });
});

describe("detectEngulfingDeath — SUPPORT", () => {
  const poolHigh = 100;
  const poolLow = 95;
  const type = "SUPPORT" as const;

  it("returns true when body engulfs from above to below", () => {
    const candle = mkCandle(105, 90, 106, 89);
    expect(detectEngulfingDeath({ candle, poolWickHigh: poolHigh, poolWickLow: poolLow, poolType: type })).toBe(true);
  });

  it("returns false when only wick pierces", () => {
    const candle = mkCandle(105, 98, 106, 92);
    expect(detectEngulfingDeath({ candle, poolWickHigh: poolHigh, poolWickLow: poolLow, poolType: type })).toBe(false);
  });
});
