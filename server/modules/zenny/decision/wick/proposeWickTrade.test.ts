import { describe, expect, it } from "vitest";
import type { Candle, Timeframe } from "../../../../../shared/zennyTypes";
import type { ExtractedArms } from "../../analysis/arms/extractArms";
import type { AnalysisPool } from "../../analysis/orchestrator";
import type {
  Playbook,
  TfRegimeAssessment,
} from "../../analysis/regime/types";
import { DEFAULT_WICK_CONFIG } from "./defaultConfig";
import { proposeWickTrade } from "./proposeWickTrade";
import type { WickTradeConfig } from "./types";

// --- Fixtures --------------------------------------------------------------

function pool(opts: {
  id: string;
  type: "RESISTANCE" | "SUPPORT";
  linePrice: number;
  wickHigh: number;
  wickLow: number;
  status?: "active" | "swept" | "dead";
  sweptCandleIndexOnPrimary?: number | null;
}): AnalysisPool {
  return {
    id: opts.id,
    symbol: "BTCUSDT",
    sourceTimeframe: "1H",
    type: opts.type,
    kind: "pivot_probe",
    linePrice: opts.linePrice,
    wickHigh: opts.wickHigh,
    wickLow: opts.wickLow,
    centreLine: (opts.wickHigh + opts.wickLow) / 2,
    birthCandleTime: 0,
    birthCandleIndexOnPrimary: 0,
    sweptCandleTime:
      opts.sweptCandleIndexOnPrimary != null ? 1000 : null,
    sweptCandleIndexOnPrimary: opts.sweptCandleIndexOnPrimary ?? null,
    sweepReason:
      opts.sweptCandleIndexOnPrimary != null ? "wick_took_pool_extreme" : null,
    deathCandleTime: null,
    deathCandleIndexOnPrimary: null,
    deathReason: null,
    status: opts.status ?? "active",
    confluenceCount: 1,
    strength: "strong",
    pull: {
      raw: 50,
      normalized: 80,
      decayed: 60,
      distancePct: 1,
      candlesMovingAway: 0,
      sEffectiveStandIn: 80,
    },
  };
}

function arms(args: {
  upper?: AnalysisPool;
  lower?: AnalysisPool;
  dominantSide: "upper" | "lower" | "neither";
}): ExtractedArms {
  return {
    upper: args.upper
      ? {
          side: "upper",
          pool: args.upper,
          pullDecayed: 60,
          role: args.dominantSide === "upper" ? "dominant" : "subordinate",
        }
      : null,
    lower: args.lower
      ? {
          side: "lower",
          pool: args.lower,
          pullDecayed: 60,
          role: args.dominantSide === "lower" ? "dominant" : "subordinate",
        }
      : null,
    dominantSide: args.dominantSide,
  };
}

function assessment(playbook: Playbook): TfRegimeAssessment {
  const stub = (p: Playbook) => ({
    playbook: p,
    tradeable: p === playbook,
    strength: p === playbook ? 0.7 : 0.2,
    confidence: 0.6,
    reasons: [],
    drivers: [],
  });
  return {
    timeframe: "1H",
    pattern: "RANGING",
    playbooks: {
      accumulation: stub("accumulation"),
      ranging: stub("ranging"),
      trending: stub("trending"),
      breakout: stub("breakout"),
    },
    recommended: { playbook, strength: 0.7 },
    inputs: {
      angle: { available: false, reason: "test" },
      dwell: { available: false, reason: "test" },
      boundaryDistance: { available: false, reason: "test" },
      htfAgreement: { available: false, reason: "test" },
      armPull: { available: false, reason: "test" },
      poolStrength: { available: false, reason: "test" },
      polarityFlips: { available: false, reason: "test" },
      touchQuality: { available: false, reason: "test" },
      recency: { available: false, reason: "test" },
      feedHealth: { available: false, reason: "test" },
      liquidationProximity: { available: false, reason: "test" },
      spread: { available: false, reason: "test" },
      depth: { available: false, reason: "test" },
      ofi: { available: false, reason: "test" },
      volumeDelta: { available: false, reason: "test" },
      cancelPullRatio: { available: false, reason: "test" },
      realizedVolatility: { available: false, reason: "test" },
      tickDensity: { available: false, reason: "test" },
      absorption: { available: false, reason: "test" },
    },
  };
}

