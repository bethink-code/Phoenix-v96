import { describe, expect, it } from "vitest";
import type { Candle, Timeframe } from "../../../../../shared/zennyTypes";
import {
  classifyBracket,
  classifyDirection,
  computeAgreement,
  computeAngleFor,
  computeDwell,
  computePerBarRegime,
  runWireAnglePass,
  smoothCloses,
  type GannBracket,
  type PerBarRegime,
  type WireAnglePassInfo,
} from "./wireAnglePass";
import type { PassRunInput } from "./types";

function c(i: number, close: number): Candle {
  return {
    openTime: i,
    closeTime: i + 1,
    open: close,
    high: close,
    low: close,
    close,
    volume: 1,
  };
}

function input(closes: number[]): PassRunInput {
  const candles = closes.map((p, i) => c(i, p));
  return {
    levels: [],
    perTfCandles: new Map([["1H", candles]]),
    primaryCandles: candles,
    primaryTimeframe: "1H",
  };
}

// Multi-TF input: caller supplies a closes array per TF. The first TF in
// the entries list is treated as primary.
function multiTfInput(
  primaryTf: Timeframe,
  perTf: Array<[Timeframe, number[]]>,
): PassRunInput {
  const map = new Map<Timeframe, Candle[]>();
  for (const [tf, closes] of perTf) {
    map.set(
      tf,
      closes.map((p, i) => c(i, p)),
    );
  }
  return {
    levels: [],
    perTfCandles: map,
    primaryCandles: map.get(primaryTf) ?? [],
    primaryTimeframe: primaryTf,
  };
}

// Build a raw close series such that, after the [1,2,3,2,1]/9 smoothing,
// the smoothed close N-1 bars ago equals `startClose` and the most recent
// smoothed close equals `startClose * (1 + pctChange/100)`. Lets tests
// reason about the % change the angle pass actually sees, rather than the
// raw % change which the smoothing kernel attenuates.
function rampForSmoothedPct(
  startClose: number,
  pctChange: number,
  N: number,
): number[] {
  const endClose = startClose * (1 + pctChange / 100);
  const slope = (endClose - startClose) / (N - 1);
  const base = startClose - slope * 2;
  const totalRaw = N + 4;
  return Array.from({ length: totalRaw }, (_, i) => base + slope * i);
}

const enabledConfig = {
  enabled: true,
  lookbackCandles: 14,
  dwellBarsRequired: 3,
};

describe("classifyBracket", () => {
  it("uses |angle| for bracket selection", () => {
    expect(classifyBracket(0)).toBe("NO_TRADE");
    expect(classifyBracket(13.99)).toBe("NO_TRADE");
    expect(classifyBracket(-13.99)).toBe("NO_TRADE");
    expect(classifyBracket(14)).toBe("ACCUMULATION");
    expect(classifyBracket(-26.24)).toBe("ACCUMULATION");
    expect(classifyBracket(26.25)).toBe("RANGING");
    expect(classifyBracket(-44.99)).toBe("RANGING");
    expect(classifyBracket(45)).toBe("TRENDING");
    expect(classifyBracket(-63.74)).toBe("TRENDING");
    expect(classifyBracket(63.75)).toBe("BREAKOUT");
    expect(classifyBracket(-89)).toBe("BREAKOUT");
  });
});

describe("classifyDirection", () => {
  it("preserves sign, treats near-zero as flat", () => {
    expect(classifyDirection(10)).toBe("up");
    expect(classifyDirection(-10)).toBe("down");
    expect(classifyDirection(0.4)).toBe("flat");
    expect(classifyDirection(-0.4)).toBe("flat");
    expect(classifyDirection(0)).toBe("flat");
  });
});

describe("smoothCloses", () => {
  it("returns empty for fewer than 5 candles", () => {
    expect(smoothCloses([])).toEqual([]);
    expect(smoothCloses([c(0, 1), c(1, 2), c(2, 3), c(3, 4)])).toEqual([]);
  });

  it("applies the [1,2,3,2,1]/9 kernel", () => {
    // Constant series stays constant — kernel is normalised.
    const flat = [100, 100, 100, 100, 100, 100, 100].map((p, i) => c(i, p));
    const smoothed = smoothCloses(flat);
    expect(smoothed).toHaveLength(3);
    smoothed.forEach((v) => expect(v).toBeCloseTo(100, 6));
  });

  it("reduces length by 4 (2 each side)", () => {
    const ramp = [10, 11, 12, 13, 14, 15, 16, 17, 18].map((p, i) => c(i, p));
    const smoothed = smoothCloses(ramp);
    expect(smoothed).toHaveLength(ramp.length - 4);
  });

  it("smooths anomalous spikes", () => {
    const spike = [100, 100, 200, 100, 100].map((p, i) => c(i, p));
    const smoothed = smoothCloses(spike);
    // Single value: (100 + 2*100 + 3*200 + 2*100 + 100) / 9 = 1200/9 ≈ 133.33
    expect(smoothed).toHaveLength(1);
    expect(smoothed[0]).toBeCloseTo(1200 / 9, 6);
  });
});

