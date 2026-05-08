// Per-playbook trade proposers — given a ProposalContext (assessment +
// arms + pools + price), build a concrete TradePlan with entry / stop /
// target / side / size / rationale.
//
// V0 geometry rules:
//
//   RANGING (mean-revert at pool extremes):
//     dominant arm = "the side price is currently testing". Trade the
//     opposite direction (revert away from the dominant pool toward
//     the subordinate pool). Stop just past the dominant pool's wick.
//     Target the subordinate pool's centre line.
//
//   TRENDING (continuation):
//     dominant arm in the trend direction = the move's destination. Side
//     = trend direction. Stop on the OPPOSITE arm's wick (or pull back
//     to a structural floor). Target = dominant pool centre.
//
//   BREAKOUT (initial break + retest, reduced size):
//     side = trend direction. Dominant arm = the just-broken level (the
//     pool price came from). Stop just past it on the wrong side.
//     Target = measured-move from entry — 2× the risk distance, since
//     a fresh breakout is typically the first leg of a longer move.
//     sizeMultiplier = 0.7 per spec §1.3.
//
//   ACCUMULATION (buy-and-hold tranche):
//     side comes from arm presence (upper arm → long, lower arm → short).
//     If neither arm clears the floor, no proposal — accumulation needs
//     a defined zone. Stop at the opposite-side pool. Target the
//     dominant arm pool centre. sizeMultiplier = 0.5 (DCA partial).
//
// All proposers return null when the geometry can't be resolved (no
// dominant arm where one is required, conflicting direction, missing
// opposite arm where required for a stop, etc.). The top-level assembler
// only calls a proposer when its playbook is the recommended one — but
// the proposer can still bail if the geometry doesn't line up.

import type { ExtractedArms } from "../analysis/arms/extractArms";
import type { AnalysisPool } from "../analysis/orchestrator";
import type { ProposalContext, TradePlan, TradeSide } from "./types";

// === Public entry points ==================================================

export function proposeRangingTrade(ctx: ProposalContext): TradePlan | null {
  const dominant = pickDominantArm(ctx.arms);
  if (!dominant) return rationalNull("ranging needs a dominant arm at the extreme");

  // Side is OPPOSITE of dominant arm — we revert away from the pool
  // price is currently testing.
  const side: TradeSide = dominant.side === "upper" ? "short" : "long";

  // Stop: just past the dominant pool's wick (the side away from entry).
  // For short (price testing upper): stop above the wickHigh.
  // For long (price testing lower): stop below the wickLow.
  const stop =
    side === "short"
      ? dominant.pool.wickHigh
      : dominant.pool.wickLow;

  // Target: subordinate arm's centre, OR fallback to range midpoint
  // when only one arm exists.
  const subordinate = side === "short" ? ctx.arms.lower : ctx.arms.upper;
  let target: number;
  let targetSource: string;
  let anchorPoolId: string | null = dominant.pool.id;
  if (subordinate) {
    target = subordinate.pool.centreLine;
    targetSource = `subordinate ${subordinate.side} pool centre`;
  } else {
    // No opposite arm — use a measured move. Distance from current to
    // dominant pool wick × 2, mirrored to the other side.
    const range = Math.abs(ctx.currentPrice - dominant.pool.centreLine);
    target =
      side === "short"
        ? ctx.currentPrice - range
        : ctx.currentPrice + range;
    targetSource = "measured move (no opposite arm)";
  }

  const plan = buildPlan({
    ctx,
    playbook: "ranging",
    side,
    entry: ctx.currentPrice,
    stop,
    target,
    sizeMultiplier: 1.0,
    anchorPoolId,
    rationale: [
      `dominant arm: ${dominant.side} (${dominant.pool.id})`,
      `mean-revert ${side} away from the extreme`,
      `target: ${targetSource}`,
    ],
  });

  return plan;
}

export function proposeTrendingTrade(ctx: ProposalContext): TradePlan | null {
  const angleInput = ctx.assessment.inputs.angle;
  if (!angleInput.available || !angleInput.value) {
    return rationalNull("trending needs an angle direction");
  }
  const direction = angleInput.value.direction;
  if (direction === "flat") return rationalNull("flat — no direction to follow");

  const dominant = pickDominantArm(ctx.arms);
  if (!dominant) return rationalNull("trending needs a dominant arm in the trend direction");

  // Direction must align with the dominant arm — long trend should have
  // upper arm dominant; short trend should have lower arm dominant.
  const expectedSide = direction === "up" ? "upper" : "lower";
  if (dominant.side !== expectedSide) {
    return rationalNull(
      `dominant arm is ${dominant.side} but trend is ${direction} — ambiguous`,
    );
  }

  const side: TradeSide = direction === "up" ? "long" : "short";

  // Stop: opposite arm's wick if present; otherwise back off from current
  // price by the dominant pool's distance (a structural floor).
  const opposite = side === "long" ? ctx.arms.lower : ctx.arms.upper;
  let stop: number;
  let stopSource: string;
  if (opposite) {
    stop =
      side === "long" ? opposite.pool.wickLow : opposite.pool.wickHigh;
    stopSource = `opposite ${opposite.side} arm wick`;
  } else {
    // Fallback: 1× the distance to the dominant pool, on the wrong side
    // of current price. Coarse but safer than no stop at all.
    const distance = Math.abs(dominant.pool.centreLine - ctx.currentPrice);
    stop =
      side === "long"
        ? ctx.currentPrice - distance
        : ctx.currentPrice + distance;
    stopSource = "fallback (no opposite arm)";
  }

  // Target: dominant pool's centre line.
  const target = dominant.pool.centreLine;

  return buildPlan({
    ctx,
    playbook: "trending",
    side,
    entry: ctx.currentPrice,
    stop,
    target,
    sizeMultiplier: 1.0,
    anchorPoolId: dominant.pool.id,
    rationale: [
      `trend direction: ${direction}`,
      `dominant arm: ${dominant.side} (${dominant.pool.id})`,
      `stop: ${stopSource}`,
      `target: dominant pool centre`,
    ],
  });
}

