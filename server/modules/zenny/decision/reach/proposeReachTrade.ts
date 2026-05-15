// proposeReachTrade — Phase 1 (REACH) trade proposer.
//
// REACH fires when:
//   1. Dominant arm exists and pull asymmetry exceeds threshold (R1).
//   2. Wire-angle direction aligns with the dominant arm side (long → upper).
//   3. Current price is OUTSIDE the conflict zone around the pool (R7) —
//      we don't enter REACH right next to TAKE territory.
//   4. A pullback swing point can be located in the lookback window (R2).
//   5. ATR is computable for the stop buffer (R3).
//   6. Resulting geometry is non-degenerate.
//
// Outputs a TradePlan with phase='reach'. Stop = opposite-arm wick + buffer.
// Target = dominant pool centre. target2 not yet wired (TP1/TP2 split is a
// runner concern — execution module v0 only honours single target).
//
// Pure function. Returns null on any guard failure; reasons logged to
// rationale for diagnostic.

import { computeATR } from "../wick/computeATR";
import type { Candle, Timeframe } from "../../../../../shared/zennyTypes";
import type { ExtractedArms } from "../../analysis/arms/extractArms";
import type { AnalysisPool } from "../../analysis/orchestrator";
import type {
  TfRegimeAssessment,
} from "../../analysis/regime/types";
import type { TradePlan, TradeSide } from "../types";
import { computeAsymmetry } from "./computeAsymmetry";
import { DEFAULT_REACH_CONFIG } from "./defaultConfig";
import { findRecentSwingHigh, findRecentSwingLow } from "./findRecentSwing";
import type { ReachTradeConfig } from "./types";

export interface ProposeReachTradeInput {
  timeframe: Timeframe;
  candles: Candle[];
  currentPrice: number;
  arms: ExtractedArms;
  pools: AnalysisPool[];
  assessment: TfRegimeAssessment;
  config?: ReachTradeConfig;
}

export function proposeReachTrade(
  input: ProposeReachTradeInput,
): TradePlan | null {
  const cfg = input.config ?? DEFAULT_REACH_CONFIG;
  const playbook = input.assessment.recommended?.playbook;
  if (!playbook) return null;
  if (!cfg.allowedPlaybooks.includes(playbook)) return null;

  // Asymmetry gate.
  const asym = computeAsymmetry(input.arms);
  if (asym === null) return null;
  if (asym.asymmetry < cfg.pullAsymmetryThreshold) return null;

  const dominantSide = asym.dominantSide;
  const side: TradeSide = dominantSide === "upper" ? "long" : "short";
  const dominantArm =
    dominantSide === "upper" ? input.arms.upper : input.arms.lower;
  const oppositeArm =
    dominantSide === "upper" ? input.arms.lower : input.arms.upper;
  if (!dominantArm) return null;
  const dominantPool = dominantArm.pool;

  // Direction alignment with wire angle.
  if (cfg.requireDirectionAlignment) {
    const angleInput = input.assessment.inputs.angle;
    if (!angleInput.available || !angleInput.value) return null;
    const direction = angleInput.value.direction;
    if (side === "long" && direction !== "up") return null;
    if (side === "short" && direction !== "down") return null;
  }

  // ATR for stop buffer + conflict zone.
  const atr = computeATR(input.candles, cfg.atrPeriod);
  if (atr === null) return null;

  // R7 — conflict zone: if current price is too close to the pool centre,
  // we're in TAKE territory; suppress new REACH.
  const distanceToPool = Math.abs(input.currentPrice - dominantPool.centreLine);
  if (distanceToPool < atr * cfg.conflictZoneAtrMultiple) return null;

  // Entry: pullback-swing (v0 only mode).
  let entry: number | null = null;
  if (cfg.entryMethod === "pullback-swing") {
    entry =
      side === "long"
        ? findRecentSwingLow(input.candles, cfg.pullbackLookbackBars)
        : findRecentSwingHigh(input.candles, cfg.pullbackLookbackBars);
  } else if (cfg.entryMethod === "at-market") {
    entry = input.currentPrice;
  }
  // pullback-fvg not implemented — falls through to null
  if (entry === null) return null;

  // For long REACH, entry should be at-or-below current price (we're buying
  // the dip). For short, at-or-above. If the swing is on the wrong side of
  // current (e.g. price already moved past it), use current price.
  if (side === "long" && entry > input.currentPrice) entry = input.currentPrice;
  if (side === "short" && entry < input.currentPrice) entry = input.currentPrice;

  // Stop: beyond the opposite arm's wick + buffer. If no opposite arm,
  // use the entry +/- distance to dominant pool (defensive fallback).
  const buffer = atr * cfg.stopAtrBufferMultiple;
  let stop: number;
  let stopSource: string;
  if (oppositeArm) {
    stop =
      side === "long"
        ? oppositeArm.pool.wickLow - buffer
        : oppositeArm.pool.wickHigh + buffer;
    stopSource = `opposite-arm wick + ${cfg.stopAtrBufferMultiple} × ATR`;
  } else {
    // No opposite arm — fallback: stop at distance equal to entry→dominantPool.
    const dist = Math.abs(entry - dominantPool.centreLine);
    stop = side === "long" ? entry - dist : entry + dist;
    stopSource = "fallback (no opposite arm)";
  }

  // Target: dominant pool centre.
  const target = dominantPool.centreLine;

  // R4 — TP1 = pool_centre minus a slice of the pool width on the
  // approach side. (For a long upper pool: TP1 is below centre toward the
  // wickLow of the pool.)
  const poolWidth = Math.abs(
    dominantPool.wickHigh - dominantPool.wickLow,
  );
  const tp1Offset = poolWidth * cfg.tp1RatioOfPoolWidth;
  const target2 =
    side === "long" ? target - tp1Offset : target + tp1Offset;

  // Geometry sanity.
  if (side === "long" && (stop >= entry || target <= entry)) return null;
  if (side === "short" && (stop <= entry || target >= entry)) return null;

  const riskAbs = Math.abs(entry - stop);
  const rewardAbs = Math.abs(target - entry);
  if (riskAbs === 0 || entry === 0) return null;
  const riskRewardRatio = rewardAbs / riskAbs;
  if (riskRewardRatio < cfg.minRiskRewardRatio) return null;

  return {
    timeframe: input.timeframe,
    playbook,
    phase: "reach",
    side,
    entry,
    stop,
    target,
    target2, // TP1 — execution v0 doesn't honour, but persisted for UI
    riskRewardRatio,
    riskPct: (riskAbs / entry) * 100,
    sizeMultiplier: cfg.sizeMultiplierVsTake,
    anchorPoolId: dominantPool.id,
    rationale: [
      `REACH ${side} → ${dominantSide} pool ${dominantPool.id}`,
      `pull asymmetry ${asym.asymmetry.toFixed(2)} (threshold ${cfg.pullAsymmetryThreshold})`,
      `entry: ${cfg.entryMethod}`,
      `stop: ${stopSource}`,
      `TP2 target: dominant pool centre; TP1 (target2) at ${cfg.tp1RatioOfPoolWidth.toFixed(2)}× pool width back`,
    ],
  };
}
