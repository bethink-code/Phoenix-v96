import { describe, expect, it } from "vitest";
import type { Candle, Timeframe } from "../../../../../shared/zennyTypes";
import type { ExtractedArms } from "../../analysis/arms/extractArms";
import type { AnalysisPool } from "../../analysis/orchestrator";
import type {
  Playbook,
  TfRegimeAssessment,
} from "../../analysis/regime/types";
import { DEFAULT_REACH_CONFIG } from "./defaultConfig";
import { proposeReachTrade } from "./proposeReachTrade";
import type { ReachTradeConfig } from "./types";

const TF: Timeframe = "15m";

function pool(opts: {
  id: string;
  type: "RESISTANCE" | "SUPPORT";
  linePrice: number;
  wickHigh: number;
  wickLow: number;
}): AnalysisPool {
  return {
    id: opts.id,
    symbol: "BTCUSDT",
    sourceTimeframe: "15m",
    type: opts.type,
    kind: "pivot_probe",
    linePrice: opts.linePrice,
    wickHigh: opts.wickHigh,
    wickLow: opts.wickLow,
    centreLine: (opts.wickHigh + opts.wickLow) / 2,
    birthCandleTime: 0,
    birthCandleIndexOnPrimary: 0,
    sweptCandleTime: null,
    sweptCandleIndexOnPrimary: null,
    sweepReason: null,
    deathCandleTime: null,
    deathCandleIndexOnPrimary: null,
    deathReason: null,
    status: "active",
    confluenceCount: 1,
    strength: "strong",
    pull: null,
  };
}

function arm(side: "upper" | "lower", p: AnalysisPool, pull: number) {
  return {
    side,
    pool: p,
    pullDecayed: pull,
    role: "dominant" as const,
  };
}

function arms(args: {
  upper?: { pool: AnalysisPool; pull: number };
  lower?: { pool: AnalysisPool; pull: number };
  dominant: "upper" | "lower" | "neither";
}): ExtractedArms {
  return {
    upper: args.upper
      ? { ...arm("upper", args.upper.pool, args.upper.pull), role: args.dominant === "upper" ? "dominant" : "subordinate" }
      : null,
    lower: args.lower
      ? { ...arm("lower", args.lower.pool, args.lower.pull), role: args.dominant === "lower" ? "dominant" : "subordinate" }
      : null,
    dominantSide: args.dominant,
  };
}

