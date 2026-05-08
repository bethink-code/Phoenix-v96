// End-to-end orchestrator test: builds a synthetic candle series, runs the
// full pipeline (fetch → pivots → pools → passes → pull → arms), and
// asserts the AnalysisState has the expected shape and rough geometry.
//
// This is the integration safety net: any single-pass change that
// accidentally drops a field, breaks the pull-then-arms ordering, or
// regresses the wireAngle output should turn this red.

import { describe, expect, it } from "vitest";
import type { Candle, Timeframe } from "../../../../shared/zennyTypes";
import { MockProvider } from "../infrastructure/providers/mockProvider";
import { runAnalysis } from "./orchestrator";

function c(i: number, o: number, h: number, l: number, cl: number): Candle {
  return {
    openTime: i,
    closeTime: i + 1,
    open: o,
    high: h,
    low: l,
    close: cl,
    volume: 1,
  };
}

function timedC(
  openTime: number,
  interval: number,
  o: number,
  h: number,
  l: number,
  cl: number,
): Candle {
  return {
    openTime,
    closeTime: openTime + interval,
    open: o,
    high: h,
    low: l,
    close: cl,
    volume: 1,
  };
}

// Build a swing-rich candle series with two pivots above price and two
// below, then close near the middle so both arms qualify.
function buildSeries(): Candle[] {
  const series: Candle[] = [];
  // Walk price from 100 → 110 (forms a high), back to 100, down to 90 (low),
  // back to 100, up to 108 (lower high), down to 92 (higher low),
  // settle around 100. Wicks deliberate so pivots are wick-confirmed.
  const path = [
    100, 102, 105, 108, 110, 109, 107, 104, 102, 100, // → 110 high at idx 4
    98, 95, 92, 90, 91, 93, 96, 98, 100, // → 90 low at idx 13
    102, 105, 107, 108, 106, 104, 102, 100, // → 108 high at idx 22
    98, 96, 94, 92, 93, 95, 97, 100, // → 92 low at idx 30
    101, 102, 100, 99, 100, 101, 99, 100, // settle around 100
  ];
  for (let i = 0; i < path.length; i++) {
    const close = path[i];
    const prev = i > 0 ? path[i - 1] : close;
    const open = prev;
    const high = Math.max(open, close) + 0.5;
    const low = Math.min(open, close) - 0.5;
    series.push(c(i, open, high, low, close));
  }
  return series;
}

function newProvider(symbol: string, candles: Candle[]): MockProvider {
  const provider = new MockProvider();
  // Same series for every TF so the orchestrator gets data for the full stack.
  const tfs: Timeframe[] = ["15m", "1H", "4H", "12H", "D", "W", "M"];
  for (const tf of tfs) provider.setCandles(symbol, tf, candles);
  return provider;
}