// Build a sequence of candles where the LAST candle is the sweep, and any
// candles between sweep and end are confirmation candles. `closeOfSweep` lets
// the test set the sweep candle's close (above/below the line, etc.).
function candles(opts: {
  lengthBeforeSweep: number;
  sweepCandleClose: number;
  postSweepCloses: number[]; // closes for candles AFTER the sweep
  basePrice: number;
}): Candle[] {
  const out: Candle[] = [];
  // Pre-sweep filler.
  for (let i = 0; i < opts.lengthBeforeSweep; i++) {
    out.push({
      open: opts.basePrice,
      high: opts.basePrice,
      low: opts.basePrice,
      close: opts.basePrice,
      openTime: i * 1000,
      closeTime: i * 1000 + 999,
      volume: 1,
    });
  }
  // Sweep candle.
  const sweepIdx = out.length;
  out.push({
    open: opts.basePrice,
    high: opts.basePrice + 10,
    low: opts.basePrice - 10,
    close: opts.sweepCandleClose,
    openTime: sweepIdx * 1000,
    closeTime: sweepIdx * 1000 + 999,
    volume: 1,
  });
  // Post-sweep candles.
  for (let i = 0; i < opts.postSweepCloses.length; i++) {
    const idx = out.length;
    out.push({
      open: opts.basePrice,
      high: opts.basePrice,
      low: opts.basePrice,
      close: opts.postSweepCloses[i],
      openTime: idx * 1000,
      closeTime: idx * 1000 + 999,
      volume: 1,
    });
  }
  return out;
}

// Override DEFAULT_WICK_CONFIG selectively.
function cfg(overrides: Partial<WickTradeConfig> = {}): WickTradeConfig {
  return { ...DEFAULT_WICK_CONFIG, ...overrides };
}

const TF: Timeframe = "1H";

// --- Tests -----------------------------------------------------------------