describe("runWireAnglePass — primary TF", () => {
  it("returns null when disabled", () => {
    const result = runWireAnglePass(input([100, 101, 102, 103, 104]), {
      enabled: false,
      lookbackCandles: 14,
      dwellBarsRequired: 3,
    });
    expect(result).toBeNull();
  });

  it("returns null when there are too few candles for the lookback window", () => {
    // 14 candle lookback + smoothing buffer (4) = need 18 raw candles minimum.
    const closes = Array.from({ length: 17 }, (_, i) => 100 + i);
    expect(runWireAnglePass(input(closes), enabledConfig)).toBeNull();
  });

  it("computes the spec example: 2.8% over N=14 ≈ 11.31°", () => {
    // From spec §1.2 example. pct_change=2.8, slope=0.2, atan(0.2) ≈ 11.31°.
    const closes = rampForSmoothedPct(100, 2.8, 14);
    const result = runWireAnglePass(input(closes), enabledConfig);
    expect(result).not.toBeNull();
    expect(result!.primary.pctChange).toBeCloseTo(2.8, 5);
    expect(result!.primary.angleDeg).toBeCloseTo(11.31, 1);
    expect(result!.primary.gannBracket).toBe("NO_TRADE");
    expect(result!.primary.tradePermitted).toBe(false);
    expect(result!.primary.direction).toBe("up");
  });

  it("computes the spec TRENDING example: 14% over N=14 → 45°", () => {
    // From spec §1.2 example: pct_change=14, slope=1.0, atan(1) = 45°.
    const closes = rampForSmoothedPct(100, 14, 14);
    const result = runWireAnglePass(input(closes), enabledConfig);
    expect(result).not.toBeNull();
    expect(result!.primary.pctChange).toBeCloseTo(14, 5);
    expect(result!.primary.angleDeg).toBeCloseTo(45, 5);
    expect(result!.primary.gannBracket).toBe("TRENDING");
    expect(result!.primary.tradePermitted).toBe(true);
  });

  it("downtrend produces negative angle, same bracket as positive", () => {
    const closes = rampForSmoothedPct(100, -14, 14);
    const result = runWireAnglePass(input(closes), enabledConfig);
    expect(result).not.toBeNull();
    expect(result!.primary.angleDeg).toBeLessThan(0);
    // -14% over 100 = -14 absolute, slope = -14/100/14 — but pct uses relative
    // base, which is the *prior* close, so result is slightly steeper than 45°.
    expect(Math.abs(result!.primary.angleDeg)).toBeGreaterThan(44);
    expect(Math.abs(result!.primary.angleDeg)).toBeLessThan(50);
    expect(result!.primary.gannBracket).toBe("TRENDING");
    expect(result!.primary.direction).toBe("down");
  });

  it("flat market sits at NO_TRADE with no permitted bracket", () => {
    const closes = Array.from({ length: 30 }, () => 100);
    const result = runWireAnglePass(input(closes), enabledConfig);
    expect(result).not.toBeNull();
    expect(result!.primary.angleDeg).toBe(0);
    expect(result!.primary.gannBracket).toBe("NO_TRADE");
    expect(result!.primary.tradePermitted).toBe(false);
    expect(result!.primary.direction).toBe("flat");
  });

  it("trade permitted only when |angle| ≥ 26.25 (RegimeGuard, spec §2.9)", () => {
    // tan(26.25°) ≈ 0.4931. Need pct = slope × N ≈ 6.903%.
    const justOver = rampForSmoothedPct(100, 7.1, 14);
    const r1 = runWireAnglePass(input(justOver), enabledConfig);
    expect(r1!.primary.tradePermitted).toBe(true);
    expect(r1!.primary.gannBracket).toBe("RANGING");

    const justUnder = rampForSmoothedPct(100, 6.7, 14);
    const r2 = runWireAnglePass(input(justUnder), enabledConfig);
    expect(r2!.primary.tradePermitted).toBe(false);
    expect(r2!.primary.gannBracket).toBe("ACCUMULATION");
  });
});

