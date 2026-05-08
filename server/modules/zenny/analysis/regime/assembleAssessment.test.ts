import { describe, expect, it } from "vitest";
import type { Timeframe } from "../../../../../shared/zennyTypes";
import type { ExtractedArms } from "../arms/extractArms";
import type { AnalysisLevel, AnalysisPool } from "../orchestrator";
import type {
  TfRegime,
  WireAnglePassResult,
} from "../passes/wireAnglePass";
import {
  assembleRegimeAssessment,
  type AssembleInput,
} from "./assembleAssessment";
import {
  extractBoundaryDistance,
  extractPoolStrength,
} from "./extractInputs";

// --- Fixtures --------------------------------------------------------------

function tfRegime(angleDeg: number, lockedMatch = true): TfRegime {
  const bracket = bracketFor(angleDeg);
  return {
    info: {
      angleDeg,
      gannBracket: bracket,
      direction: angleDeg > 0.5 ? "up" : angleDeg < -0.5 ? "down" : "flat",
      lookback: 14,
      smoothedClose: 100,
      smoothedCloseNAgo: 95,
      pctChange: 5,
      realizedVolPct: 1,
      expectedWindowMovePct: 1 * Math.sqrt(14),
      zScore: 5 / (1 * Math.sqrt(14)),
    },
    dwell: {
      lockedBracket: lockedMatch ? bracket : "RANGING",
      candidateBracket: bracket,
      candidateBarsObserved: 5,
      dwellBarsRequired: 3,
      pendingFlip: !lockedMatch,
    },
    history: [],
  };
}

function bracketFor(angleDeg: number) {
  const a = Math.abs(angleDeg);
  if (a < 14) return "NO_TRADE" as const;
  if (a < 26.25) return "ACCUMULATION" as const;
  if (a < 45) return "RANGING" as const;
  if (a < 63.75) return "TRENDING" as const;
  return "BREAKOUT" as const;
}

function wireResult(
  primaryAngle: number,
  primaryTf: Timeframe = "1H",
  htfConfirms: "yes" | "mixed" | "no" = "mixed",
): WireAnglePassResult {
  return {
    perTimeframe: { [primaryTf]: tfRegime(primaryAngle) },
    agreement: {
      matchingDirectionCount: 2,
      totalAnalysed: 4,
      matchingDirectionRatio: 0.5,
      alignedTradePermittedCount: 1,
      weakestAlignedBracket: "RANGING",
      htfConfirms,
    },
  };
}

function arms(
  upperPull: number | null,
  lowerPull: number | null,
  dominant: "upper" | "lower" | "neither" = "neither",
): ExtractedArms {
  return {
    upper:
      upperPull === null
        ? null
        : {
            side: "upper",
            pool: {} as AnalysisPool,
            pullDecayed: upperPull,
            role: dominant === "upper" ? "dominant" : "subordinate",
          },
    lower:
      lowerPull === null
        ? null
        : {
            side: "lower",
            pool: {} as AnalysisPool,
            pullDecayed: lowerPull,
            role: dominant === "lower" ? "dominant" : "subordinate",
          },
    dominantSide: dominant,
  };
}

function buildInput(
  overrides: Partial<AssembleInput> & {
    primaryAngle?: number;
    htfConfirms?: "yes" | "mixed" | "no";
  } = {},
): AssembleInput {
  const primaryAngle = overrides.primaryAngle ?? 35; // RANGING up
  const primaryTimeframe = overrides.primaryTimeframe ?? "1H";
  return {
    primaryTimeframe,
    wireAngle:
      overrides.wireAngle ??
      wireResult(primaryAngle, primaryTimeframe, overrides.htfConfirms),
    arms: overrides.arms ?? arms(50, 30, "upper"),
    pools: overrides.pools ?? [],
    levels: overrides.levels ?? [],
    currentPrice: overrides.currentPrice ?? 100,
    totalCandles: overrides.totalCandles ?? 100,
  };
}

// --- Tests -----------------------------------------------------------------

