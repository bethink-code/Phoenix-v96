import { describe, expect, it } from "vitest";
import type { Timeframe } from "../../../../shared/zennyTypes";
import type { ExtractedArms } from "../analysis/arms/extractArms";
import type { AnalysisPool } from "../analysis/orchestrator";
import type {
  Playbook,
  TfRegimeAssessment,
} from "../analysis/regime/types";
import {
  proposeAccumulationTrade,
  proposeBreakoutTrade,
  proposeRangingTrade,
  proposeTrendingTrade,
} from "./proposeTradePlan";
import type { ProposalContext } from "./types";

// --- Fixtures --------------------------------------------------------------

function pool(opts: {
  id: string;
  type: "RESISTANCE" | "SUPPORT";
  centreLine: number;
  wickHigh: number;
  wickLow: number;
}): AnalysisPool {
  return {
    id: opts.id,
    symbol: "BTCUSDT",
    sourceTimeframe: "1H",
    type: opts.type,
    kind: "pivot_probe",
    linePrice: opts.centreLine,
    wickHigh: opts.wickHigh,
    wickLow: opts.wickLow,
    centreLine: opts.centreLine,
    birthCandleTime: 0,
    birthCandleIndexOnPrimary: 50,
    sweptCandleTime: null,
    sweptCandleIndexOnPrimary: null,
    sweepReason: null,
    deathCandleTime: null,
    deathCandleIndexOnPrimary: null,
    deathReason: null,
    status: "active",
    confluenceCount: 3,
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
  upperPull?: number;
  lower?: AnalysisPool;
  lowerPull?: number;
  dominantSide: "upper" | "lower" | "neither";
}): ExtractedArms {
  return {
    upper: args.upper
      ? {
          side: "upper",
          pool: args.upper,
          pullDecayed: args.upperPull ?? 50,
          role: args.dominantSide === "upper" ? "dominant" : "subordinate",
        }
      : null,
    lower: args.lower
      ? {
          side: "lower",
          pool: args.lower,
          pullDecayed: args.lowerPull ?? 50,
          role: args.dominantSide === "lower" ? "dominant" : "subordinate",
        }
      : null,
    dominantSide: args.dominantSide,
  };
}

