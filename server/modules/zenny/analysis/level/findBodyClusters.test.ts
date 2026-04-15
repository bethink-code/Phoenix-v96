import { describe, it, expect } from "vitest";
import { findBodyClusters } from "./findBodyClusters";
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

describe("findBodyClusters", () => {
  it("returns no clusters when candle bodies are scattered", () => {
    const candles: Candle[] = [
      mkCandle(0, 70_000, 70_500, 69_500, 70_400),
      mkCandle(1, 71_000, 71_500, 70_800, 71_300),
      mkCandle(2, 72_000, 72_500, 71_700, 72_200),
      mkCandle(3, 73_000, 73_500, 72_800, 73_400),
    ];
    const result = findBodyClusters({
      candles,
      minTouches: 3,
      tolerancePct: 0.0015,
    });
    expect(result).toHaveLength(0);
  });

  it("finds a 3-touch resistance cluster (body tops converging)", () => {
    // Three candles top at ~$72,400 (within 0.15%), other candles clearly
    // outside tolerance ($72,000 = 0.55% away, well beyond 0.15%).
    const candles: Candle[] = [
      mkCandle(0, 70_000, 70_500, 69_500, 70_200),
      mkCandle(1, 71_000, 72_400, 70_800, 72_400), // body top 72_400
      mkCandle(2, 71_500, 72_000, 71_200, 72_000), // body top 72_000 (clearly outside)
      mkCandle(3, 72_000, 72_410, 71_800, 72_410), // body top 72_410
      mkCandle(4, 71_700, 71_900, 71_500, 71_800), // body top 71_800 (clearly outside)
      mkCandle(5, 72_200, 72_395, 72_000, 72_395), // body top 72_395
    ];
    const result = findBodyClusters({
      candles,
      minTouches: 3,
      tolerancePct: 0.0015,
    });
    const highs = result.filter((r) => r.type === "swing_high");
    expect(highs).toHaveLength(1);
    // Cluster center should be near the mean of {72_400, 72_410, 72_395}
    expect(highs[0].price).toBeGreaterThan(72_390);
    expect(highs[0].price).toBeLessThan(72_415);
    // Anchor at the most recent contributing candle (index 5)
    expect(highs[0].index).toBe(5);
  });

  it("finds a 3-touch support cluster (body bottoms converging)", () => {
    const candles: Candle[] = [
      mkCandle(0, 70_500, 70_700, 69_900, 70_100), // body bottom 70_100
      mkCandle(1, 70_300, 70_500, 70_050, 70_120), // body bottom 70_120
      mkCandle(2, 71_000, 71_500, 70_800, 71_300),
      mkCandle(3, 70_500, 70_700, 70_050, 70_110), // body bottom 70_110
    ];
    const result = findBodyClusters({
      candles,
      minTouches: 3,
      tolerancePct: 0.0015,
    });
    const lows = result.filter((r) => r.type === "swing_low");
    expect(lows).toHaveLength(1);
    expect(lows[0].price).toBeGreaterThan(70_100);
    expect(lows[0].price).toBeLessThan(70_130);
    expect(lows[0].index).toBe(3);
  });

  it("respects minTouches threshold", () => {
    // Only 2 candles cluster — should NOT produce a level when minTouches=3
    const candles: Candle[] = [
      mkCandle(0, 70_000, 70_500, 69_500, 70_400),
      mkCandle(1, 71_000, 72_400, 70_800, 72_400),
      mkCandle(2, 71_500, 72_390, 71_200, 72_390),
      mkCandle(3, 73_000, 73_500, 72_800, 73_400),
    ];
    const result = findBodyClusters({
      candles,
      minTouches: 3,
      tolerancePct: 0.0015,
    });
    expect(result.filter((r) => r.type === "swing_high")).toHaveLength(0);
  });

  it("does not merge bodies separated by more than tolerance", () => {
    // Bodies at 72_000 and 73_000 — way more than 0.15% apart
    const candles: Candle[] = [
      mkCandle(0, 71_500, 72_000, 71_400, 72_000),
      mkCandle(1, 71_600, 72_010, 71_500, 72_010),
      mkCandle(2, 71_700, 72_005, 71_600, 72_005),
      mkCandle(3, 72_500, 73_000, 72_400, 73_000),
      mkCandle(4, 72_600, 73_010, 72_500, 73_010),
      mkCandle(5, 72_700, 73_005, 72_600, 73_005),
    ];
    const result = findBodyClusters({
      candles,
      minTouches: 3,
      tolerancePct: 0.0015,
    });
    const highs = result.filter((r) => r.type === "swing_high");
    expect(highs).toHaveLength(2);
  });

  it("finds both resistance AND support clusters in the same call", () => {
    // For supports: 3 bearish candles whose body bottoms (closes) cluster
    //               at ~70_100, but whose body tops (opens) are spread out
    //               so they DON'T also cluster as resistances.
    // For resistances: 3 candles whose body tops cluster at ~72_400, with
    //                  body bottoms spread out so they don't also cluster
    //                  as supports.
    const candles: Candle[] = [
      mkCandle(0, 70_300, 70_400, 70_050, 70_100), // top 70_300, bottom 70_100
      mkCandle(1, 70_500, 70_600, 70_050, 70_110), // top 70_500, bottom 70_110
      mkCandle(2, 70_700, 70_800, 70_050, 70_115), // top 70_700, bottom 70_115
      mkCandle(3, 72_400, 72_500, 71_500, 71_500), // top 72_400, bottom 71_500
      mkCandle(4, 72_410, 72_500, 71_700, 71_700), // top 72_410, bottom 71_700
      mkCandle(5, 72_395, 72_500, 71_900, 71_900), // top 72_395, bottom 71_900
    ];
    const result = findBodyClusters({
      candles,
      minTouches: 3,
      tolerancePct: 0.0015,
    });
    expect(result.filter((r) => r.type === "swing_high")).toHaveLength(1);
    expect(result.filter((r) => r.type === "swing_low")).toHaveLength(1);
  });

  it("anchors the cluster at the most recent contributing candle", () => {
    const candles: Candle[] = [
      mkCandle(0, 71_500, 72_400, 71_400, 72_400),
      mkCandle(1, 71_600, 71_800, 71_500, 71_700), // doesn't cluster
      mkCandle(2, 71_700, 72_410, 71_600, 72_410),
      mkCandle(3, 71_800, 71_900, 71_750, 71_850), // doesn't cluster
      mkCandle(4, 71_900, 72_405, 71_800, 72_405),
    ];
    const result = findBodyClusters({
      candles,
      minTouches: 3,
      tolerancePct: 0.0015,
    });
    const highs = result.filter((r) => r.type === "swing_high");
    expect(highs).toHaveLength(1);
    expect(highs[0].index).toBe(4); // most recent of {0, 2, 4}
  });

  it("handles empty input", () => {
    expect(findBodyClusters({ candles: [] })).toHaveLength(0);
  });
});
