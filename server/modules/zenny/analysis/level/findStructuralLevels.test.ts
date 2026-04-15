import { describe, it, expect } from "vitest";
import { findStructuralLevels } from "./findStructuralLevels";
import type { Candle } from "../../../../../shared/zennyTypes";

function mkCandle(
  index: number,
  open: number,
  high: number,
  low: number,
  close: number,
): Candle {
  return {
    openTime: index * 900_000,
    closeTime: index * 900_000 + 900_000,
    open,
    high,
    low,
    close,
    volume: 1000,
  };
}

// Flat candle — body top == body bottom == the given mid price
function mkFlat(index: number, price: number): Candle {
  return mkCandle(index, price, price + 1, price - 1, price);
}

describe("findStructuralLevels", () => {
  it("returns empty for very short input", () => {
    expect(findStructuralLevels({ candles: [] })).toHaveLength(0);
    expect(findStructuralLevels({ candles: [mkFlat(0, 100)] })).toHaveLength(0);
  });

  it("finds the global maximum as the most prominent peak", () => {
    // Monotonic rise then fall with one clear peak in the middle
    const candles: Candle[] = [];
    for (let i = 0; i < 21; i++) {
      const price = i <= 10 ? 100 + i * 10 : 100 + (20 - i) * 10;
      candles.push(mkFlat(i, price));
    }
    const result = findStructuralLevels({ candles, topPerSide: 1 });
    const highs = result.filter((r) => r.type === "swing_high");
    expect(highs).toHaveLength(1);
    expect(highs[0].index).toBe(10); // the peak
  });

  it("ranks a dramatic peak ABOVE a shallow peak by prominence", () => {
    // Two peaks: one at index 5 with value 200, another at index 15 with value 120.
    // The first is MUCH more prominent.
    const candles: Candle[] = [];
    for (let i = 0; i < 21; i++) {
      let p: number;
      if (i === 5) p = 200;
      else if (i === 15) p = 120;
      else p = 100;
      candles.push(mkFlat(i, p));
    }
    const result = findStructuralLevels({ candles, topPerSide: 1 });
    const highs = result.filter((r) => r.type === "swing_high");
    expect(highs).toHaveLength(1);
    expect(highs[0].index).toBe(5); // the dramatic peak wins
  });

  it("takes top N per side when multiple prominent extrema exist", () => {
    // Chart shape: up-down-up-down-up-down with varying amplitudes
    const prices = [
      100, // 0
      150, // 1 peak (prom 50)
      80, // 2 trough (prom 70)
      200, // 3 peak (prom 120)
      110, // 4 trough (prom 90)
      180, // 5 peak (prom 70)
      90, // 6 trough (prom 90)
      220, // 7 peak (prom ~220 — global max)
      95, // 8 trough (prom ~125 — global min)
      170, // 9 peak
      100, // 10
    ];
    const candles: Candle[] = prices.map((p, i) => mkFlat(i, p));
    const result = findStructuralLevels({ candles, topPerSide: 2 });
    const highs = result.filter((r) => r.type === "swing_high");
    const lows = result.filter((r) => r.type === "swing_low");
    expect(highs).toHaveLength(2);
    expect(lows).toHaveLength(2);
    // The global max (220 at index 7) should be one of the top highs
    expect(highs.some((h) => h.index === 7)).toBe(true);
  });

  it("finds both highs and lows in a single call", () => {
    const candles: Candle[] = [];
    for (let i = 0; i < 21; i++) {
      let price = 100;
      if (i === 5) price = 200; // clear high
      if (i === 15) price = 50; // clear low
      candles.push(mkFlat(i, price));
    }
    const result = findStructuralLevels({ candles, topPerSide: 1 });
    expect(result.filter((r) => r.type === "swing_high")).toHaveLength(1);
    expect(result.filter((r) => r.type === "swing_low")).toHaveLength(1);
  });

  it("prefers body close over wick for the rendered price", () => {
    // Candle 5 has a tall wick (high 300) but body close 150
    const candles: Candle[] = [];
    for (let i = 0; i < 15; i++) {
      if (i === 5) {
        candles.push(mkCandle(i, 140, 300, 135, 150));
      } else {
        candles.push(mkCandle(i, 100, 105, 95, 100));
      }
    }
    const result = findStructuralLevels({ candles, topPerSide: 1 });
    const highs = result.filter((r) => r.type === "swing_high");
    expect(highs).toHaveLength(1);
    expect(highs[0].price).toBe(150); // body close, not wick
    expect(highs[0].wickPrice).toBe(300);
  });

  it("uses body extremes for detection, so a doji cannot be a peak by wick alone", () => {
    // Candle 5 has a tall wick but tiny body (open==close==100), surrounded
    // by candles with higher body tops (open=130, close=130). The doji
    // should NOT be selected as the top peak despite its tall wick.
    const candles: Candle[] = [
      mkCandle(0, 100, 105, 95, 100),
      mkCandle(1, 100, 105, 95, 100),
      mkCandle(2, 130, 135, 125, 130), // body top 130
      mkCandle(3, 130, 135, 125, 130),
      mkCandle(4, 130, 135, 125, 130),
      mkCandle(5, 100, 300, 95, 100), // huge wick but body flat at 100
      mkCandle(6, 130, 135, 125, 130),
      mkCandle(7, 130, 135, 125, 130),
      mkCandle(8, 130, 135, 125, 130),
      mkCandle(9, 100, 105, 95, 100),
      mkCandle(10, 100, 105, 95, 100),
    ];
    const result = findStructuralLevels({ candles, topPerSide: 1 });
    const highs = result.filter((r) => r.type === "swing_high");
    // There might be a high found among the 130-body candles, or none if
    // no strict local max emerges. The key assertion is that the doji at
    // index 5 is NOT selected despite its 300 wick.
    for (const h of highs) {
      expect(h.index).not.toBe(5);
    }
  });
});
