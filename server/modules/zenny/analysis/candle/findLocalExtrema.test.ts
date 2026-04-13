import { describe, it, expect } from "vitest";
import { findLocalExtrema, isSwingHigh, isSwingLow } from "./findLocalExtrema";
import type { Candle } from "../../../../../shared/zennyTypes";

function mkCandle(openTime: number, high: number, low: number): Candle {
  return {
    openTime,
    closeTime: openTime + 1000,
    open: (high + low) / 2,
    close: (high + low) / 2,
    high,
    low,
    volume: 1000,
  };
}

describe("findLocalExtrema", () => {
  it("returns empty when fewer than 2N+1 candles", () => {
    const candles = [mkCandle(1, 100, 90), mkCandle(2, 110, 95)];
    expect(findLocalExtrema({ candles, n: 5 })).toEqual([]);
  });

  it("detects a clear swing high in the centre", () => {
    // 11 candles with peak at index 5
    const candles: Candle[] = [];
    for (let i = 0; i < 11; i++) {
      const h = i === 5 ? 200 : 100 + Math.abs(i - 5);
      candles.push(mkCandle(i, h, h - 10));
    }
    const extrema = findLocalExtrema({ candles, n: 5 });
    const highs = extrema.filter((e) => e.type === "swing_high");
    expect(highs).toHaveLength(1);
    expect(highs[0].index).toBe(5);
    expect(highs[0].price).toBe(200);
  });

  it("detects a clear swing low in the centre", () => {
    const candles: Candle[] = [];
    for (let i = 0; i < 11; i++) {
      const l = i === 5 ? 50 : 100 - Math.abs(i - 5);
      candles.push(mkCandle(i, l + 10, l));
    }
    const extrema = findLocalExtrema({ candles, n: 5 });
    const lows = extrema.filter((e) => e.type === "swing_low");
    expect(lows).toHaveLength(1);
    expect(lows[0].index).toBe(5);
    expect(lows[0].price).toBe(50);
  });

  it("STRICT inequality: equal high disqualifies", () => {
    // Two candles both at 200 — neither is a swing high
    const candles: Candle[] = [];
    for (let i = 0; i < 11; i++) {
      const h = i === 5 || i === 6 ? 200 : 100;
      candles.push(mkCandle(i, h, h - 10));
    }
    const highs = findLocalExtrema({ candles, n: 3 }).filter(
      (e) => e.type === "swing_high",
    );
    expect(highs).toHaveLength(0);
  });

  it("ignores extrema in the leading and trailing N positions", () => {
    // Tall candle at index 0 — outside the valid range
    const candles: Candle[] = [];
    candles.push(mkCandle(0, 999, 990));
    for (let i = 1; i < 11; i++) {
      candles.push(mkCandle(i, 100, 90));
    }
    const highs = findLocalExtrema({ candles, n: 5 }).filter(
      (e) => e.type === "swing_high",
    );
    expect(highs).toHaveLength(0);
  });

  it("detects multiple extrema", () => {
    // Pattern: peak-trough-peak with N=2, 13 candles
    const candles: Candle[] = [];
    for (let i = 0; i < 13; i++) {
      let h = 100;
      let l = 90;
      if (i === 3) {
        h = 150;
        l = 140;
      }
      if (i === 6) {
        h = 80;
        l = 50;
      }
      if (i === 9) {
        h = 160;
        l = 150;
      }
      candles.push(mkCandle(i, h, l));
    }
    const extrema = findLocalExtrema({ candles, n: 2 });
    expect(extrema.filter((e) => e.type === "swing_high")).toHaveLength(2);
    expect(extrema.filter((e) => e.type === "swing_low")).toHaveLength(1);
  });

  it("default N=7 is applied when not specified", () => {
    // 15 candles with peak at 7 — needs N=7 each side
    const candles: Candle[] = [];
    for (let i = 0; i < 15; i++) {
      const h = i === 7 ? 200 : 100;
      candles.push(mkCandle(i, h, h - 10));
    }
    const extrema = findLocalExtrema({ candles });
    expect(extrema.filter((e) => e.type === "swing_high")).toHaveLength(1);
  });
});

describe("isSwingHigh", () => {
  it("returns false out of range", () => {
    const candles = [mkCandle(0, 100, 90), mkCandle(1, 110, 100)];
    expect(isSwingHigh(candles, 0, 5)).toBe(false);
  });
});

describe("isSwingLow", () => {
  it("returns false out of range", () => {
    const candles = [mkCandle(0, 100, 90), mkCandle(1, 110, 100)];
    expect(isSwingLow(candles, 0, 5)).toBe(false);
  });
});
