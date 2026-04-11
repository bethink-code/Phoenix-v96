// Experiment applier — the only path through which an experiment-generated
// recommendation can mutate live tenant config. Three guarantees:
//
//   1. **Allowlist of keys.** Only the keys in APPLIABLE_PARAM_KEYS can be
//      written. Risk-manager params (riskPercentPerTrade, drawdown limits)
//      are intentionally excluded per PRD §11.3 — those are human-only.
//      A buggy or malicious recommendation cannot reach them through here.
//
//   2. **Verification of approval state.** The applier reads the run row
//      and refuses to apply unless verdict is 'approved'. No race where
//      a still-pending recommendation gets written.
//
//   3. **Audit trail.** Every successful application writes an audit_logs
//      row with the diff and the operator id. Required by PRD §7.4.

import { storage } from "../../storage";
import { audit } from "../../auditLog";
import {
  APPLIABLE_PARAM_KEYS,
  type Recommendation,
  type AppliableParamKey,
} from "../../../shared/experiments";

export type ApplyResult =
  | { ok: true; tenantId: string; appliedDiff: { paramKey: AppliableParamKey; fromValue: number; toValue: number } }
  | { ok: false; reason: string };

export async function applyRecommendation(args: {
  runId: string;
  operatorUserId: string;
  ipAddress?: string;
}): Promise<ApplyResult> {
  const run = await storage.getExperimentRun(args.runId);
  if (!run) return { ok: false, reason: "run_not_found" };
  if (run.verdict !== "approved") {
    return { ok: false, reason: `verdict_not_approved (was: ${run.verdict})` };
  }

  const recommendation = run.recommendation as Recommendation | null;
  if (!recommendation || !recommendation.diff) {
    return { ok: false, reason: "recommendation_has_no_diff" };
  }
  const { diff } = recommendation;

  // Allowlist enforcement — the type system already constrains this, but
  // we double-check at runtime because the recommendation came in via JSON
  // and TypeScript types are erased after compilation.
  if (!APPLIABLE_PARAM_KEYS.includes(diff.paramKey)) {
    return { ok: false, reason: `param_key_not_appliable: ${diff.paramKey}` };
  }

  // Read current value to verify the diff's fromValue matches what's live.
  // If they diverge, the operator approved a stale recommendation — refuse.
  const config = await storage.getTenantConfig(run.tenantId);
  if (!config) return { ok: false, reason: "tenant_config_missing" };
  const currentLive = readNumericKey(config, diff.paramKey);
  if (currentLive !== diff.fromValue) {
    return {
      ok: false,
      reason: `stale_recommendation: live ${diff.paramKey} is ${currentLive}, recommendation expected ${diff.fromValue}`,
    };
  }

  // Apply. updateTenantConfig is the single write path for tenant_configs.
  await storage.updateTenantConfig(run.tenantId, {
    [diff.paramKey]: writableValue(diff.paramKey, diff.toValue),
  });
  await storage.setRunVerdict(args.runId, "applied", args.operatorUserId);

  audit({
    userId: args.operatorUserId,
    tenantId: run.tenantId,
    action: "apply_experiment_recommendation",
    resourceType: "experiment_run",
    resourceId: args.runId,
    outcome: "success",
    detail: {
      paramKey: diff.paramKey,
      fromValue: diff.fromValue,
      toValue: diff.toValue,
      experimentId: run.experimentId,
    },
    ipAddress: args.ipAddress,
  });

  return {
    ok: true,
    tenantId: run.tenantId,
    appliedDiff: { paramKey: diff.paramKey, fromValue: diff.fromValue, toValue: diff.toValue },
  };
}

// tenant_configs stores some numeric columns as PostgreSQL `numeric` (which
// drizzle returns as string). Read those back as numbers.
function readNumericKey(
  config: Record<string, unknown>,
  key: AppliableParamKey
): number {
  const v = config[key];
  if (typeof v === "string") return Number(v);
  if (typeof v === "number") return v;
  return NaN;
}

// And write them back in whatever shape drizzle expects. integer columns go
// as numbers, numeric columns as strings.
function writableValue(key: AppliableParamKey, value: number): number | string {
  if (key === "minLevelRank" || key === "maxConcurrentPositions") return value;
  // minRiskRewardRatio is a `numeric` column → drizzle expects string
  return String(value);
}