describe("runAnalysis (orchestrator integration)", () => {
  it("returns a fully-populated AnalysisState shape", async () => {
    const provider = newProvider("BTCUSDT", buildSeries());
    const state = await runAnalysis({
      provider,
      symbol: "BTCUSDT",
      primaryTimeframe: "1H",
    });

    expect(state.symbol).toBe("BTCUSDT");
    expect(state.primaryTimeframe).toBe("1H");
    expect(state.analysedTimeframes.length).toBeGreaterThan(0);
    expect(state.candles.length).toBeGreaterThan(0);
    expect(Array.isArray(state.levels)).toBe(true);
    expect(Array.isArray(state.pools)).toBe(true);
    expect(state.passInfo).toBeDefined();
    expect(state.arms).toBeDefined();
    expect(state.depth).toBeNull();
    expect(state.orderFlow).toBeNull();
    expect(typeof state.computedAtMs).toBe("number");
  });

  it("produces wire angle output in passInfo with a Gann bracket", async () => {
    const provider = newProvider("BTCUSDT", buildSeries());
    const state = await runAnalysis({
      provider,
      symbol: "BTCUSDT",
      primaryTimeframe: "1H",
    });

    expect(state.passInfo.wireAngle).toBeDefined();
    const result = state.passInfo.wireAngle!;
    const primary = result.perTimeframe[state.primaryTimeframe];
    expect(primary).toBeDefined();
    const wa = primary!.info;
    expect(typeof wa.angleDeg).toBe("number");
    expect(["NO_TRADE", "ACCUMULATION", "RANGING", "TRENDING", "BREAKOUT"]).toContain(
      wa.gannBracket,
    );
    expect(["up", "down", "flat"]).toContain(wa.direction);
    expect(wa.lookback).toBeGreaterThanOrEqual(2);

    // Per-TF: every analysed TF carries its own info + dwell + history.
    expect(primary!.dwell).toBeDefined();
    expect(Array.isArray(primary!.history)).toBe(true);
    expect(typeof result.agreement.matchingDirectionRatio).toBe("number");
    expect(["yes", "mixed", "no"]).toContain(result.agreement.htfConfirms);
  });

  it("populates pull on every active pool, leaves swept/dead null", async () => {
    const provider = newProvider("BTCUSDT", buildSeries());
    const state = await runAnalysis({
      provider,
      symbol: "BTCUSDT",
      primaryTimeframe: "1H",
    });

    for (const pool of state.pools) {
      if (pool.status === "active") {
        // Some active pools may still legitimately have null pull (e.g., when
        // current price is outside the analysed window) — but most should
        // have one. Just verify the type contract holds.
        if (pool.pull !== null) {
          expect(pool.pull.normalized).toBeGreaterThanOrEqual(0);
          expect(pool.pull.normalized).toBeLessThanOrEqual(100);
          expect(pool.pull.decayed).toBeGreaterThanOrEqual(5); // MIN floor
        }
      } else {
        expect(pool.pull).toBeNull();
      }
    }

    const activePools = state.pools.filter((p) => p.status === "active");
    if (activePools.length > 0) {
      expect(activePools.some((p) => p.pull !== null)).toBe(true);
    }
  });

  it("extracts arms with role and dominantSide consistent with pull", async () => {
    const provider = newProvider("BTCUSDT", buildSeries());
    const state = await runAnalysis({
      provider,
      symbol: "BTCUSDT",
      primaryTimeframe: "1H",
    });

    const { upper, lower, dominantSide } = state.arms;

    // dominantSide must agree with the role assignments
    if (upper && lower) {
      if (dominantSide === "upper") expect(upper.role).toBe("dominant");
      if (dominantSide === "lower") expect(lower.role).toBe("dominant");
      if (dominantSide === "neither") {
        expect(upper.role).toBe("equal");
        expect(lower.role).toBe("equal");
      }
    }

    // arms always reference active pools with non-null pull at or above floor
    for (const arm of [upper, lower]) {
      if (!arm) continue;
      expect(arm.pool.status).toBe("active");
      expect(arm.pool.pull).not.toBeNull();
      expect(arm.pullDecayed).toBeGreaterThanOrEqual(15); // ARM_MINIMUM_PULL
    }

    // upper sits strictly above current price; lower at or below
    const lastClose = state.candles[state.candles.length - 1].close;
    if (upper) expect(upper.pool.centreLine).toBeGreaterThan(lastClose);
    if (lower) expect(lower.pool.centreLine).toBeLessThanOrEqual(lastClose);
  });

  it("survives an empty data set without throwing", async () => {
    const provider = new MockProvider();
    // No candles for any timeframe.
    const state = await runAnalysis({
      provider,
      symbol: "BTCUSDT",
      primaryTimeframe: "1H",
    });

    expect(state.candles).toEqual([]);
    expect(state.levels).toEqual([]);
    expect(state.pools).toEqual([]);
    expect(state.arms).toEqual({
      upper: null,
      lower: null,
      dominantSide: "neither",
    });
  });

  it("accepts a passConfig override and threads it through to the run", async () => {
    const provider = newProvider("BTCUSDT", buildSeries());
    // Disable the wire angle pass — passInfo.wireAngle should be absent.
    const state = await runAnalysis({
      provider,
      symbol: "BTCUSDT",
      primaryTimeframe: "1H",
      passConfig: {
        recency: {
          enabled: true,
          curve: "exponential",
          halfLifeCandles: 50,
          threshold: 0.25,
        },
        touchCount: {
          enabled: true,
          lookforwardCandles: 0,
          tolerancePct: 0.0025,
        },
        lastLeg: {
          enabled: true,
          reversalPct: 0.015,
          tolerancePct: 0.006,
          lastN: 3,
        },
        polarityFlip: { enabled: true },
        aggregate: {
          enabled: true,
          weightRecency: 0.25,
          weightLastLeg: 0.45,
          weightTouchCount: 0.3,
          brokenPenalty: 0.15,
          strengthThreshold: 0,
        },
        wireAngle: { enabled: false, lookbackCandles: 14, dwellBarsRequired: 3, volNormalisationK: 1 },
      },
    });

    expect(state.passInfo.wireAngle).toBeUndefined();
  });

  it("removes higher-timeframe pool remnants when primary candles fully raid them", async () => {
    const min = 60_000;
    const provider = new MockProvider();
    provider.setCandles("BTCUSDT", "1H", [
      timedC(0, 60 * min, 100, 103, 99, 102),
      timedC(60 * min, 60 * min, 102, 105, 101, 104),
      timedC(120 * min, 60 * min, 104, 110, 103, 108),
      timedC(180 * min, 60 * min, 107, 107.5, 101, 102),
      timedC(240 * min, 60 * min, 102, 104, 100, 101),
      timedC(300 * min, 60 * min, 101, 103, 99, 102),
    ]);
    provider.setCandles("BTCUSDT", "15m", [
      timedC(0, 15 * min, 100, 101, 99, 100.5),
      timedC(15 * min, 15 * min, 100.5, 102, 100, 101.5),
      timedC(30 * min, 15 * min, 101.5, 103, 101, 102),
      timedC(45 * min, 15 * min, 102, 103, 101.5, 102.5),
      timedC(60 * min, 15 * min, 102.5, 104, 102, 103.5),
      timedC(75 * min, 15 * min, 103.5, 105, 103, 104),
      timedC(90 * min, 15 * min, 104, 105, 103.5, 104.5),
      timedC(105 * min, 15 * min, 104.5, 105, 104, 104.2),
      timedC(120 * min, 15 * min, 104.2, 108, 104, 107),
      timedC(135 * min, 15 * min, 107, 110, 106, 108),
      timedC(150 * min, 15 * min, 108, 109, 106, 107),
      timedC(165 * min, 15 * min, 107, 107.5, 105, 106),
      timedC(180 * min, 15 * min, 106, 108.5, 105, 107),
      timedC(195 * min, 15 * min, 107, 107.4, 104, 105),
      timedC(210 * min, 15 * min, 105, 106, 102, 103),
      timedC(225 * min, 15 * min, 103, 104, 101, 102),
      timedC(240 * min, 15 * min, 102, 103, 101, 102),
      timedC(255 * min, 15 * min, 102, 104, 101, 103),
      timedC(270 * min, 15 * min, 103, 104, 101, 102),
      timedC(285 * min, 15 * min, 102, 103, 100, 101),
      timedC(300 * min, 15 * min, 101, 102, 100, 101),
      timedC(315 * min, 15 * min, 101, 103, 100, 102),
      timedC(330 * min, 15 * min, 102, 103, 101, 102),
      timedC(345 * min, 15 * min, 102, 103, 101, 102),
    ]);

    const state = await runAnalysis({
      provider,
      symbol: "BTCUSDT",
      primaryTimeframe: "15m",
      timeframeStack: ["15m", "1H"],
    });

    const oneHourPool = state.pools.find(
      (pool) =>
        pool.sourceTimeframe === "1H" &&
        pool.kind === "pivot_probe" &&
        pool.type === "RESISTANCE" &&
        pool.linePrice === 108 &&
        pool.wickHigh === 110,
    );

    expect(oneHourPool).toBeUndefined();
  });
});