describe("runWireAnglePass — multi-TF perTimeframe map", () => {
  it("populates one entry per TF with sufficient candles", () => {
    const closes15m = rampForSmoothedPct(100, 14, 14); // TRENDING up
    const closes1H = rampForSmoothedPct(100, 7.1, 14); // RANGING up
    const result = runWireAnglePass(
      multiTfInput("15m", [
        ["15m", closes15m],
        ["1H", closes1H],
      ]),
      enabledConfig,
    );
    expect(result).not.toBeNull();
    expect(Object.keys(result!.perTimeframe).sort()).toEqual(["15m", "1H"]);
    expect(result!.perTimeframe["15m"]!.gannBracket).toBe("TRENDING");
    expect(result!.perTimeframe["1H"]!.gannBracket).toBe("RANGING");
    // primary is just an alias for perTimeframe[primaryTf].
    expect(result!.primary).toEqual(result!.perTimeframe["15m"]);
  });

  it("omits TFs with too few candles instead of failing", () => {
    const enough = rampForSmoothedPct(100, 7.1, 14);
    const tooFew = Array.from({ length: 10 }, (_, i) => 100 + i); // < 18 needed
    const result = runWireAnglePass(
      multiTfInput("1H", [
        ["1H", enough],
        ["4H", tooFew],
      ]),
      enabledConfig,
    );
    expect(result).not.toBeNull();
    expect(result!.perTimeframe["1H"]).toBeDefined();
    expect(result!.perTimeframe["4H"]).toBeUndefined();
  });

  it("returns null when the primary TF itself doesn't have enough candles", () => {
    const tooFew = Array.from({ length: 10 }, (_, i) => 100 + i);
    const enough = rampForSmoothedPct(100, 7.1, 14);
    const result = runWireAnglePass(
      multiTfInput("1H", [
        ["1H", tooFew],
        ["4H", enough],
      ]),
      enabledConfig,
    );
    expect(result).toBeNull();
  });
});

describe("computeAgreement", () => {
  function info(angleDeg: number): WireAnglePassInfo {
    // computeAngleFor would be ideal but we want to control angle directly
    // for boundary-case clarity. Synthesise a result with the right shape.
    return {
      angleDeg,
      gannBracket: classifyBracket(angleDeg),
      direction: classifyDirection(angleDeg),
      tradePermitted: Math.abs(angleDeg) >= 26.25,
      lookback: 14,
      smoothedClose: 100,
      smoothedCloseNAgo: 100,
      pctChange: 0,
    };
  }

  it("all TFs aligned with primary → htfConfirms=yes, ratio=1", () => {
    const primary = info(50); // TRENDING up
    const a = computeAgreement(primary, "15m", {
      "15m": primary,
      "1H": info(35),
      "4H": info(40),
      D: info(60),
    });
    expect(a.totalAnalysed).toBe(4);
    expect(a.matchingDirectionCount).toBe(4);
    expect(a.matchingDirectionRatio).toBe(1);
    expect(a.htfConfirms).toBe("yes");
    // Weakest aligned bracket = lowest-rank bracket among agreeing TFs.
    // 35° = RANGING, 40° = RANGING, 50° = TRENDING, 60° = TRENDING.
    expect(a.weakestAlignedBracket).toBe("RANGING");
    expect(a.alignedTradePermittedCount).toBe(4);
  });

  it("all HTFs opposing primary → htfConfirms=no", () => {
    const primary = info(50); // up
    const a = computeAgreement(primary, "15m", {
      "15m": primary,
      "1H": info(-30),
      "4H": info(-50),
    });
    expect(a.matchingDirectionCount).toBe(1); // primary itself
    expect(a.htfConfirms).toBe("no");
    expect(a.weakestAlignedBracket).toBe("TRENDING"); // only primary
  });

  it("mixed HTFs → htfConfirms=mixed", () => {
    const primary = info(50);
    const a = computeAgreement(primary, "15m", {
      "15m": primary,
      "1H": info(35), // up — agrees
      "4H": info(-30), // down — opposes
    });
    expect(a.htfConfirms).toBe("mixed");
    expect(a.matchingDirectionCount).toBe(2);
  });

  it("no HTFs in the analysed set → htfConfirms=mixed (no opinion)", () => {
    const primary = info(50);
    const a = computeAgreement(primary, "15m", { "15m": primary });
    expect(a.htfConfirms).toBe("mixed");
    expect(a.totalAnalysed).toBe(1);
  });

  it("primary flat → htfConfirms=mixed regardless of HTFs", () => {
    const primary = info(0);
    const a = computeAgreement(primary, "15m", {
      "15m": primary,
      "1H": info(50),
      "4H": info(-50),
    });
    expect(a.htfConfirms).toBe("mixed");
    expect(a.matchingDirectionCount).toBe(0);
    expect(a.weakestAlignedBracket).toBeNull();
  });

  it("flat HTFs are ignored (no opinion) — agreeing+flat reads as yes", () => {
    const primary = info(50);
    const a = computeAgreement(primary, "15m", {
      "15m": primary,
      "1H": info(35), // agrees
      "4H": info(0), // flat → ignored
    });
    expect(a.htfConfirms).toBe("yes");
  });

  it("alignedTradePermittedCount counts only |angle|≥26.25 among aligned", () => {
    const primary = info(50);
    const a = computeAgreement(primary, "15m", {
      "15m": primary, // permitted
      "1H": info(20), // up but ACCUMULATION — aligned, not permitted
      "4H": info(35), // permitted
    });
    expect(a.matchingDirectionCount).toBe(3);
    expect(a.alignedTradePermittedCount).toBe(2);
    // Weakest aligned bracket walks down to ACCUMULATION because of 1H.
    expect(a.weakestAlignedBracket).toBe("ACCUMULATION");
  });
});

