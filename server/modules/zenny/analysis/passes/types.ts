// Pass framework types.
//
// Every pass is independent. Each takes the identified level set, looks at
// the candle data, and writes a result onto each level under its own key.
// No pass consumes another pass's evidence. Disabled passes don't write a
// key, and downstream code (renderer, table, aggregator) handles absence.

import type { Candle, Timeframe } from "../../../../../shared/zennyTypes";
import type { AnalysisLevel } from "../orchestrator";
import {
  DEFAULT_PASS_CONFIG as SHARED_DEFAULT_PASS_CONFIG,
  DEFAULT_PASS_CONFIG_BY_TIMEFRAME as SHARED_DEFAULT_PASS_CONFIG_BY_TIMEFRAME,
  getDefaultPassConfigForTimeframe as getSharedDefaultPassConfigForTimeframe,
} from "../../../../../shared/zennyBraidDefaults";

// Per-pass on/off + tunables. Each pass defines its own config interface
// extending PassConfigBase so { enabled } is uniform.
export interface PassConfigBase {
  enabled: boolean;
}

export interface RecencyPassConfig extends PassConfigBase {
  // Curve shape: "linear" — recency stays as 0..1 from primaryCandles index.
  //              "exponential" — bias toward the right edge with halfLife.
  curve: "linear" | "exponential";
  // For exponential: how many primary candles back where the score halves.
  // For linear: ignored.
  halfLifeCandles: number;
  // Below this score, wouldFilter = true. Renderer/aggregator decides what
  // "would filter" actually means — we never silently drop a level here.
  threshold: number;
}

export interface TouchCountPassConfig extends PassConfigBase {
  // Window past the pivot to count touches. 0 = until end of candle data.
  lookforwardCandles: number;
  // Define a "touch" — wick into the pool zone strict, or within tolerancePct
  // of the level price (looser).
  tolerancePct: number;
}

export interface LastLegPassConfig extends PassConfigBase {
  // ZigZag reversal threshold on the primary TF. A swing is confirmed when
  // price moves this fraction (e.g. 0.015 = 1.5%) from the running extreme
  // in the opposite direction. Smaller = more swings, larger = only major
  // reversals.
  reversalPct: number;
  // Distance at which a level's score reaches 0. Levels within this fraction
  // of either last-leg swing get a score 1.0..0 by linear fall-off.
  tolerancePct: number;
  // How many of the most recent swings to score against. N=1 = only the
  // single most-recent swing (one high or one low). N=3 ≈ bounding swings
  // of the current leg + the previous reversal — three structural prices,
  // matches the "draw three lines on the chart" intuition.
  lastN: number;
}

export interface PolarityFlipPassConfig extends PassConfigBase {
  // No tunables in this cut — the rule is binary: 0/1/2+ crossings.
  // Could later add a "minimum candles between crossings" knob to ignore
  // wick-based noise, but for now keep it simple.
}

export interface WireAnglePassConfig extends PassConfigBase {
  // Lookback window for the % change. Spec §1.2 fixes this at N=14 to match
  // RSI/ROC/ADX standard. Exposed as a knob for research; production should
  // leave it at 14.
  lookbackCandles: number;
  // Hysteresis: candidate bracket must hold for this many bars before the
  // locked bracket flips. Default 3.
  dwellBarsRequired: number;
}

export interface AggregatePassConfig extends PassConfigBase {
  // Weights for each contributor pass — sum doesn't have to be 1; the
  // aggregate normalises by total weight of contributors that wrote a
  // value. Setting a weight to 0 effectively excludes that pass from the
  // aggregate (independent of whether the pass itself is enabled).
  weightRecency: number;
  weightLastLeg: number;
  weightTouchCount: number;
  // Multiplier applied to broken levels. Broken = consumed liquidity,
  // so 0.0 hides them entirely as the slider rises; 1.0 ignores
  // brokenness when scoring.
  brokenPenalty: number;
  // Render filter — levels with aggregate score below this threshold are
  // hidden from the chart. 0 = show all (default), 1 = only the absolute
  // strongest.
  strengthThreshold: number;
}

export interface PassConfig {
  recency: RecencyPassConfig;
  touchCount: TouchCountPassConfig;
  lastLeg: LastLegPassConfig;
  polarityFlip: PolarityFlipPassConfig;
  aggregate: AggregatePassConfig;
  wireAngle: WireAnglePassConfig;
}

export const DEFAULT_PASS_CONFIG_BY_TIMEFRAME: Record<Timeframe, PassConfig> =
  SHARED_DEFAULT_PASS_CONFIG_BY_TIMEFRAME;

export const DEFAULT_PASS_CONFIG: PassConfig = SHARED_DEFAULT_PASS_CONFIG;

export function getDefaultPassConfigForTimeframe(
  timeframe: Timeframe,
): PassConfig {
  return getSharedDefaultPassConfigForTimeframe(timeframe);
}

// What every pass returns per level. Open shape — each pass defines its
// own value structure; the framework just stores it under the pass name.
export interface PassRunInput {
  levels: AnalysisLevel[];
  perTfCandles: Map<Timeframe, Candle[]>;
  primaryCandles: Candle[];
  primaryTimeframe: Timeframe;
}
