import { describe, it, expect } from "vitest";
import { filterBrokenPivots } from "./filterBrokenPivots";
import type { Candle } from "../../../../../shared/zennyTypes";
import type { SwingExtremum } from "../candle/findLocalExtrema";

function mkCandle(index: number, close: number): Candle {
  return {
    openTime: index * 900_000,
    closeTime: index * 900_000 + 900_000,
    open: close,
    close,
    high: close,
    low: close,
    volume: 1000,
  };
}

// Build a contiguous candle chain of `length` candles, all at `defaultClose`,
// then apply overrides. pivot.index must be a real array position into this.
function mkChain(
  length: number,
  defaultClose: number,
  overrides: Record<number, number>,
): Candle[] {
  const out: Candle[] = [];
  for (let i = 0; i < length; i++) {
    out.push(mkCandle(i, overrides[i] ?? defaultClose));
  }
  return out;
}

function mkPivot(
  index: number,
  type: "swing_high" | "swing_low",
  price: number,
): SwingExtremum {
  return {
    index,
    candleOpenTime: index * 900_000,
    price,
    wickPrice: price,
    type,
  };
}

describe("filterBrokenPivots", () => {
  it("removes a swing high that was decisively broken by a later close", () => {
    // 100-candle contiguous chain. Pivot at array index 10. Candle 50 closes
    // at 74_000 = 2.9% above the pivot → break threshold (0.5%) exceeded.
    const candles = mkChain(100, 71_500, { 10: 71_900, 50: 74_000, 99: 74_500 });
    const pivots: SwingExtremum[] = [mkPivot(10, "swing_high", 71_900)];
    const result = filterBrokenPivots({
      pivots,
      candles,
      breakThresholdPct: 0.005,
    });
    expect(result).toHaveLength(0);
  });

  it("keeps a swing high that was tested but not broken", () => {
    // Pivot at 74_700. Later closes top out at 74_900 (0.27% above) — within tolerance.
    const candles = mkChain(100, 74_500, {
      10: 74_700,
      50: 74_900,
      80: 74_850,
      99: 74_700,
    });
    const pivots: SwingExtremum[] = [mkPivot(10, "swing_high", 74_700)];
    const result = filterBrokenPivots({
      pivots,
      candles,
      breakThresholdPct: 0.005,
    });
    expect(result).toHaveLength(1);
  });

  it("removes a swing low that was broken downward", () => {
    const candles = mkChain(100, 70_500, { 10: 70_000, 50: 69_000, 99: 69_500 });
    const pivots: SwingExtremum[] = [mkPivot(10, "swing_low", 70_000)];
    const result = filterBrokenPivots({
      pivots,
      candles,
      breakThresholdPct: 0.005,
    });
    expect(result).toHaveLength(0);
  });

  it("keeps a swing low that held", () => {
    const candles = mkChain(100, 74_500, { 10: 74_184, 50: 74_100, 99: 74_300 });
    const pivots: SwingExtremum[] = [mkPivot(10, "swing_low", 74_184)];
    const result = filterBrokenPivots({
      pivots,
      candles,
      breakThresholdPct: 0.005,
    });
    expect(result).toHaveLength(1);
  });

  it("does not check candles before the pivot index", () => {
    // Candles 0..9 are at 80_000 (way above future pivot) but BEFORE it.
    // Candles 10..99 are at 71_900 (the pivot price, no break).
    const candles: Candle[] = [];
    for (let i = 0; i < 100; i++) {
      candles.push(mkCandle(i, i < 10 ? 80_000 : 71_900));
    }
    const pivots: SwingExtremum[] = [mkPivot(10, "swing_high", 71_900)];
    const result = filterBrokenPivots({
      pivots,
      candles,
      breakThresholdPct: 0.005,
    });
    expect(result).toHaveLength(1);
  });

  it("handles empty input", () => {
    expect(
      filterBrokenPivots({ pivots: [], candles: [], breakThresholdPct: 0.005 }),
    ).toHaveLength(0);
  });

  it("uses default threshold of 0.5% when not specified", () => {
    const candles = mkChain(100, 70_000, { 10: 71_900, 50: 72_300 });
    const pivots: SwingExtremum[] = [mkPivot(10, "swing_high", 71_900)];
    const result = filterBrokenPivots({ pivots, candles });
    expect(result).toHaveLength(0);
  });
});
