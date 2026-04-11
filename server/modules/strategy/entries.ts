import type { Level, SweepEvent } from "./types";
import type { Regime } from "../../../shared/schema";
import { getRegimeProfile } from "../regimeEngine";

// PRD §5.4 Entry + exit generation. Pure function — given a sweep event,
// current regime, and the full level list, produce a proposed trade
// (entry, stop, target, mode) or null.
//
// The risk manager is the gatekeeper after this: it decides whether to
// approve the proposal based on R:R, drawdown, size, etc.

export type SetupMode = "mode_a" | "mode_b";

// Tunables exposed to autoresearch and (eventually) the operator. Defaults
// preserve the original 1.5× behaviour so existing callers are unchanged.
export interface ProposalConfig {
  // Target must be at least this multiple of the risk distance away.
  // Lowering it admits tighter ranges; raising it forces bigger setups.
  targetDistanceMultiplier: number;
}

export const DEFAULT_PROPOSAL_CONFIG: ProposalConfig = {
  targetDistanceMultiplier: 1.5,
};

export interface TradeProposal {
  side: "long" | "short";
  setupMode: SetupMode;
  entryPrice: number;
  stopPrice: number;
  targetPrice: number;
  levelId: string;
  sweepCandleIndex: number;
  reasoning: string;
}

// Generate a proposal from the latest sweep, if the current regime permits it.
// Returns null when:
//   - no sweep happened
//   - the regime blocks this kind of setup (Mode A vs B gating)
//   - there's no suitable next-level target in the opposite direction
export function generateProposal(
  sweep: SweepEvent | null,
  allLevels: Level[],
  regime: Regime,
  config: ProposalConfig = DEFAULT_PROPOSAL_CONFIG
): TradeProposal | null {
  if (!sweep) return null;
  const profile = getRegimeProfile(regime);
  if (profile.entrySuppressed) return null;

  // Mode selection based on whether the sweep closed back inside.
  // Mode B (confirmation) requires closedBack; Mode A enters at the level
  // regardless but gets its stop beyond the wick.
  const mode: SetupMode = sweep.closedBack ? "mode_b" : "mode_a";
  if (!profile.permittedModes.includes(mode)) return null;

  // Direction: up-sweep against resistance → short, down-sweep against
  // support → long. PRD liquidity sweep reversal logic.
  const side: "long" | "short" = sweep.direction === "up" ? "short" : "long";

  // Trend regime only permits trades in the trend direction. We don't know
  // the trend from this input — the caller must gate via regime + upstream
  // trend detector. For Phase 1 we accept both sides when regime allows.

  const entryPrice = sweep.level.price;
  const stopPrice =
    side === "short"
      ? sweep.wickExtreme * 1.0005 // just beyond the wick
      : sweep.wickExtreme * 0.9995;

  const riskPerUnit = Math.abs(entryPrice - stopPrice);
  // Require the target to give at least N× the risk distance. Tight ranges
  // would otherwise produce same-price targets that look valid but aren't.
  // Multiplier is configurable so autoresearch can sweep it.
  const minTargetDistance = riskPerUnit * config.targetDistanceMultiplier;
  const target = findTargetLevel(allLevels, entryPrice, side, minTargetDistance);
  if (!target) return null;

  const reasoning = [
    `sweep_${sweep.direction}`,
    `level:${sweep.level.type}@${sweep.level.price.toFixed(2)}`,
    `rank:${sweep.level.rank}`,
    `mode:${mode}`,
    `target:${target.type}@${target.price.toFixed(2)}`,
  ].join(" ");

  return {
    side,
    setupMode: mode,
    entryPrice,
    stopPrice,
    targetPrice: target.price,
    levelId: sweep.level.id,
    sweepCandleIndex: sweep.candleIndex,
    reasoning,
  };
}

// Target is the next significant opposing-side level in the direction of
// the trade, but only counts if it's far enough from entry to give a useful
// reward. For a short: the nearest support below entry, separated by at
// least minDistance. For a long: the nearest resistance above entry,
// separated by at least minDistance. Uses rank as a tiebreaker.
function findTargetLevel(
  levels: Level[],
  entry: number,
  side: "long" | "short",
  minDistance: number
): Level | null {
  const candidates = levels.filter((l) => {
    if (side === "short") {
      return l.side === "support" && l.price < entry && entry - l.price >= minDistance;
    }
    return l.side === "resistance" && l.price > entry && l.price - entry >= minDistance;
  });
  if (candidates.length === 0) return null;
  // Prefer closer levels first, but weight by rank. A closer weak level is
  // better than a far strong level for target-setting (don't reach too far).
  candidates.sort((a, b) => {
    const distA = Math.abs(a.price - entry);
    const distB = Math.abs(b.price - entry);
    const scoreA = distA / Math.max(1, a.rank);
    const scoreB = distB / Math.max(1, b.rank);
    return scoreA - scoreB;
  });
  return candidates[0];
}
