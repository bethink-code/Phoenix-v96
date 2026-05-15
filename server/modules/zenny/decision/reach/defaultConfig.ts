// DEFAULT_REACH_CONFIG — research-backed defaults for the REACH playbook.
//
// All values map to entries R1–R7 in memory/zenny_paper_testing_schedule.md.
// Research caveat: pre-sweep REACH entry is unprecedented in published
// practice; these are HYPOTHESES. Backtesting is the validator.

import type { ReachTradeConfig } from "./types";

export const DEFAULT_REACH_CONFIG: ReachTradeConfig = {
  // REACH is for continuation / drive trades, not for fading a range edge.
  allowedPlaybooks: ["trending", "breakout"],
  // R1 — lowered 2.0 → 1.5 on 2026-05-09 after user observed setups
  // with asymmetry ~1.47 being missed. Still operates WITHIN the regime
  // gate; just relaxed the within-REACH threshold.
  pullAsymmetryThreshold: 1.5,
  // R2
  entryMethod: "pullback-swing",
  pullbackLookbackBars: 5,
  // R3
  stopAtrBufferMultiple: 0.25,
  atrPeriod: 14,
  // R4
  tp1RatioOfPoolWidth: 0.2,
  // Regime gating — direction must align (long REACH needs up direction)
  requireDirectionAlignment: true,
  // R5 — no time stop initially; matches TAKE convention E6
  maxBarsInTrade: null,
  // R6 — same R as TAKE per Van Tharp
  sizeMultiplierVsTake: 1.0,
  minRiskRewardRatio: 1.0,
  // R7
  conflictZoneAtrMultiple: 1.0,
  // Effort vs Result filter — disabled until volume normalisation lands
  effortVsResultFilterEnabled: false,
};
