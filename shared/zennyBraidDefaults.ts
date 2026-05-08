import type { Timeframe } from "./zennyTypes";

export interface BraidRecencyPassConfig {
  enabled: boolean;
  curve: "linear" | "exponential";
  halfLifeCandles: number;
  threshold: number;
}

export interface BraidTouchCountPassConfig {
  enabled: boolean;
  lookforwardCandles: number;
  tolerancePct: number;
}

export interface BraidLastLegPassConfig {
  enabled: boolean;
  reversalPct: number;
  tolerancePct: number;
  lastN: number;
}

export interface BraidPolarityFlipPassConfig {
  enabled: boolean;
}

export interface BraidWireAnglePassConfig {
  enabled: boolean;
  lookbackCandles: number;
  // Hysteresis — the candidate bracket must hold for this many primary-TF
  // bars before the locked (gate) bracket flips. Stops oscillation at the
  // 14°/26.25°/45°/63.75° boundaries. Candidate updates every tick;
  // locked only changes when the dwell condition is met.
  dwellBarsRequired: number;
}

export interface BraidAggregatePassConfig {
  enabled: boolean;
  weightRecency: number;
  weightLastLeg: number;
  weightTouchCount: number;
  brokenPenalty: number;
  strengthThreshold: number;
}

export interface BraidPassConfig {
  recency: BraidRecencyPassConfig;
  touchCount: BraidTouchCountPassConfig;
  lastLeg: BraidLastLegPassConfig;
  polarityFlip: BraidPolarityFlipPassConfig;
  aggregate: BraidAggregatePassConfig;
  wireAngle: BraidWireAnglePassConfig;
}

export const DEFAULT_BRAID_TIMEFRAME: Timeframe = "1H";

export const DEFAULT_BRAID_COUNT_BY_TIMEFRAME: Record<Timeframe, number> = {
  "15m": 500,
  "1H": 300,
  "4H": 250,
  "12H": 240,
  D: 220,
  W: 180,
  M: 120,
};

export const DEFAULT_BRAID_COUNT =
  DEFAULT_BRAID_COUNT_BY_TIMEFRAME[DEFAULT_BRAID_TIMEFRAME];

export const DEFAULT_PASS_CONFIG_BY_TIMEFRAME: Record<
  Timeframe,
  BraidPassConfig
> = {
  "15m": makeLiquidityPoolPassConfig({
    halfLifeCandles: 120,
    touchTolerancePct: 0.0018,
    reversalPct: 0.008,
    lastLegTolerancePct: 0.0035,
  }),
  "1H": makeLiquidityPoolPassConfig({
    halfLifeCandles: 75,
    touchTolerancePct: 0.0025,
    reversalPct: 0.015,
    lastLegTolerancePct: 0.006,
  }),
  "4H": makeLiquidityPoolPassConfig({
    halfLifeCandles: 60,
    touchTolerancePct: 0.0035,
    reversalPct: 0.025,
    lastLegTolerancePct: 0.0085,
  }),
  "12H": makeLiquidityPoolPassConfig({
    halfLifeCandles: 50,
    touchTolerancePct: 0.0042,
    reversalPct: 0.035,
    lastLegTolerancePct: 0.01,
  }),
  D: makeLiquidityPoolPassConfig({
    halfLifeCandles: 45,
    touchTolerancePct: 0.005,
    reversalPct: 0.05,
    lastLegTolerancePct: 0.012,
  }),
  W: makeLiquidityPoolPassConfig({
    halfLifeCandles: 30,
    touchTolerancePct: 0.008,
    reversalPct: 0.1,
    lastLegTolerancePct: 0.02,
  }),
  M: makeLiquidityPoolPassConfig({
    halfLifeCandles: 18,
    touchTolerancePct: 0.012,
    reversalPct: 0.18,
    lastLegTolerancePct: 0.035,
  }),
};

export const DEFAULT_PASS_CONFIG =
  DEFAULT_PASS_CONFIG_BY_TIMEFRAME[DEFAULT_BRAID_TIMEFRAME];

export function getDefaultBraidCountForTimeframe(timeframe: Timeframe): number {
  return (
    DEFAULT_BRAID_COUNT_BY_TIMEFRAME[timeframe] ??
    DEFAULT_BRAID_COUNT_BY_TIMEFRAME[DEFAULT_BRAID_TIMEFRAME]
  );
}

export function getDefaultPassConfigForTimeframe(
  timeframe: Timeframe,
): BraidPassConfig {
  return clonePassConfig(
    DEFAULT_PASS_CONFIG_BY_TIMEFRAME[timeframe] ?? DEFAULT_PASS_CONFIG,
  );
}

interface LiquidityPoolPassProfile {
  halfLifeCandles: number;
  touchTolerancePct: number;
  reversalPct: number;
  lastLegTolerancePct: number;
}

function makeLiquidityPoolPassConfig(
  profile: LiquidityPoolPassProfile,
): BraidPassConfig {
  return {
    recency: {
      enabled: true,
      curve: "exponential",
      halfLifeCandles: profile.halfLifeCandles,
      threshold: 0.25,
    },
    touchCount: {
      enabled: true,
      lookforwardCandles: 0,
      tolerancePct: profile.touchTolerancePct,
    },
    lastLeg: {
      enabled: true,
      reversalPct: profile.reversalPct,
      tolerancePct: profile.lastLegTolerancePct,
      lastN: 3,
    },
    polarityFlip: {
      enabled: true,
    },
    aggregate: {
      enabled: true,
      weightRecency: 0.25,
      weightLastLeg: 0.45,
      weightTouchCount: 0.3,
      brokenPenalty: 0.15,
      // Reset/default is a recovery view: score everything, hide nothing.
      strengthThreshold: 0,
    },
    // Spec §1.2 fixes the wire-angle lookback at 14. Production should not
    // change this; the knob exists only for research.
    wireAngle: {
      enabled: true,
      lookbackCandles: 14,
      dwellBarsRequired: 3,
    },
  };
}

function clonePassConfig(config: BraidPassConfig): BraidPassConfig {
  return {
    recency: { ...config.recency },
    touchCount: { ...config.touchCount },
    lastLeg: { ...config.lastLeg },
    polarityFlip: { ...config.polarityFlip },
    aggregate: { ...config.aggregate },
    wireAngle: { ...config.wireAngle },
  };
}