describe("proposeWickTrade — RANGING + swept RESISTANCE", () => {
  it("midpoint entry: short, entry = (line+wickHigh)/2, stop past wickHigh", () => {
    const upper = pool({
      id: "u",
      type: "RESISTANCE",
      linePrice: 100,
      wickHigh: 106,
      wickLow: 100,
      status: "swept",
      sweptCandleIndexOnPrimary: 4,
    });
    const lower = pool({
      id: "l",
      type: "SUPPORT",
      linePrice: 90,
      wickHigh: 90,
      wickLow: 86,
    });
    // Sweep candle closes at 99 (back below the line) — confirmation present.
    const cs = candles({
      lengthBeforeSweep: 4,
      sweepCandleClose: 99,
      postSweepCloses: [],
      basePrice: 95,
    });
    const plan = proposeWickTrade({
      timeframe: TF,
      candles: cs,
      currentPrice: 99,
      arms: arms({ upper, lower, dominantSide: "upper" }),
      pools: [upper, lower],
      assessment: assessment("ranging"),
    });
    expect(plan).not.toBeNull();
    expect(plan!.side).toBe("short");
    expect(plan!.entry).toBeCloseTo(103, 5); // (100+106)/2
    // buffer = max(0.2% × 99, ATR(14)×0.25). ATR not computable on this short
    // history so falls back to pct = 0.198.
    expect(plan!.stop).toBeCloseTo(106 + 0.198, 2);
    expect(plan!.target).toBe(88); // lower centre = (86+90)/2
    expect(plan!.anchorPoolId).toBe("u");
    expect(plan!.rationale[0]).toMatch(/midpoint/);
  });

  it("fade entries don't fire when pool is still active (matrix without anticipatory)", () => {
    // Active pool means no sweep yet; midpoint and extreme both require
    // a swept pool. Anticipatory removed from the test matrix so we
    // verify only the fade-entry guard.
    const upper = pool({
      id: "u",
      type: "RESISTANCE",
      linePrice: 100,
      wickHigh: 106,
      wickLow: 100,
      status: "active",
    });
    const cs = candles({
      lengthBeforeSweep: 5,
      sweepCandleClose: 100,
      postSweepCloses: [],
      basePrice: 95,
    });
    const plan = proposeWickTrade({
      timeframe: TF,
      candles: cs,
      currentPrice: 99,
      arms: arms({ upper, dominantSide: "upper" }),
      pools: [upper],
      assessment: assessment("ranging"),
      config: cfg({
        regimeMatrix: {
          ...DEFAULT_WICK_CONFIG.regimeMatrix,
          ranging: ["midpoint", "extreme"], // exclude anticipatory for this test
        },
      }),
    });
    expect(plan).toBeNull();
  });

  it("extreme entry honours confirmation gate — close-back-inside present", () => {
    // Force midpoint OFF in the matrix so extreme is the only candidate.
    const upper = pool({
      id: "u",
      type: "RESISTANCE",
      linePrice: 100,
      wickHigh: 106,
      wickLow: 100,
      status: "swept",
      sweptCandleIndexOnPrimary: 4,
    });
    const lower = pool({
      id: "l",
      type: "SUPPORT",
      linePrice: 90,
      wickHigh: 90,
      wickLow: 86,
    });
    const cs = candles({
      lengthBeforeSweep: 4,
      sweepCandleClose: 99, // close BACK below 100
      postSweepCloses: [],
      basePrice: 95,
    });
    const plan = proposeWickTrade({
      timeframe: TF,
      candles: cs,
      currentPrice: 99,
      arms: arms({ upper, lower, dominantSide: "upper" }),
      pools: [upper, lower],
      assessment: assessment("ranging"),
      config: cfg({
        regimeMatrix: { ...DEFAULT_WICK_CONFIG.regimeMatrix, ranging: ["extreme"] },
      }),
    });
    expect(plan).not.toBeNull();
    expect(plan!.entry).toBe(106); // wickHigh
  });

  it("extreme entry blocked when no close-back-inside within window", () => {
    const upper = pool({
      id: "u",
      type: "RESISTANCE",
      linePrice: 100,
      wickHigh: 106,
      wickLow: 100,
      status: "swept",
      sweptCandleIndexOnPrimary: 4,
    });
    // Sweep close ABOVE the line — no confirmation. Post-sweep candle also above.
    const cs = candles({
      lengthBeforeSweep: 4,
      sweepCandleClose: 102,
      postSweepCloses: [101],
      basePrice: 95,
    });
    const plan = proposeWickTrade({
      timeframe: TF,
      candles: cs,
      currentPrice: 101,
      arms: arms({ upper, dominantSide: "upper" }),
      pools: [upper],
      assessment: assessment("ranging"),
      config: cfg({
        regimeMatrix: { ...DEFAULT_WICK_CONFIG.regimeMatrix, ranging: ["extreme"] },
      }),
    });
    expect(plan).toBeNull();
  });
});

describe("proposeWickTrade — quality vetoes", () => {
  it("returns null when the target is too small relative to the stop", () => {
    const lower = pool({
      id: "l",
      type: "SUPPORT",
      linePrice: 100.2,
      wickHigh: 100.8,
      wickLow: 100,
      status: "active",
    });
    const plan = proposeWickTrade({
      timeframe: TF,
      candles: candles({
        lengthBeforeSweep: 5,
        sweepCandleClose: 100.3,
        postSweepCloses: [],
        basePrice: 100.3,
      }),
      currentPrice: 100.3,
      arms: arms({ lower, dominantSide: "lower" }),
      pools: [lower],
      assessment: assessment("ranging"),
    });
    expect(plan).toBeNull();
  });
});

