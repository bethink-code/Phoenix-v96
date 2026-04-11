// Experiment framework — shared types between client and server.
//
// An experiment is a reusable research question. The operator authors
// instances in the Library UI. Each instance has a `kind` (template) and
// a `config` blob whose shape depends on the template.
//
// Templates ship as code. Three for now:
//   - diagnostic    — single backtest, no variation, structured report.
//                     "Why isn't AEVO trading?" is this shape.
//   - param_sweep   — vary one tunable param across N values, score each,
//                     recommend the best. "Try minLevelRank 1..5".
//   - comparison    — N named alternatives (different configs entirely),
//                     score each, recommend the best. "Mode A vs Mode B".
//
// Every run produces a Recommendation. Some recommendations carry a `diff`
// (a concrete param change to apply); some are report-only with no action
// the operator needs to take. The Sunday Review UI lets the operator
// approve / reject / defer the ones with diffs.

export type ExperimentKind = "diagnostic" | "param_sweep" | "comparison";

// Configuration shapes per template ----------------------------------------

export interface DiagnosticConfig {
  pairId: string; // which trading pair to evaluate
  timeframe: "15m" | "1h" | "4h" | "12h" | "1d";
  lookbackBars: number; // how many candles back from now
}

// The keys we currently allow experiments to mutate. This list is the same
// allowlist used by the applier — adding a key here is a deliberate
// architectural decision, not an accident. Risk-manager keys
// (drawdown limits, riskPercentPerTrade) are intentionally absent per
// PRD §11.3 — those are human-only.
export const APPLIABLE_PARAM_KEYS = [
  "minLevelRank",
  "minRiskRewardRatio",
  "maxConcurrentPositions",
] as const;
export type AppliableParamKey = (typeof APPLIABLE_PARAM_KEYS)[number];

export interface ParamSweepConfig {
  pairId: string;
  timeframe: "15m" | "1h" | "4h" | "12h" | "1d";
  lookbackBars: number;
  paramKey: AppliableParamKey;
  values: number[]; // values to try, in order
}

export interface ComparisonConfig {
  pairId: string;
  timeframe: "15m" | "1h" | "4h" | "12h" | "1d";
  lookbackBars: number;
  alternatives: Array<{
    label: string;
    overrides: Partial<Record<AppliableParamKey, number>>;
  }>;
}

export type ExperimentConfig = DiagnosticConfig | ParamSweepConfig | ComparisonConfig;

// Run output ---------------------------------------------------------------

// A score is a single scalar — higher is better. Computed from a
// BacktestResult by `scoreBacktest()`. Used for sweeps and comparisons.
// Diagnostics don't need a score because they don't compare anything.
export interface ScoredVariant {
  label: string;
  score: number;
  trades: number;
  winRate: number;
  netPnl: number;
  maxDrawdown: number;
}

// The structured output of a single run. Always has `findings` (operator-
// readable bullet points). Has a `diff` only when there's a concrete param
// change the operator should approve.
export interface Recommendation {
  // Human-readable headline. Always present.
  summary: string;
  // Bullet points the operator reads. Always present.
  findings: string[];
  // The concrete param change this run is recommending. Absent for
  // report-only outcomes (e.g. a diagnostic that says "no change needed,
  // here's the histogram").
  diff?: {
    paramKey: AppliableParamKey;
    fromValue: number;
    toValue: number;
    rationale: string;
  };
  // For sweeps and comparisons — the full table of variants tried.
  variants?: ScoredVariant[];
  // For diagnostics — arbitrary structured payload (rejection histogram etc).
  diagnosticPayload?: Record<string, unknown>;
}

// Verdict lifecycle. Stored in `experiment_runs.verdict`.
//   pending     — produced by a run, awaiting human review
//   approved    — operator said yes, but applier hasn't run yet
//   applied     — applier wrote the diff to live config
//   rejected    — operator said no
//   deferred    — operator wants more data before deciding
//   no_action   — the run produced no diff (e.g. pure diagnostic) and is
//                 archived without needing approval
export type Verdict =
  | "pending"
  | "approved"
  | "applied"
  | "rejected"
  | "deferred"
  | "no_action";