describe("computeAngleFor", () => {
  it("matches runWireAnglePass primary on the same candles", () => {
    const closes = rampForSmoothedPct(100, 14, 14);
    const direct = computeAngleFor(
      closes.map((p, i) => c(i, p)),
      14,
    );
    const viaRun = runWireAnglePass(input(closes), enabledConfig);
    expect(direct).toEqual(viaRun!.primary);
  });
});

describe("computePerBarRegime", () => {
  it("returns empty for fewer candles than smoothing + lookback need", () => {
    // Need >= 18 candles (4 chopped + 14 lookback) for a single entry.
    const closes = Array.from({ length: 17 }, (_, i) => 100 + i);
    const candles = closes.map((p, i) => c(i, p));
    expect(computePerBarRegime(candles, 14)).toHaveLength(0);
  });

  it("first entry's candleIndex equals N + 1 (smoothing chops 2 + N-1 lookback)", () => {
    // 30 candles is plenty. First viable smoothed index = N-1 = 13;
    // candle index = 13 + 2 = 15. With N=14 → first candleIndex should be 15.
    const candles = Array.from({ length: 30 }, (_, i) => c(i, 100 + i * 0.5));
    const history = computePerBarRegime(candles, 14);
    expect(history.length).toBeGreaterThan(0);
    expect(history[0].candleIndex).toBe(15);
  });

  it("last entry corresponds to the right edge of the smoothed series", () => {
    // smoothed length = 30 - 4 = 26. Last smoothed index = 25.
    // candle index = 25 + 2 = 27.
    const candles = Array.from({ length: 30 }, (_, i) => c(i, 100 + i * 0.5));
    const history = computePerBarRegime(candles, 14);
    expect(history[history.length - 1].candleIndex).toBe(27);
  });

  it("classifies a strong uptrend ramp as TRENDING/BREAKOUT all the way", () => {
    const closes = rampForSmoothedPct(100, 14, 14); // 45° at the right edge
    const candles = closes.map((p, i) => c(i, p));
    const history = computePerBarRegime(candles, 14);
    expect(history.length).toBe(1); // 18 candles → exactly one entry
    expect(history[0].bracket).toBe("TRENDING");
    expect(history[0].direction).toBe("up");
  });

  it("flat market produces NO_TRADE entries throughout", () => {
    const candles = Array.from({ length: 25 }, (_, i) => c(i, 100));
    const history = computePerBarRegime(candles, 14);
    expect(history.length).toBeGreaterThan(0);
    history.forEach((h) => {
      expect(h.bracket).toBe("NO_TRADE");
      expect(h.direction).toBe("flat");
    });
  });
});

