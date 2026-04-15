import { describe, it, expect } from "vitest";
import { findRdpLevels } from "./findRdpLevels";
import type { Candle } from "../../../../../shared/zennyTypes";

function mkCandle(index: number, close: number): Candle {
  return {
    openTime: index * 900_000,
    closeTime: index * 900_000 + 900_000,
    open: close,
    close,
    high: close + 10,
    low: close - 10,
    volume: 1000,
  };
}

function mkSeries(closes: number[]): Candle[] {
  return closes.map((c, i) => mkCandle(i, c));
}

describe("findRdpLevels", () => {
  it("returns empty for very short input", () => {
    expect(findRdpLevels({ candles: [] })).toHaveLength(0);
    expect(findRdpLevels({ candles: [mkCandle(0, 100)] })).toHaveLength(0);
  });

  it("returns all interior points when input length <= targetPoints", () => {
    // 5 input candles → 5 RDP vertices → strip first/last → 3 interior
    const candles = mkSeries([100, 110, 105, 115, 108]);
    const result = findRdpLevels({ candles, targetPoints: 10 });
    expect(result).toHaveLength(3);
  });

  it("finds the peak of a monotonic up-then-down series (endpoints stripped)", () => {
    // Monotonic rise then fall, peak at index 10. RDP returns {0, 10, 20},
    // endpoints stripped → just the peak at 10.
    const closes: number[] = [];
    for (let i = 0; i < 21; i++) {
      closes.push(i <= 10 ? 100 + i * 10 : 100 + (20 - i) * 10);
    }
    const candles = mkSeries(closes);
    const result = findRdpLevels({ candles, targetPoints: 3 });
    expect(result).toHaveLength(1);
    expect(result[0].index).toBe(10);
    expect(result[0].type).toBe("swing_high");
  });

  it("finds the trough of a monotonic down-then-up series (endpoints stripped)", () => {
    // V-shape with minimum at 10. RDP returns {0, 10, 20}, endpoints
    // stripped → just the trough at 10.
    const closes: number[] = [];
    for (let i = 0; i < 21; i++) {
      closes.push(i <= 10 ? 200 - i * 10 : 200 - (20 - i) * 10);
    }
    const candles = mkSeries(closes);
    const result = findRdpLevels({ candles, targetPoints: 3 });
    expect(result).toHaveLength(1);
    expect(result[0].index).toBe(10);
    expect(result[0].type).toBe("swing_low");
  });

  it("labels a sequence of alternating peaks/troughs correctly", () => {
    // Zigzag: up to 50 (peak), down to 30 (trough), up to 55 (peak),
    // down to 25 (trough), up to 60 (peak)
    const closes = [
      20,
      35,
      50, // peak at 2
      45,
      30, // trough at 4
      40,
      55, // peak at 6
      45,
      25, // trough at 8
      40,
      60, // peak at 10
    ];
    const candles = mkSeries(closes);
    const result = findRdpLevels({ candles, targetPoints: 5 });
    // Expect alternating peak/trough/peak/trough/peak
    const types = result.map((r) => r.type);
    // The types should alternate
    for (let i = 1; i < types.length; i++) {
      expect(types[i]).not.toBe(types[i - 1]);
    }
  });

  it("level price equals the close of the swing candle", () => {
    const closes: number[] = [];
    for (let i = 0; i < 21; i++) {
      closes.push(i === 10 ? 200 : 100);
    }
    const candles = mkSeries(closes);
    const result = findRdpLevels({ candles, targetPoints: 3 });
    // With endpoints stripped, only the peak at #10 remains
    expect(result).toHaveLength(1);
    const peak = result[0];
    expect(peak.type).toBe("swing_high");
    expect(peak.price).toBe(200);
    expect(peak.wickPrice).toBe(210);
  });

  it("preserves chronological order", () => {
    const closes = [10, 30, 20, 40, 15, 50, 5];
    const candles = mkSeries(closes);
    const result = findRdpLevels({ candles, targetPoints: 7 });
    for (let i = 1; i < result.length; i++) {
      expect(result[i].index).toBeGreaterThan(result[i - 1].index);
    }
  });

  it("reduces point count roughly to the target on noisy data", () => {
    // 100 points of noise + one big spike at index 50
    const closes: number[] = [];
    for (let i = 0; i < 100; i++) {
      closes.push(i === 50 ? 500 : 100 + Math.sin(i * 0.5) * 3);
    }
    const candles = mkSeries(closes);
    const result = findRdpLevels({ candles, targetPoints: 5 });
    // Spike should definitely survive
    expect(result.some((r) => r.index === 50)).toBe(true);
    // Result should be close to the target (within a few)
    expect(result.length).toBeGreaterThanOrEqual(3);
    expect(result.length).toBeLessThanOrEqual(10);
  });
});
