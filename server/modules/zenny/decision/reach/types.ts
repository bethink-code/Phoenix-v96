// REACH playbook types — Phase 1 of the institutional liquidity cycle.
//
// REACH = ride price toward a high-pull active pool BEFORE it gets swept.
// TAKE (the wick module) = fade after the pool is swept.
//
// Research note: pre-sweep REACH entry is NOT documented in any published
// practitioner source. Defaults are HYPOTHESIS, anchored to closest analogues
// (Dalton HVN density, Proof Trading liquidity-seeker thresholds). All numbers
// here are paper-test schedule items R1–R7. See
// memory/zenny_two_phase_strategy.md and zenny_paper_testing_schedule.md.

import type { Playbook } from "../../analysis/regime/types";

export type ReachEntryMethod =
  | "at-market"
  | "pullback-swing"
  | "pullback-fvg";

export interface ReachTradeConfig {
  // REACH is a continuation idea. Keep it out of regimes where the cleaner
  // behavior is to fade the edges instead of chasing the middle.
  allowedPlaybooks: Playbook[];

  // R1 — pull asymmetry threshold. dominant/subordinate must exceed this for
  // a REACH to fire. Default 2.0 (no published anchor; closest is Dalton's
  // 150–300% HVN density and Proof Trading's ~2× outsized-liquidity gate).
  pullAsymmetryThreshold: number;

  // R2 — entry method. v0 ships pullback-swing only; the others are stubbed
  // for future implementation (FVG detection isn't first-class yet, and
  // at-market is too aggressive for the v0 hypothesis).
  entryMethod: ReachEntryMethod;
  // For pullback-swing: how many bars of the recent history to scan for the
  // pullback swing point. 5 bars = roughly the most recent local extreme
  // on the trade-direction side.
  pullbackLookbackBars: number;

  // R3 — stop ATR buffer multiple beyond the opposite arm wick.
  // 0.25 default per ICT/Power of 3 + Turtle convention.
  stopAtrBufferMultiple: number;
  // ATR period — shared with execution module typically (14).
  atrPeriod: number;

  // R4 — TP1 placement as ratio of pool width back from pool centre.
  // 0.2 means TP1 = pool_centre - 0.2 × (centreLine - far edge of pool).
  // For long REACH on upper pool: TP1 sits 20% below the centre, on the
  // wick-side edge.
  tp1RatioOfPoolWidth: number;

  // Regime/HTF gating
  // REACH requires an aligned wireAngle direction — if direction is "down"
  // we don't take a long REACH, etc. Set false to disable (test only).
  requireDirectionAlignment: boolean;

  // R5 — time stop in bars; null = off (default per Carver-style).
  maxBarsInTrade: number | null;

  // R6 — sizing multiplier vs the TAKE base sizing. 1.0 = same R per trade
  // (Van Tharp). Half-Kelly intuition: drop to 0.5 if win rate < 35%.
  sizeMultiplierVsTake: number;

  // Hard veto for silly geometry. If the reward doesn't at least clear this
  // multiple of the risk, the plan never reaches the runner or UI.
  minRiskRewardRatio: number;

  // R7 — conflict-zone distance to pool that suppresses NEW REACH entries.
  // When current price is within N × ATR of the dominant pool centre, we
  // suppress new REACH (we're in TAKE territory). Held positions continue.
  conflictZoneAtrMultiple: number;

  // Effort vs Result filter (Wyckoff): if the last K bars showed high
  // volume AND small price progress on the dominant side, we're in
  // absorption — abort REACH. Default OFF until volume normalisation is
  // wired (volume scale varies wildly per asset).
  effortVsResultFilterEnabled: boolean;
}

// What proposeReachTrade reports back when it bails. Useful for the
// runner / tick log so the operator can see WHY no trade fired.
export type ReachAbortReason =
  | "no-dominant-arm"
  | "asymmetry-below-threshold"
  | "direction-not-aligned"
  | "in-conflict-zone"
  | "no-pullback-found"
  | "geometry-collapsed"
  | "regime-collapse"
  | "atr-unavailable";