describe("assembleRegimeAssessment — top-level shape", () => {
  it("returns null when primary TF has no wire-angle entry", () => {
    const result = assembleRegimeAssessment(
      buildInput({
        wireAngle: { perTimeframe: {}, agreement: wireResult(0).agreement },
      }),
    );
    expect(result).toBeNull();
  });

  it("populates inputs, all four playbooks, and a recommended pointer", () => {
    const result = assembleRegimeAssessment(buildInput());
    expect(result).not.toBeNull();
    const primary = result!.primary;
    expect(primary.pattern).toBe("RANGING");
    expect(Object.keys(primary.playbooks).sort()).toEqual([
      "accumulation",
      "breakout",
      "ranging",
      "trending",
    ]);
    expect(primary.inputs.angle.available).toBe(true);
    expect(primary.inputs.spread.available).toBe(false);
    expect(primary.inputs.spread.reason).toBeTruthy();
  });

  it("perTimeframe map keyed on primary TF", () => {
    const result = assembleRegimeAssessment(
      buildInput({ primaryTimeframe: "4H", primaryAngle: 50 }),
    );
    expect(result!.perTimeframe["4H"]).toBeDefined();
    expect(result!.perTimeframe["4H"]!.timeframe).toBe("4H");
  });
});

describe("assembleRegimeAssessment — playbook routing by bracket", () => {
  it("ACCUMULATION bracket → accumulation playbook strongest", () => {
    const result = assembleRegimeAssessment(
      buildInput({ primaryAngle: 20 }), // ACCUMULATION up
    )!;
    const ranked = rankPlaybooks(result.primary.playbooks);
    expect(ranked[0]).toBe("accumulation");
  });

  it("RANGING bracket with strong arms → ranging playbook strongest", () => {
    const pools = makeNearbyPools(100, 2, "very_strong");
    const result = assembleRegimeAssessment(
      buildInput({
        primaryAngle: 35,
        pools,
        arms: arms(60, 40, "upper"),
      }),
    )!;
    const ranked = rankPlaybooks(result.primary.playbooks);
    expect(ranked[0]).toBe("ranging");
  });

  it("TRENDING bracket with HTF confirms + dominant arm → trending", () => {
    const result = assembleRegimeAssessment(
      buildInput({
        primaryAngle: 55,
        htfConfirms: "yes",
        arms: arms(60, 20, "upper"),
      }),
    )!;
    const ranked = rankPlaybooks(result.primary.playbooks);
    expect(ranked[0]).toBe("trending");
  });

  it("BREAKOUT bracket with fresh lock → breakout playbook strongest", () => {
    // Breakout's distinguishing signal is freshness. An aged breakout
    // (observedBars >> requiredBars) hands the lead to trending — that's
    // intentional, since the move is no longer "new." So this test uses
    // a freshly-locked BREAKOUT (observed = required) to verify breakout
    // wins when its strongest input fires.
    const freshWire: WireAnglePassResult = {
      perTimeframe: {
        "1H": {
          ...tfRegime(70),
          dwell: {
            ...tfRegime(70).dwell,
            candidateBarsObserved: 3,
            dwellBarsRequired: 3,
          },
        },
      },
      agreement: wireResult(70, "1H", "yes").agreement,
    };
    const result = assembleRegimeAssessment(
      buildInput({
        primaryAngle: 70,
        wireAngle: freshWire,
        arms: arms(60, 20, "upper"),
      }),
    )!;
    const ranked = rankPlaybooks(result.primary.playbooks);
    expect(ranked[0]).toBe("breakout");
  });
});

describe("assembleRegimeAssessment — vetoes", () => {
  it("NO_TRADE bracket vetoes every playbook", () => {
    const result = assembleRegimeAssessment(
      buildInput({ primaryAngle: 5 }), // NO_TRADE
    )!;
    expect(result.primary.playbooks.accumulation.tradeable).toBe(false);
    expect(result.primary.playbooks.ranging.tradeable).toBe(false);
    expect(result.primary.playbooks.trending.tradeable).toBe(false);
    expect(result.primary.playbooks.breakout.tradeable).toBe(false);
    expect(result.primary.recommended).toBeNull();
  });

  it("ranging playbook vetoed when no usable arm exists", () => {
    const result = assembleRegimeAssessment(
      buildInput({
        primaryAngle: 35, // RANGING
        arms: arms(null, null, "neither"),
      }),
    )!;
    expect(result.primary.playbooks.ranging.tradeable).toBe(false);
    expect(
      result.primary.playbooks.ranging.reasons.some((r) =>
        r.toLowerCase().includes("arm"),
      ),
    ).toBe(true);
  });

  it("trending playbook vetoed when direction is flat", () => {
    const result = assembleRegimeAssessment(buildInput({ primaryAngle: 0 }))!;
    expect(result.primary.playbooks.trending.tradeable).toBe(false);
  });
});