function assessment(
  direction: "up" | "down" | "flat",
  playbook: Playbook = "trending",
): TfRegimeAssessment {
  const stub = (p: Playbook) => ({
    playbook: p,
    tradeable: p === playbook,
    strength: p === playbook ? 0.7 : 0.2,
    confidence: 0.6,
    reasons: [],
    drivers: [],
  });
  return {
    timeframe: TF,
    pattern: "TRENDING",
    playbooks: {
      accumulation: stub("accumulation"),
      ranging: stub("ranging"),
      trending: stub("trending"),
      breakout: stub("breakout"),
    },
    recommended: { playbook, strength: 0.7 },
    inputs: {
      angle: { available: true, value: { angleDeg: 50, bracket: "TRENDING", direction } },
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

// Build candles with constant true range so ATR is predictable.
function trCandles(count: number, basePrice: number, range: number): Candle[] {
  return Array.from({ length: count }, (_, i) => ({
    open: basePrice,
    high: basePrice + range / 2,
    low: basePrice - range / 2,
    close: basePrice,
    openTime: i * 60_000,
    closeTime: i * 60_000 + 59_999,
    volume: 1,
  }));
}

function cfg(overrides: Partial<ReachTradeConfig> = {}): ReachTradeConfig {
  return { ...DEFAULT_REACH_CONFIG, ...overrides };
}

// --- tests -----------------------------------------------------------------

describe("proposeReachTrade — happy paths", () => {
  it("long REACH: dominant upper pool, pull asymmetry > 2, direction up → fires", () => {
    const upperP = pool({
      id: "u",
      type: "RESISTANCE",
      linePrice: 110,
      wickHigh: 115,
      wickLow: 108,
    });
    const lowerP = pool({
      id: "l",
      type: "SUPPORT",
      linePrice: 95,
      wickHigh: 96,
      wickLow: 92,
    });
    const candles = trCandles(20, 100, 2);
    const plan = proposeReachTrade({
      timeframe: TF,
      candles,
      currentPrice: 100,
      arms: arms({
        upper: { pool: upperP, pull: 100 },
        lower: { pool: lowerP, pull: 30 },
        dominant: "upper",
      }),
      pools: [upperP, lowerP],
      assessment: assessment("up"),
    });
    expect(plan).not.toBeNull();
    expect(plan!.phase).toBe("reach");
    expect(plan!.side).toBe("long");
    expect(plan!.target).toBe(upperP.centreLine); // pool centre
    expect(plan!.anchorPoolId).toBe("u");
    // Stop should be below entry (long), past lower wick - buffer.
    expect(plan!.stop).toBeLessThan(plan!.entry);
    expect(plan!.stop).toBeLessThanOrEqual(lowerP.wickLow);
    // target2 (TP1) should be between entry and target.
    expect(plan!.target2).toBeGreaterThan(plan!.entry);
    expect(plan!.target2).toBeLessThan(plan!.target);
  });

  it("short REACH: mirror — dominant lower, direction down", () => {
    const lowerP = pool({
      id: "l",
      type: "SUPPORT",
      linePrice: 90,
      wickHigh: 92,
      wickLow: 85,
    });
    const upperP = pool({
      id: "u",
      type: "RESISTANCE",
      linePrice: 105,
      wickHigh: 108,
      wickLow: 104,
    });
    const candles = trCandles(20, 100, 2);
    const plan = proposeReachTrade({
      timeframe: TF,
      candles,
      currentPrice: 100,
      arms: arms({
        upper: { pool: upperP, pull: 30 },
        lower: { pool: lowerP, pull: 100 },
        dominant: "lower",
      }),
      pools: [lowerP, upperP],
      assessment: assessment("down"),
    });
    expect(plan).not.toBeNull();
    expect(plan!.side).toBe("short");
    expect(plan!.target).toBe(lowerP.centreLine);
    expect(plan!.stop).toBeGreaterThan(plan!.entry);
  });
});

describe("proposeReachTrade — guards (return null)", () => {
  const upperP = pool({
    id: "u",
    type: "RESISTANCE",
    linePrice: 110,
    wickHigh: 115,
    wickLow: 108,
  });
  const lowerP = pool({
    id: "l",
    type: "SUPPORT",
    linePrice: 95,
    wickHigh: 96,
    wickLow: 92,
  });
  const candles = trCandles(20, 100, 2);

  it("asymmetry below threshold → null", () => {
    const plan = proposeReachTrade({
      timeframe: TF,
      candles,
      currentPrice: 100,
      arms: arms({
        upper: { pool: upperP, pull: 50 },
        lower: { pool: lowerP, pull: 40 },
        dominant: "upper",
      }),
      pools: [upperP, lowerP],
      assessment: assessment("up"),
    });
    expect(plan).toBeNull();
  });

  it("direction not aligned → null", () => {
    const plan = proposeReachTrade({
      timeframe: TF,
      candles,
      currentPrice: 100,
      arms: arms({
        upper: { pool: upperP, pull: 100 },
        lower: { pool: lowerP, pull: 30 },
        dominant: "upper",
      }),
      pools: [upperP, lowerP],
      assessment: assessment("down"), // dominant upper but trend down — conflict
    });
    expect(plan).toBeNull();
  });

  it("conflict zone (price near pool centre) → null", () => {
    // ATR = 2 (constant TR). conflictZoneAtr = 1.0 → 2.0 distance gate.
    // currentPrice 110 is exactly at the pool centre → distance 0 < 2.
    const plan = proposeReachTrade({
      timeframe: TF,
      candles,
      currentPrice: 110, // = pool centre
      arms: arms({
        upper: { pool: upperP, pull: 100 },
        lower: { pool: lowerP, pull: 30 },
        dominant: "upper",
      }),
      pools: [upperP, lowerP],
      assessment: assessment("up"),
    });
    expect(plan).toBeNull();
  });

  it("no arms → null", () => {
    const plan = proposeReachTrade({
      timeframe: TF,
      candles,
      currentPrice: 100,
      arms: arms({ dominant: "neither" }),
      pools: [],
      assessment: assessment("up"),
    });
    expect(plan).toBeNull();
  });
});

describe("proposeReachTrade — playbook gating", () => {
  it("ranging playbook → null even when continuation geometry exists", () => {
    const upperP = pool({
      id: "u",
      type: "RESISTANCE",
      linePrice: 110,
      wickHigh: 115,
      wickLow: 108,
    });
    const lowerP = pool({
      id: "l",
      type: "SUPPORT",
      linePrice: 95,
      wickHigh: 96,
      wickLow: 92,
    });
    const candles = trCandles(20, 100, 2);
    const plan = proposeReachTrade({
      timeframe: TF,
      candles,
      currentPrice: 100,
      arms: arms({
        upper: { pool: upperP, pull: 100 },
        lower: { pool: lowerP, pull: 30 },
        dominant: "upper",
      }),
      pools: [upperP, lowerP],
      assessment: assessment("up", "ranging"),
    });
    expect(plan).toBeNull();
  });
});

describe("proposeReachTrade — config knobs", () => {
  it("requireDirectionAlignment=false skips angle check", () => {
    const upperP = pool({
      id: "u",
      type: "RESISTANCE",
      linePrice: 110,
      wickHigh: 115,
      wickLow: 108,
    });
    const lowerP = pool({
      id: "l",
      type: "SUPPORT",
      linePrice: 95,
      wickHigh: 96,
      wickLow: 92,
    });
    const candles = trCandles(20, 100, 2);
    const plan = proposeReachTrade({
      timeframe: TF,
      candles,
      currentPrice: 100,
      arms: arms({
        upper: { pool: upperP, pull: 100 },
        lower: { pool: lowerP, pull: 30 },
        dominant: "upper",
      }),
      pools: [upperP, lowerP],
      assessment: assessment("flat"), // would normally block
      config: cfg({ requireDirectionAlignment: false }),
    });
    expect(plan).not.toBeNull();
  });
});
