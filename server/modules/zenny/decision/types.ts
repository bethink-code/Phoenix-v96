// Decision module — given a per-TF regime assessment with a recommended
// playbook, propose a concrete trade plan: side, entry, stop, target,
// risk metrics, and rationale.
//
// Each timeframe is its own self-contained environment (per the per-TF
// architecture in 2026-05-08). The decision module may derive multiple
// candidate geometries internally, but it emits one active TradePlan per TF.
// Higher TFs are visible from the operator's view as conviction context;
// they don't gate trades on other TFs.
//
// Pure functions only. The decision module reads analysis state and
// regime output; it doesn't touch the DB, doesn't place orders, doesn't
// have side effects. Order placement is the execution module's job
// (not yet built).
//
// V0 scope: real geometry (entry/stop/target derived from arms + pools),
// per-playbook logic, no per-tenant config yet (defaults in module).
// Later: tenant config for risk %, max concurrent, etc.

import type { Timeframe } from "../../../../shared/zennyTypes";
import type {
  Playbook,
  TfRegimeAssessment,
} from "../analysis/regime/types";
import type { ExtractedArms } from "../analysis/arms/extractArms";
import type { AnalysisPool } from "../analysis/orchestrator";

export type TradeSide = "long" | "short";

// Two-phase strategic split:
// 'reach' = ride toward a high-pull pool; 'take' = fade after the wick sweeps it.
// Phase records where the selected plan came from, even though only one
// winner is active per timeframe.
export type TradePhase = "reach" | "take";

export interface TradePlan {
  timeframe: Timeframe;
  playbook: Playbook;
  // Phase tells the runner / UI which playbook family produced this plan.
  // Used as part of the position-dedup key (one open position per
  // (symbol, tf, phase)).
  phase: TradePhase;
  side: TradeSide;
  // Geometry — all in price units. Entry/stop/target derived from arms
  // + pools per the playbook's specific logic.
  entry: number;
  stop: number;
  target: number;
  // Optional second take-profit target. REACH plans set this for the
  // two-stage TP1/TP2 convention; TAKE plans leave it null.
  target2?: number | null;
  // Derived metrics — pre-computed for the trading module / UI so they
  // don't need to redo the arithmetic.
  riskRewardRatio: number; // |target-entry| / |entry-stop|
  riskPct: number; // |entry-stop| / entry × 100
  // Notional sizing hint. v0: 1.0 standard, 0.7 BREAKOUT (spec §1.3),
  // 0.5 ACCUMULATION (DCA partial). Tenant config for risk-per-trade
  // multiplies this in the execution layer.
  sizeMultiplier: number;
  // Provenance — which pool defined the geometry. Lets the UI highlight
  // it on the chart and lets a backtest replay rebuild the trade.
  anchorPoolId: string | null;
  // Human-readable rationale lines, shortest-first. The card / log
  // surfaces these so the operator can see WHY the geometry is what
  // it is.
  rationale: string[];
}

// Inputs the proposer reads. Lifted from the orchestrator's per-TF
// computation so the proposers are pure of analysis state.
export interface ProposalContext {
  timeframe: Timeframe;
  candles: Array<{ open: number; high: number; low: number; close: number; openTime: number; closeTime: number; volume: number }>;
  currentPrice: number;
  arms: ExtractedArms;
  pools: AnalysisPool[];
  assessment: TfRegimeAssessment;
}

// Output shape from the top-level assembler.
export interface TradePlanResult {
  // Convenience pointer to the primary TF's selected plan.
  primary: TradePlan | null;
  // Selected winner per TF.
  perTimeframe: Partial<Record<Timeframe, TradePlan>>;
  // Array form kept for UI compatibility. In current logic each TF carries
  // at most one selected plan.
  plansPerTimeframe: Partial<Record<Timeframe, TradePlan[]>>;
}