function assessmentWithDirection(
  direction: "up" | "down" | "flat",
  playbook: Playbook,
): TfRegimeAssessment {
  return {
    timeframe: "1H",
    pattern: "RANGING",
    playbooks: {
      accumulation: stubAssessment("accumulation", playbook),
      ranging: stubAssessment("ranging", playbook),
      trending: stubAssessment("trending", playbook),
      breakout: stubAssessment("breakout", playbook),
    },
    recommended: { playbook, strength: 0.7 },
    inputs: {
      angle: {
        available: true,
        value: { angleDeg: 0, bracket: "RANGING", direction },
      },
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

function stubAssessment(p: Playbook, recommendedPlaybook: Playbook) {
  return {
    playbook: p,
    tradeable: p === recommendedPlaybook,
    strength: p === recommendedPlaybook ? 0.7 : 0.2,
    confidence: 0.6,
    reasons: [],
    drivers: [],
  };
}

function ctx(args: {
  tf?: Timeframe;
  currentPrice: number;
  arms: ExtractedArms;
  pools?: AnalysisPool[];
  direction?: "up" | "down" | "flat";
  playbook?: Playbook;
}): ProposalContext {
  return {
    timeframe: args.tf ?? "1H",
    candles: [
      {
        open: args.currentPrice,
        high: args.currentPrice,
        low: args.currentPrice,
        close: args.currentPrice,
        openTime: 0,
        closeTime: 1,
        volume: 1,
      },
    ],
    currentPrice: args.currentPrice,
    arms: args.arms,
    pools: args.pools ?? [],
    assessment: assessmentWithDirection(
      args.direction ?? "up",
      args.playbook ?? "ranging",
    ),
  };
}

// --- Tests -----------------------------------------------------------------

describe("proposeRangingTrade", () => {
  it("dominant upper arm → short, target lower arm centre", () => {
    const upper = pool({
      id: "u",
      type: "RESISTANCE",
      centreLine: 105,
      wickHigh: 106,
      wickLow: 104,
    });
    const lower = pool({
      id: "l",
      type: "SUPPORT",
      centreLine: 95,
      wickHigh: 96,
      wickLow: 94,
    });
    const plan = proposeRangingTrade(
      ctx({
        currentPrice: 105,
        arms: arms({ upper, upperPull: 80, lower, lowerPull: 40, dominantSide: "upper" }),
        playbook: "ranging",
      }),
    );
    expect(plan).not.toBeNull();
    expect(plan!.side).toBe("short");
    expect(plan!.entry).toBe(105);
    expect(plan!.stop).toBe(106); // upper wickHigh
    expect(plan!.target).toBe(95); // lower centre
    expect(plan!.anchorPoolId).toBe("u");
    expect(plan!.riskRewardRatio).toBeCloseTo(10 / 1, 5);
  });

  it("dominant lower arm → long, target upper centre", () => {
    const upper = pool({
      id: "u",
      type: "RESISTANCE",
      centreLine: 110,
      wickHigh: 111,
      wickLow: 109,
    });
    const lower = pool({
      id: "l",
      type: "SUPPORT",
      centreLine: 100,
      wickHigh: 101,
      wickLow: 99,
    });
    const plan = proposeRangingTrade(
      ctx({
        currentPrice: 100,
        arms: arms({ upper, upperPull: 40, lower, lowerPull: 80, dominantSide: "lower" }),
        playbook: "ranging",
      }),
    );
    expect(plan!.side).toBe("long");
    expect(plan!.stop).toBe(99); // lower wickLow
    expect(plan!.target).toBe(110); // upper centre
  });

  it("returns null when there's no dominant arm", () => {
    const plan = proposeRangingTrade(
      ctx({
        currentPrice: 100,
        arms: arms({ dominantSide: "neither" }),
        playbook: "ranging",
      }),
    );
    expect(plan).toBeNull();
  });
});

describe("proposeTrendingTrade", () => {
  it("up direction + dominant upper → long, target upper centre", () => {
    const upper = pool({
      id: "u",
      type: "RESISTANCE",
      centreLine: 110,
      wickHigh: 111,
      wickLow: 109,
    });
    const lower = pool({
      id: "l",
      type: "SUPPORT",
      centreLine: 95,
      wickHigh: 96,
      wickLow: 94,
    });
    const plan = proposeTrendingTrade(
      ctx({
        currentPrice: 100,
        arms: arms({ upper, lower, dominantSide: "upper" }),
        direction: "up",
        playbook: "trending",
      }),
    );
    expect(plan!.side).toBe("long");
    expect(plan!.stop).toBe(94); // lower wickLow (opposite arm)
    expect(plan!.target).toBe(110); // upper centre
  });

  it("dominant arm against trend direction → null (ambiguous)", () => {
    const upper = pool({
      id: "u",
      type: "RESISTANCE",
      centreLine: 110,
      wickHigh: 111,
      wickLow: 109,
    });
    const plan = proposeTrendingTrade(
      ctx({
        currentPrice: 100,
        arms: arms({ upper, dominantSide: "upper" }),
        direction: "down", // trend down but dominant is upper — conflict
        playbook: "trending",
      }),
    );
    expect(plan).toBeNull();
  });

  it("flat direction → null", () => {
    const upper = pool({
      id: "u",
      type: "RESISTANCE",
      centreLine: 110,
      wickHigh: 111,
      wickLow: 109,
    });
    const plan = proposeTrendingTrade(
      ctx({
        currentPrice: 100,
        arms: arms({ upper, dominantSide: "upper" }),
        direction: "flat",
        playbook: "trending",
      }),
    );
    expect(plan).toBeNull();
  });
});

describe("proposeBreakoutTrade", () => {
  it("up breakout → long, stop at dominant pool wickLow, target 2× risk", () => {
    const upper = pool({
      id: "u",
      type: "RESISTANCE",
      centreLine: 100,
      wickHigh: 101,
      wickLow: 99,
    });
    const plan = proposeBreakoutTrade(
      ctx({
        currentPrice: 102,
        arms: arms({ upper, dominantSide: "upper" }),
        direction: "up",
        playbook: "breakout",
      }),
    );
    expect(plan!.side).toBe("long");
    expect(plan!.entry).toBe(102);
    expect(plan!.stop).toBe(99);
    expect(plan!.target).toBe(102 + (102 - 99) * 2); // 108
    expect(plan!.sizeMultiplier).toBe(0.7);
  });
});

describe("proposeAccumulationTrade", () => {
  it("with both arms → long DCA tranche, mid-zone entry, halfsize", () => {
    const upper = pool({
      id: "u",
      type: "RESISTANCE",
      centreLine: 110,
      wickHigh: 111,
      wickLow: 109,
    });
    const lower = pool({
      id: "l",
      type: "SUPPORT",
      centreLine: 100,
      wickHigh: 101,
      wickLow: 99,
    });
    const plan = proposeAccumulationTrade(
      ctx({
        currentPrice: 105,
        arms: arms({ upper, lower, dominantSide: "upper" }),
        playbook: "accumulation",
      }),
    );
    expect(plan!.side).toBe("long");
    expect(plan!.entry).toBe(105); // zone midpoint = (100+110)/2
    expect(plan!.stop).toBe(99); // lower wickLow
    expect(plan!.target).toBe(110); // upper centre
    expect(plan!.sizeMultiplier).toBe(0.5);
  });

  it("missing one arm → null (no defined zone)", () => {
    const upper = pool({
      id: "u",
      type: "RESISTANCE",
      centreLine: 110,
      wickHigh: 111,
      wickLow: 109,
    });
    const plan = proposeAccumulationTrade(
      ctx({
        currentPrice: 105,
        arms: arms({ upper, dominantSide: "upper" }),
        playbook: "accumulation",
      }),
    );
    expect(plan).toBeNull();
  });
});

describe("buildPlan invariants", () => {
  it("R:R is finite and positive when geometry is non-degenerate", () => {
    const upper = pool({
      id: "u",
      type: "RESISTANCE",
      centreLine: 105,
      wickHigh: 106,
      wickLow: 104,
    });
    const lower = pool({
      id: "l",
      type: "SUPPORT",
      centreLine: 95,
      wickHigh: 96,
      wickLow: 94,
    });
    const plan = proposeRangingTrade(
      ctx({
        currentPrice: 105,
        arms: arms({ upper, lower, dominantSide: "upper" }),
      }),
    );
    expect(plan!.riskRewardRatio).toBeGreaterThan(0);
    expect(Number.isFinite(plan!.riskRewardRatio)).toBe(true);
    expect(plan!.riskPct).toBeGreaterThan(0);
  });
});
