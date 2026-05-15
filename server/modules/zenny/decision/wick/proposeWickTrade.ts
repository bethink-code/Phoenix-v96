// proposeWickTrade — turn a per-TF regime + arms + pools + price into a
// concrete TradePlan, where the entry mechanic is one of the four user-trusted
// wick patterns. Single proposer; entry style is a parameter that's tried in
// the regime-matrix order until one fires.
//
// Selection logic:
//   1. Look up the recommended playbook's allowed entry styles (regime matrix).
//   2. Pick the dominant arm's pool as the candidate (v1 — could expand later).
//   3. For each allowed style in order:
//      - Style/state guard:
//          fade styles (#1/#2/#3) need pool.status === 'swept' AND a recent sweep
//          anticipatory (#4) needs pool.status === 'active' AND TRENDING regime
//      - Compute buffer / entry / stop / target.
//      - If style is in `confirmation.requiredFor`, check close-back-inside.
//      - Build TradePlan; return on the first one that resolves.
//   4. No style fires → null.
//
// The plan's `playbook` field reflects the regime that gated the trade. The
// `rationale` includes the chosen entryStyle so the UI / log can show it.
//
// Pure function.

import type { ExtractedArms } from "../../analysis/arms/extractArms";
import type { AnalysisPool } from "../../analysis/orchestrator";
import type {
  Playbook,
  TfRegimeAssessment,
} from "../../analysis/regime/types";
import type { Candle, Timeframe } from "../../../../../shared/zennyTypes";
import type { TradePlan, TradeSide } from "../types";
import { checkConfirmation } from "./checkConfirmation";
import { computeBuffer } from "./computeBuffer";
import { computeEntry } from "./computeEntry";
import { computeStop } from "./computeStop";
import { computeTarget } from "./computeTarget";
import { DEFAULT_WICK_CONFIG } from "./defaultConfig";
import type { EntryStyle, WickTradeConfig } from "./types";

export interface ProposeWickTradeInput {
  timeframe: Timeframe;
  candles: Candle[];
  currentPrice: number;
  arms: ExtractedArms;
  pools: AnalysisPool[];
  assessment: TfRegimeAssessment;
  config?: WickTradeConfig;
}

export function proposeWickTrade(
  input: ProposeWickTradeInput,
): TradePlan | null {
  const cfg = input.config ?? DEFAULT_WICK_CONFIG;
  const playbook = input.assessment.recommended?.playbook;
  if (!playbook) return null;

  const allowedStyles = cfg.regimeMatrix[playbook];
  if (!allowedStyles || allowedStyles.length === 0) return null;

  // v1 — only consider the dominant arm. If the dominant arm doesn't yield a
  // tradeable plan in any allowed style, no plan. Future: scan all arm-eligible
  // pools and rank by pull / proximity.
  const dominant = pickDominantArm(input.arms);
  if (!dominant) return null;

  const pool = dominant.pool;
  const side: TradeSide = pool.type === "RESISTANCE" ? "short" : "long";
  const buffer = computeBuffer(input.currentPrice, input.candles, cfg.buffer);

  for (const style of allowedStyles) {
    const plan = tryStyle({
      style,
      pool,
      side,
      input,
      cfg,
      buffer,
      playbook,
    });
    if (plan !== null) return plan;
  }

  return null;
}

// ---------------------------------------------------------------------------

interface TryStyleArgs {
  style: EntryStyle;
  pool: AnalysisPool;
  side: TradeSide;
  input: ProposeWickTradeInput;
  cfg: WickTradeConfig;
  buffer: number;
  playbook: Playbook;
}

function tryStyle(args: TryStyleArgs): TradePlan | null {
  const { style, pool, side, input, cfg, buffer, playbook } = args;

  // Style/state guard.
  if (style === "anticipatory") {
    if (!cfg.anticipatory.enabled) return null;
    if (pool.status !== "active") return null;
    if (cfg.anticipatory.requireTrendingRegime && playbook !== "trending") {
      return null;
    }
  } else {
    // Fade entries require a recent sweep.
    if (pool.status !== "swept") return null;
    if (
      pool.sweptCandleIndexOnPrimary === null ||
      pool.sweptCandleIndexOnPrimary < 0
    ) {
      return null;
    }
    const candlesSinceSweep =
      input.candles.length - 1 - pool.sweptCandleIndexOnPrimary;
    if (candlesSinceSweep < 0 || candlesSinceSweep > cfg.maxBarsSinceSweep) {
      return null;
    }
  }

  // Geometry.
  const entry = computeEntry({
    pool,
    style,
    buffer,
    anticipatory: cfg.anticipatory,
  });
  if (entry === null) return null;
  const stop = computeStop({ pool, style, buffer, beyond: cfg.beyond });
  const targetOut = computeTarget({ pool, arms: input.arms, entry, side });

  // Sanity: stop must be on the loss side of entry, target on the profit side.
  if (side === "short" && (stop <= entry || targetOut.target >= entry)) {
    return null;
  }
  if (side === "long" && (stop >= entry || targetOut.target <= entry)) {
    return null;
  }

  // Confirmation gate.
  if (cfg.confirmation.requiredFor.includes(style)) {
    const conf = checkConfirmation({
      pool,
      candles: input.candles,
      maxBarsAfterSweep: cfg.confirmation.maxBarsAfterSweep,
    });
    if (!conf.satisfied) return null;
  }

  // Build the plan.
  const riskAbs = Math.abs(entry - stop);
  const rewardAbs = Math.abs(targetOut.target - entry);
  if (riskAbs === 0 || entry === 0) return null;
  const riskRewardRatio = rewardAbs / riskAbs;
  if (riskRewardRatio < cfg.minRiskRewardRatio) return null;

  const sizeMultiplier = cfg.sizeMultiplier[style];

  const rationale: string[] = [
    `playbook ${playbook} → entry style ${style}`,
    `pool ${pool.id} (${pool.type}, ${pool.status})`,
    `target via ${targetOut.source}`,
  ];
  if (style === "beyond") {
    rationale.push(
      `interpretation: ${cfg.beyond.interpretation}, stop ×${cfg.beyond.stopMultiplier}`,
    );
  }
  if (style === "anticipatory") {
    rationale.push(`distance rule: ${cfg.anticipatory.distanceRule}`);
  }

  return {
    timeframe: input.timeframe,
    playbook,
    phase: "take",
    side,
    entry,
    stop,
    target: targetOut.target,
    riskRewardRatio,
    riskPct: (riskAbs / entry) * 100,
    sizeMultiplier,
    anchorPoolId: pool.id,
    rationale,
  };
}

function pickDominantArm(arms: ExtractedArms): {
  side: "upper" | "lower";
  pool: AnalysisPool;
} | null {
  if (arms.dominantSide === "upper" && arms.upper) {
    return { side: "upper", pool: arms.upper.pool };
  }
  if (arms.dominantSide === "lower" && arms.lower) {
    return { side: "lower", pool: arms.lower.pool };
  }
  return null;
}