export function proposeBreakoutTrade(ctx: ProposalContext): TradePlan | null {
  const angleInput = ctx.assessment.inputs.angle;
  if (!angleInput.available || !angleInput.value) {
    return rationalNull("breakout needs an angle direction");
  }
  const direction = angleInput.value.direction;
  if (direction === "flat") return rationalNull("flat — no breakout direction");

  const dominant = pickDominantArm(ctx.arms);
  if (!dominant) return rationalNull("breakout needs a dominant arm at the broken level");

  const side: TradeSide = direction === "up" ? "long" : "short";

  // Stop: the WRONG side of the broken level. For an up-breakout, the
  // dominant pool was overhead resistance that just broke; price is now
  // above it on a retest, and stop goes BELOW the pool's wickLow.
  const stop =
    side === "long"
      ? dominant.pool.wickLow
      : dominant.pool.wickHigh;

  // Target: 2× the risk distance projected from entry. Fresh breakouts
  // typically run further than a single ATR; 2R is a conservative
  // measured-move proxy.
  const riskAbs = Math.abs(ctx.currentPrice - stop);
  const target =
    side === "long" ? ctx.currentPrice + riskAbs * 2 : ctx.currentPrice - riskAbs * 2;

  return buildPlan({
    ctx,
    playbook: "breakout",
    side,
    entry: ctx.currentPrice,
    stop,
    target,
    sizeMultiplier: 0.7, // spec §1.3 reduced size for whipsaw protection
    anchorPoolId: dominant.pool.id,
    rationale: [
      `breakout direction: ${direction}`,
      `broken level: ${dominant.side} pool ${dominant.pool.id}`,
      `stop: opposite side of broken level`,
      `target: 2× risk projected from entry`,
      `sizeMultiplier 0.7 (spec §1.3 whipsaw protection)`,
    ],
  });
}

export function proposeAccumulationTrade(
  ctx: ProposalContext,
): TradePlan | null {
  // Accumulation needs both arms — a defined zone with floor + ceiling.
  // Without that, there's no zone to deploy capital across.
  if (!ctx.arms.upper || !ctx.arms.lower) {
    return rationalNull("accumulation needs both arms (defined zone)");
  }

  // Side defaults to long — accumulation is a buy-and-hold playbook in
  // the trader vernacular. Future: take side cue from HTF agreement
  // (HTFs trending up → accumulate long; trending down → accumulate
  // short via a short-side equivalent like staking-out distribution).
  const side: TradeSide = "long";

  // Entry: midpoint of the zone (DCA centre).
  const upper = ctx.arms.upper.pool;
  const lower = ctx.arms.lower.pool;
  const zoneMid = (upper.centreLine + lower.centreLine) / 2;
  const entry = zoneMid;

  // Stop: just below the lower pool's wickLow (zone-failure invalidation).
  const stop = lower.wickLow;

  // Target: upper pool centre (zone-respect outcome).
  const target = upper.centreLine;

  return buildPlan({
    ctx,
    playbook: "accumulation",
    side,
    entry,
    stop,
    target,
    sizeMultiplier: 0.5, // partial — accumulation deploys in tranches
    anchorPoolId: lower.id,
    rationale: [
      `defined zone: ${lower.id} → ${upper.id}`,
      `entry: zone midpoint`,
      `stop: lower pool wick (zone-failure invalidation)`,
      `target: upper pool centre`,
      `sizeMultiplier 0.5 (DCA tranche)`,
    ],
  });
}

// === Helpers ==============================================================

interface BuildPlanArgs {
  ctx: ProposalContext;
  playbook: TradePlan["playbook"];
  side: TradeSide;
  entry: number;
  stop: number;
  target: number;
  sizeMultiplier: number;
  anchorPoolId: string | null;
  rationale: string[];
}

function buildPlan(args: BuildPlanArgs): TradePlan | null {
  const riskAbs = Math.abs(args.entry - args.stop);
  const rewardAbs = Math.abs(args.target - args.entry);
  if (riskAbs === 0 || args.entry === 0) {
    // Geometry collapsed — entry == stop or invalid. Bail rather than
    // emit a plan with infinite R:R.
    return null;
  }
  return {
    timeframe: args.ctx.timeframe,
    playbook: args.playbook,
    side: args.side,
    entry: args.entry,
    stop: args.stop,
    target: args.target,
    riskRewardRatio: rewardAbs / riskAbs,
    riskPct: (riskAbs / args.entry) * 100,
    sizeMultiplier: args.sizeMultiplier,
    anchorPoolId: args.anchorPoolId,
    rationale: args.rationale,
  };
}

// Pick the dominant arm from an ExtractedArms bundle. Returns null when
// neither arm exists or when both are equal (caller decides what to do).
function pickDominantArm(arms: ExtractedArms): {
  side: "upper" | "lower";
  pool: AnalysisPool;
} | null {
  if (arms.dominantSide === "neither") return null;
  if (arms.dominantSide === "upper" && arms.upper) {
    return { side: "upper", pool: arms.upper.pool };
  }
  if (arms.dominantSide === "lower" && arms.lower) {
    return { side: "lower", pool: arms.lower.pool };
  }
  return null;
}

// Helper for the "we can't propose, here's why" return path. Returns
// null but keeps the rationale string available — though for now the
// caller doesn't surface it. Could log / surface later.
function rationalNull(_reason: string): null {
  return null;
}