describe("computeDwell", () => {
  // Synthesise a history of bars with explicit brackets and angles so the
  // dwell logic can be tested directly without relying on the smoothing
  // kernel. candleIndex is monotonically increasing but otherwise arbitrary.
  function bars(seq: Array<[GannBracket, number]>): PerBarRegime[] {
    return seq.map(([bracket, angleDeg], i) => ({
      candleIndex: 100 + i,
      angleDeg,
      bracket,
      direction:
        Math.abs(angleDeg) < 0.5 ? "flat" : angleDeg > 0 ? "up" : "down",
    }));
  }

  it("locks immediately when the candidate run already meets dwell", () => {
    const history = bars([
      ["RANGING", 30],
      ["RANGING", 30],
      ["RANGING", 30],
    ]);
    const d = computeDwell(history, 3);
    expect(d.lockedBracket).toBe("RANGING");
    expect(d.candidateBracket).toBe("RANGING");
    expect(d.candidateBarsObserved).toBe(3);
    expect(d.pendingFlip).toBe(false);
    expect(d.lockedTradePermitted).toBe(true);
  });

  it("pendingFlip=true when a new bracket has not yet held for dwell", () => {
    const history = bars([
      ["RANGING", 30],
      ["RANGING", 30],
      ["RANGING", 30],
      ["TRENDING", 50],
    ]);
    const d = computeDwell(history, 3);
    expect(d.lockedBracket).toBe("RANGING"); // previous run still locked
    expect(d.candidateBracket).toBe("TRENDING");
    expect(d.candidateBarsObserved).toBe(1);
    expect(d.pendingFlip).toBe(true);
    expect(d.lockedTradePermitted).toBe(true); // RANGING permits
  });

  it("locked flips once new bracket completes dwell", () => {
    const history = bars([
      ["RANGING", 30],
      ["RANGING", 30],
      ["RANGING", 30],
      ["TRENDING", 50],
      ["TRENDING", 50],
      ["TRENDING", 50],
    ]);
    const d = computeDwell(history, 3);
    expect(d.lockedBracket).toBe("TRENDING");
    expect(d.candidateBracket).toBe("TRENDING");
    expect(d.candidateBarsObserved).toBe(3);
    expect(d.pendingFlip).toBe(false);
  });

  it("brief excursion does not unlock — locked stays at prior bracket", () => {
    // Three bars TRENDING locked → 2 bars dip into RANGING (insufficient
    // dwell) → back to TRENDING. Locked should never have left TRENDING.
    const history = bars([
      ["TRENDING", 50],
      ["TRENDING", 50],
      ["TRENDING", 50],
      ["RANGING", 30],
      ["RANGING", 30],
      ["TRENDING", 50],
    ]);
    const d = computeDwell(history, 3);
    expect(d.lockedBracket).toBe("TRENDING");
    expect(d.candidateBracket).toBe("TRENDING");
    expect(d.candidateBarsObserved).toBe(1);
    // candidate matches locked → not pending
    expect(d.pendingFlip).toBe(false);
  });

  it("dwell of 1 means every bar locks immediately", () => {
    const history = bars([
      ["RANGING", 30],
      ["TRENDING", 50],
    ]);
    const d = computeDwell(history, 1);
    expect(d.lockedBracket).toBe("TRENDING");
    expect(d.candidateBarsObserved).toBe(1);
    expect(d.pendingFlip).toBe(false);
  });

  it("locks NO_TRADE/ACCUMULATION → lockedTradePermitted=false", () => {
    const history = bars([
      ["ACCUMULATION", 20],
      ["ACCUMULATION", 20],
      ["ACCUMULATION", 20],
      ["RANGING", 30],
    ]);
    const d = computeDwell(history, 3);
    expect(d.lockedBracket).toBe("ACCUMULATION");
    expect(d.lockedTradePermitted).toBe(false);
    expect(d.pendingFlip).toBe(true);
  });

  it("history with no qualifying run falls back to candidate as locked", () => {
    // No run ever reaches dwell. The walk falls off the start of the array;
    // locked just stays as the initial candidate value.
    const history = bars([
      ["RANGING", 30],
      ["TRENDING", 50],
      ["RANGING", 30],
    ]);
    const d = computeDwell(history, 3);
    // Last bar is RANGING; no run of length 3 anywhere → locked = candidate.
    expect(d.lockedBracket).toBe("RANGING");
    expect(d.candidateBracket).toBe("RANGING");
    expect(d.pendingFlip).toBe(false);
  });
});

describe("runWireAnglePass — dwell + history integration", () => {
  it("returns primaryHistory aligned to candle indices", () => {
    const closes = rampForSmoothedPct(100, 14, 14);
    const result = runWireAnglePass(input(closes), enabledConfig);
    expect(result).not.toBeNull();
    expect(result!.primaryHistory.length).toBeGreaterThan(0);
    // First entry's candleIndex = N + 1 = 15.
    expect(result!.primaryHistory[0].candleIndex).toBe(15);
  });

  it("primaryDwell exposes locked + candidate state", () => {
    const closes = rampForSmoothedPct(100, 14, 14);
    const result = runWireAnglePass(input(closes), enabledConfig);
    expect(result!.primaryDwell.dwellBarsRequired).toBe(3);
    expect(["NO_TRADE", "ACCUMULATION", "RANGING", "TRENDING", "BREAKOUT"]).toContain(
      result!.primaryDwell.lockedBracket,
    );
    expect(typeof result!.primaryDwell.pendingFlip).toBe("boolean");
  });
});