describe("assembleRegimeAssessment — confidence", () => {
  it("confidence reflects how much of the input weight is available", () => {
    const result = assembleRegimeAssessment(buildInput())!;
    // Many inputs are unavailable (tick processing, market quality, etc.).
    // Confidence should land somewhere in the 0.5-0.85 range — non-trivial
    // but not full evidence.
    for (const a of Object.values(result.primary.playbooks)) {
      expect(a.confidence).toBeGreaterThan(0.3);
      expect(a.confidence).toBeLessThan(1);
    }
  });
});

describe("extractBoundaryDistance", () => {
  it("returns small degreesToNearest at a bracket boundary", () => {
    const r = extractBoundaryDistance(tfRegime(26.4)); // just inside RANGING
    expect(r.available).toBe(true);
    expect(r.value!.degreesToNearest).toBeLessThan(0.5);
  });

  it("returns near-1 centerness at the centre of a bracket", () => {
    // RANGING is 26.25–45, centre ≈ 35.625
    const r = extractBoundaryDistance(tfRegime(35.625));
    expect(r.value!.centerness).toBeGreaterThan(0.95);
  });
});

describe("extractPoolStrength", () => {
  it("counts only pools within proximity window of current price", () => {
    const pools: AnalysisPool[] = [
      ...makeNearbyPools(100, 1, "strong"), // within 5%
      ...makeFarPools(100, 1), // outside 5%
    ];
    const r = extractPoolStrength(pools, 100);
    expect(r.value!.activeNearbyCount).toBe(1);
    expect(r.value!.hasStrongNearby).toBe(true);
  });
});

// --- Helpers ---------------------------------------------------------------

function rankPlaybooks(playbooks: Record<string, { strength: number }>) {
  return (Object.entries(playbooks) as Array<[string, { strength: number }]>)
    .sort((a, b) => b[1].strength - a[1].strength)
    .map(([name]) => name);
}

function makeNearbyPools(
  price: number,
  count: number,
  strength: "strong" | "very_strong" = "strong",
): AnalysisPool[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `pool-near-${i}`,
    symbol: "BTCUSDT",
    sourceTimeframe: "1H" as Timeframe,
    type: "RESISTANCE" as const,
    kind: "pivot_probe" as const,
    linePrice: price * (1 + 0.01 * (i + 1)),
    wickHigh: price * (1 + 0.012 * (i + 1)),
    wickLow: price * (1 + 0.008 * (i + 1)),
    centreLine: price * (1 + 0.01 * (i + 1)),
    birthCandleTime: 0,
    birthCandleIndexOnPrimary: 50,
    sweptCandleTime: null,
    sweptCandleIndexOnPrimary: null,
    sweepReason: null,
    deathCandleTime: null,
    deathCandleIndexOnPrimary: null,
    deathReason: null,
    status: "active" as const,
    confluenceCount: 3,
    strength,
    pull: { raw: 50, normalized: 0.7, decayed: 0.5, distancePct: 1, candlesMovingAway: 0, sEffectiveStandIn: 50 },
  }));
}

function makeFarPools(price: number, count: number): AnalysisPool[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `pool-far-${i}`,
    symbol: "BTCUSDT",
    sourceTimeframe: "1H" as Timeframe,
    type: "RESISTANCE" as const,
    kind: "pivot_probe" as const,
    linePrice: price * (1 + 0.10 + 0.01 * i), // > 5% away
    wickHigh: price * (1 + 0.11),
    wickLow: price * (1 + 0.10),
    centreLine: price * (1 + 0.105),
    birthCandleTime: 0,
    birthCandleIndexOnPrimary: 50,
    sweptCandleTime: null,
    sweptCandleIndexOnPrimary: null,
    sweepReason: null,
    deathCandleTime: null,
    deathCandleIndexOnPrimary: null,
    deathReason: null,
    status: "active" as const,
    confluenceCount: 1,
    strength: "weak" as const,
    pull: null,
  }));
}

// Suppress unused-import warning — AnalysisLevel is used as a type only
// for the levels[] field in AssembleInput, which we always pass empty.
type _UnusedLevels = AnalysisLevel;