describe("proposeWickTrade — SUPPORT mirrors RESISTANCE", () => {
  it("midpoint entry on swept SUPPORT → long, entry = (wickLow+line)/2", () => {
    const lower = pool({
      id: "l",
      type: "SUPPORT",
      linePrice: 100,
      wickHigh: 100,
      wickLow: 94,
      status: "swept",
      sweptCandleIndexOnPrimary: 4,
    });
    const upper = pool({
      id: "u",
      type: "RESISTANCE",
      linePrice: 110,
      wickHigh: 114,
      wickLow: 110,
    });
    const cs = candles({
      lengthBeforeSweep: 4,
      sweepCandleClose: 101, // close back above 100
      postSweepCloses: [],
      basePrice: 105,
    });
    const plan = proposeWickTrade({
      timeframe: TF,
      candles: cs,
      currentPrice: 101,
      arms: arms({ upper, lower, dominantSide: "lower" }),
      pools: [upper, lower],
      assessment: assessment("ranging"),
    });
    expect(plan).not.toBeNull();
    expect(plan!.side).toBe("long");
    expect(plan!.entry).toBe(97); // (94+100)/2
    expect(plan!.target).toBe(112); // upper centre
  });
});

describe("proposeWickTrade — ANTICIPATORY", () => {
  it("anticipatory entry fires on TRENDING + active pool", () => {
    const upper = pool({
      id: "u",
      type: "RESISTANCE",
      linePrice: 100,
      wickHigh: 106,
      wickLow: 100,
      status: "active",
    });
    const lower = pool({
      id: "l",
      type: "SUPPORT",
      linePrice: 90,
      wickHigh: 90,
      wickLow: 86,
    });
    const cs = candles({
      lengthBeforeSweep: 5,
      sweepCandleClose: 95,
      postSweepCloses: [],
      basePrice: 95,
    });
    const plan = proposeWickTrade({
      timeframe: TF,
      candles: cs,
      currentPrice: 95,
      arms: arms({ upper, lower, dominantSide: "upper" }),
      pools: [upper, lower],
      assessment: assessment("trending"),
    });
    expect(plan).not.toBeNull();
    expect(plan!.side).toBe("short");
    // Entry is below wickHigh by 1.5 × buffer (default fixed-buffer rule).
    // buffer = 0.2% × 95 = 0.19; offset = 1.5 × 0.19 = 0.285.
    expect(plan!.entry).toBeCloseTo(106 - 0.285, 2);
    expect(plan!.sizeMultiplier).toBe(0.5);
  });

  it("anticipatory blocked by requireTrendingRegime when explicitly opted in", () => {
    // Updated 2026-05-09: regimeMatrix is now the authoritative gate.
    // requireTrendingRegime defaults to false (the matrix selects which
    // regimes allow anticipatory). This test verifies the legacy
    // requireTrendingRegime flag still works when explicitly set true.
    const upper = pool({
      id: "u",
      type: "RESISTANCE",
      linePrice: 100,
      wickHigh: 106,
      wickLow: 100,
      status: "active",
    });
    const plan = proposeWickTrade({
      timeframe: TF,
      candles: candles({
        lengthBeforeSweep: 5,
        sweepCandleClose: 95,
        postSweepCloses: [],
        basePrice: 95,
      }),
      currentPrice: 95,
      arms: arms({ upper, dominantSide: "upper" }),
      pools: [upper],
      assessment: assessment("ranging"),
      config: cfg({
        regimeMatrix: {
          ...DEFAULT_WICK_CONFIG.regimeMatrix,
          ranging: ["anticipatory"],
        },
        anticipatory: {
          ...DEFAULT_WICK_CONFIG.anticipatory,
          requireTrendingRegime: true, // explicit opt-in to legacy behavior
        },
      }),
    });
    expect(plan).toBeNull();
  });

  it("anticipatory disabled by config returns null", () => {
    const upper = pool({
      id: "u",
      type: "RESISTANCE",
      linePrice: 100,
      wickHigh: 106,
      wickLow: 100,
      status: "active",
    });
    const plan = proposeWickTrade({
      timeframe: TF,
      candles: candles({
        lengthBeforeSweep: 5,
        sweepCandleClose: 95,
        postSweepCloses: [],
        basePrice: 95,
      }),
      currentPrice: 95,
      arms: arms({ upper, dominantSide: "upper" }),
      pools: [upper],
      assessment: assessment("trending"),
      config: cfg({
        anticipatory: { ...DEFAULT_WICK_CONFIG.anticipatory, enabled: false },
      }),
    });
    expect(plan).toBeNull();
  });
});

