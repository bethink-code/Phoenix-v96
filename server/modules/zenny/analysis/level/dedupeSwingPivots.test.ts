import { describe, it, expect } from "vitest";
import { dedupeSwingPivots } from "./dedupeSwingPivots";
import type { SwingExtremum } from "../candle/findLocalExtrema";

function mkPivot(
  index: number,
  type: "swing_high" | "swing_low",
  price: number,
): SwingExtremum {
  return {
    index,
    type,
    price,
    wickPrice: price,
    candleOpenTime: index * 900_000,
  };
}

describe("dedupeSwingPivots", () => {
  it("collapses three near-identical lows into one, keeping the most recent", () => {
    const pivots: SwingExtremum[] = [
      mkPivot(10, "swing_low", 70_000),
      mkPivot(20, "swing_low", 70_100), // 0.14% from 70_000 — within 0.3%
      mkPivot(30, "swing_low", 70_050), // 0.07% from 70_000 — within 0.3%
    ];
    const result = dedupeSwingPivots({
      extrema: pivots,
      tolerancePct: 0.003,
    });
    expect(result).toHaveLength(1);
    expect(result[0].index).toBe(30); // most recent member of the cluster
  });

  it("keeps distinct levels separate when they are outside tolerance", () => {
    const pivots: SwingExtremum[] = [
      mkPivot(10, "swing_low", 70_000),
      mkPivot(20, "swing_low", 71_000), // 1.4% — well outside 0.3%
    ];
    const result = dedupeSwingPivots({
      extrema: pivots,
      tolerancePct: 0.003,
    });
    expect(result).toHaveLength(2);
  });

  it("does not merge across sides even at near-identical prices", () => {
    const pivots: SwingExtremum[] = [
      mkPivot(10, "swing_high", 70_000),
      mkPivot(20, "swing_low", 70_050), // close in price but opposite side
    ];
    const result = dedupeSwingPivots({
      extrema: pivots,
      tolerancePct: 0.003,
    });
    expect(result).toHaveLength(2);
  });

  it("handles empty input", () => {
    expect(
      dedupeSwingPivots({ extrema: [], tolerancePct: 0.003 }),
    ).toHaveLength(0);
  });

  it("returns survivors in chronological order", () => {
    const pivots: SwingExtremum[] = [
      mkPivot(50, "swing_high", 75_000),
      mkPivot(10, "swing_low", 70_000),
      mkPivot(30, "swing_high", 75_500), // within 1% of 75_000 → cluster
    ];
    const result = dedupeSwingPivots({
      extrema: pivots,
      tolerancePct: 0.01,
    });
    expect(result).toHaveLength(2);
    // Cluster {30, 50} → most recent = 50; low at 10 stays
    expect(result.map((p) => p.index)).toEqual([10, 50]);
  });

  it("handles four chopped lows in a tight range (the screenshot case)", () => {
    const pivots: SwingExtremum[] = [
      mkPivot(120, "swing_low", 70_400),
      mkPivot(135, "swing_low", 70_450),
      mkPivot(150, "swing_low", 70_420),
      mkPivot(160, "swing_low", 70_480),
    ];
    const result = dedupeSwingPivots({
      extrema: pivots,
      tolerancePct: 0.003,
    });
    expect(result).toHaveLength(1);
    expect(result[0].index).toBe(160); // freshest
  });
});
