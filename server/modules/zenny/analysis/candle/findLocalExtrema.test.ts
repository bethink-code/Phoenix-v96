import { describe, it, expect } from "vitest";
import { findLocalExtrema, isSwingHigh, isSwingLow } from "./findLocalExtrema";
import type { Candle } from "../../../../../shared/zennyTypes";

// Default helper: open=close=midpoint, so bodyTop=bodyBottom=midpoint.
// Tests that need to distinguish body from wick use mkCandleFull below.
function mkCandle(openTime: number, high: number, low: number): Candle {
  const mid = (high + low) / 2;
  return {
    openTime,
    closeTime: openTime + 1000,
    open: mid,
    close: mid,
    high,
    low,
    volume: 1000,
  };
}

// Extended helper for tests that need to set body extremes explicitly.
function mkCandleFull(
  openTime: number,
  open: number,
  high: number,
  low: number,
  close: number,
): Candle {
  return {
    openTime,
    closeTime: openTime + 1000,
    open,
    high,
    low,
    close,
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
    // Body-based: pivot.price = bodyTop = midpoint = (200 + 190) / 2 = 195
    expect(highs[0].price).toBe(195);
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
    // Body-based: pivot.price = bodyBottom = midpoint = (60 + 50) / 2 = 55
    expect(lows[0].price).toBe(55);
  });

  // ─── Body-based pivot detection: the architectural decision ───────────

  it("rejects a tall-wick high if another candle has a taller body", () => {
    // Candle 5 has the tallest WICK (high=300) but a small body (open=close=200).
    // Candle 8 has a smaller wick (high=250) but a much taller body (open=close=240).
    // Wick-based detection would call candle 5 the swing high. Body-based picks
    // neither at index 5 — index 8 wins with the tallest body.
    const candles: Candle[] = [];
    for (let i = 0; i < 17; i++) {
      if (i === 5) {
        // Tall-wick rejection candle: body 200, wick to 300
        candles.push(mkCandleFull(i, 200, 300, 195, 200));
      } else if (i === 8) {
        // Tall-body candle: body 240, wick to 250
        candles.push(mkCandleFull(i, 230, 250, 225, 240));
      } else {
        candles.push(mkCandle(i, 100, 90));
      }
    }
    const highs = findLocalExtrema({ candles, n: 3 }).filter(
      (e) => e.type === "swing_high",
    );
    // Body-based: candle 5 has bodyTop=200, candle 8 has bodyTop=240.
    // Within candle 5's window (i-3..i+3 = 2..8), candle 8 has body 240 > 200,
    // so candle 5 is NOT a swing high. Candle 8's window (5..11) contains
    // candle 5 which has body 200 < 240, so candle 8 IS a swing high.
    expect(highs.map((h) => h.index)).toEqual([8]);
    expect(highs[0].price).toBe(240); // bodyTop of candle 8
  });

  it("rejects a long-tailed hammer at a low if another candle's body is lower", () => {
    // Symmetric case: hammer with long lower wick at index 5 (low=50, body=100)
    // vs. solid down candle at index 8 (low=70, body=80).
    // Wick-based picks candle 5 (lowest wick). Body-based picks candle 8.
    const candles: Candle[] = [];
    for (let i = 0; i < 17; i++) {
      if (i === 5) {
        candles.push(mkCandleFull(i, 105, 110, 50, 100));
      } else if (i === 8) {
        candles.push(mkCandleFull(i, 90, 95, 70, 80));
      } else {
        candles.push(mkCandle(i, 200, 190));
      }
    }
    const lows = findLocalExtrema({ candles, n: 3 }).filter(
      (e) => e.type === "swing_low",
    );
    expect(lows.map((l) => l.index)).toEqual([8]);
    expect(lows[0].price).toBe(80); // bodyBottom of candle 8
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