describe("proposeWickTrade — BEYOND has wider stop", () => {
  it("beyond entry stop is stopMultiplier × buffer past wick", () => {
    const upper = pool({
      id: "u",
      type: "RESISTANCE",
      linePrice: 100,
      wickHigh: 106,
      wickLow: 100,
      status: "swept",
      sweptCandleIndexOnPrimary: 4,
    });
    const lower = pool({
      id: "l",
      type: "SUPPORT",
      linePrice: 90,
      wickHigh: 90,
      wickLow: 86,
    });
    const cs = candles({
      lengthBeforeSweep: 4,
      sweepCandleClose: 99,
      postSweepCloses: [],
      basePrice: 95,
    });
    const plan = proposeWickTrade({
      timeframe: TF,
      candles: cs,
      currentPrice: 99,
      arms: arms({ upper, lower, dominantSide: "upper" }),
      pools: [upper, lower],
      assessment: assessment("ranging"),
      config: cfg({
        regimeMatrix: { ...DEFAULT_WICK_CONFIG.regimeMatrix, ranging: ["beyond"] },
      }),
    });
    expect(plan).not.toBeNull();
    // buffer = 0.198; stop = 106 + 2 × 0.198 = 106.396.
    expect(plan!.stop).toBeCloseTo(106 + 2 * 0.198, 2);
    expect(plan!.entry).toBeCloseTo(106 + 0.198, 2);
  });
});

describe("proposeWickTrade — guards", () => {
  it("returns null when regime has no recommended playbook", () => {
    const upper = pool({
      id: "u",
      type: "RESISTANCE",
      linePrice: 100,
      wickHigh: 106,
      wickLow: 100,
    });
    const a = assessment("ranging");
    a.recommended = null;
    const plan = proposeWickTrade({
      timeframe: TF,
      candles: candles({
        lengthBeforeSweep: 5,
        sweepCandleClose: 99,
        postSweepCloses: [],
        basePrice: 95,
      }),
      currentPrice: 99,
      arms: arms({ upper, dominantSide: "upper" }),
      pools: [upper],
      assessment: a,
    });
    expect(plan).toBeNull();
  });

  it("returns null when no dominant arm exists", () => {
    const plan = proposeWickTrade({
      timeframe: TF,
      candles: candles({
        lengthBeforeSweep: 5,
        sweepCandleClose: 99,
        postSweepCloses: [],
        basePrice: 95,
      }),
      currentPrice: 99,
      arms: arms({ dominantSide: "neither" }),
      pools: [],
      assessment: assessment("ranging"),
    });
    expect(plan).toBeNull();
  });

  it("returns null when sweep is too old", () => {
    const upper = pool({
      id: "u",
      type: "RESISTANCE",
      linePrice: 100,
      wickHigh: 106,
      wickLow: 100,
      status: "swept",
      sweptCandleIndexOnPrimary: 0, // bar 0
    });
    // 10 bars after the sweep — past maxBarsSinceSweep (default 5).
    const cs = candles({
      lengthBeforeSweep: 0, // sweep is bar 0
      sweepCandleClose: 99,
      postSweepCloses: [99, 99, 99, 99, 99, 99, 99, 99, 99, 99],
      basePrice: 95,
    });
    const plan = proposeWickTrade({
      timeframe: TF,
      candles: cs,
      currentPrice: 99,
      arms: arms({ upper, dominantSide: "upper" }),
      pools: [upper],
      assessment: assessment("ranging"),
    });
    expect(plan).toBeNull();
  });
});
