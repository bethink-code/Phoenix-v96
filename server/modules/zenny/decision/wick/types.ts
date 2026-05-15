// Wick-entry decision module types.
//
// The decision module's job is to turn a regime + a pool + a current price
// into a concrete TradePlan. The pattern that drives the entry is the
// USER'S WICK ENTRY TAXONOMY — four practitioner-known mechanics:
//
//   midpoint       — entry at 50% of the swept wick (Consequent Encroachment)
//   extreme        — entry at the swept wick extreme (Turtle Soup / SFP)
//   beyond         — entry just past the swept wick (second-sweep fade)
//   anticipatory   — entry inside range BEFORE the wick fires (PD Array OTE)
//
// All four share target rule (opposing arm centre) and buffer rule
// (max(% × price, ATR multiple)). Stop placement and entry placement vary.
//
// Research: see memory/zenny_wick_entry_mechanics.md.
// Tunables awaiting paper-trade validation: memory/zenny_paper_testing_schedule.md.
//
// All numbers exposed as tunables — DEFAULT_WICK_CONFIG in defaultConfig.ts.

import type { Playbook } from "../../analysis/regime/types";

export type EntryStyle = "midpoint" | "extreme" | "beyond" | "anticipatory";

export type BeyondInterpretation = "second-sweep-fade" | "continuation";

export type BufferRule = "percentage" | "atr" | "max";

export type AnticipatoryDistanceRule =
  | "fixed-buffer"
  | "ote-fraction"
  | "current-price";

// Buffer applied to wick extremes for entries and stops. Crypto practitioner
// convention: 0.2% past the wick. Vol-aware practitioner convention:
// 0.25 × ATR(14). Default rule is the larger of both — belt-and-braces.
// W4 in paper testing schedule.
export interface BufferConfig {
  rule: BufferRule;
  percentage: number; // 0.002 = 0.2%
  atrPeriod: number; // 14
  atrMultiple: number; // 0.25
}

// Confirmation gate for fade entries (#1/#2/#3). Without close-back-inside,
// fade vs continuation is 50/50 — so the gate is ON for #2/#3 by default.
// Midpoint (#1) is exempt by default because the entry is already deeper
// than the wick, so the wick reclaim is structurally implied.
// W1 in paper testing schedule.
export interface ConfirmationConfig {
  requiredFor: EntryStyle[]; // default: ['extreme', 'beyond']
  maxBarsAfterSweep: number; // 1 = same/next bar acceptable
}

// Beyond-the-wick (#3) interpretation. Conventional: 'second-sweep-fade'.
// Contrarian (Brooks H2/L2): 'continuation'.
// W5 in paper testing schedule.
export interface BeyondConfig {
  interpretation: BeyondInterpretation;
  // Stop = wickExtreme + (stopMultiplier × buffer) past the wick. Wider than
  // #2 to accommodate the deeper second sweep. 2× by default per research.
  stopMultiplier: number;
}

// Anticipatory (#4) — placed before the wick is touched.
// W2 + W6 in paper testing schedule.
export interface AnticipatoryConfig {
  enabled: boolean;
  distanceRule: AnticipatoryDistanceRule;
  fixedBufferMultiple: number; // 1.5 = entry at wick - 1.5×buffer
  oteFraction: number; // 0.705 = ICT Sweet Spot
  // Anticipatory is ICT-only by canon. Restrict to TRENDING regime by default;
  // can be relaxed when paper-trading shows it works elsewhere.
  requireTrendingRegime: boolean;
}

// Regime → ordered list of allowed entry styles. The proposer tries them in
// order and returns the first that fires. Empty array = the regime gets no
// trade plan from this module.
// W3 in paper testing schedule.
export type RegimeStyleMatrix = Record<Playbook, EntryStyle[]>;

// Position sizing per entry style. Riskier styles get smaller multipliers.
// Tenant config in execution layer multiplies these by the per-trade %.
export type SizeMultiplierMap = Record<EntryStyle, number>;

export interface WickTradeConfig {
  buffer: BufferConfig;
  confirmation: ConfirmationConfig;
  beyond: BeyondConfig;
  anticipatory: AnticipatoryConfig;
  regimeMatrix: RegimeStyleMatrix;
  sizeMultiplier: SizeMultiplierMap;
  // Hard veto for low-payoff setups. Valid geometry is not enough if the
  // target is too small relative to the stop.
  minRiskRewardRatio: number;
  // Maximum bars between the sweep candle and "now" for a fade entry to be
  // considered. Past this, the sweep is stale.
  maxBarsSinceSweep: number;
}
