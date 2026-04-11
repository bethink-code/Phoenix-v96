import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import ResearcherIdentityCard from "@/components/ResearcherIdentityCard";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import type {
  ExperimentKind,
  Recommendation,
  ScoredVariant,
  AppliableParamKey,
} from "../../../shared/experiments";

// The operator's research bench. Two views:
//   Library — list of experiment definitions, run/edit/disable/delete.
//   Recommendations — pending recommendations from completed runs,
//                     approve/reject/defer/apply.
//
// New experiments are authored from the Library tab via the "+ New" button,
// which opens a small inline form. The form shape adapts to the chosen
// experiment kind. We don't try to do graphical configuration of every
// possible param — keep it text-input simple, get the user actually using
// the loop, then improve.

interface ExperimentRow {
  id: string;
  name: string;
  kind: ExperimentKind;
  config: Record<string, unknown>;
  enabled: boolean;
  createdAt: string;
}

interface RunRow {
  id: string;
  experimentId: string | null;
  baselineConfig: Record<string, unknown>;
  proposedConfig: Record<string, unknown>;
  metrics: Record<string, unknown>;
  recommendation: Recommendation | null;
  verdict: "pending" | "approved" | "applied" | "rejected" | "deferred" | "no_action";
  createdAt: string;
}

interface MarketPair {
  id: string;
  baseAsset: string;
  quoteAsset: string;
  displayName: string;
}

type TabKey = "library" | "recommendations" | "history" | "autoresearch";

interface AutoresearchCapabilities {
  available: boolean;
}

export default function Experiments() {
  const [tab, setTab] = useState<TabKey>("library");
  const pendingQuery = useQuery<RunRow[]>({
    queryKey: ["/api/tenant/recommendations/pending"],
  });
  const pendingCount = pendingQuery.data?.length ?? 0;

  // Probe whether the server has OPENAI_API_KEY configured. On prd it
  // doesn't (we keep the key out of prd config by design) so the tab
  // stays hidden in production. On localhost with the dev Doppler
  // config, it shows. Cached — capabilities don't change at runtime.
  const capabilities = useQuery<AutoresearchCapabilities>({
    queryKey: ["/api/autoresearch/capabilities"],
    staleTime: Infinity,
  });
  const autoresearchAvailable = capabilities.data?.available ?? false;

  const tabs: Array<{ key: TabKey; label: string; count: number | null }> = [
    { key: "library", label: "Library", count: null },
    { key: "recommendations", label: "Recommendations", count: pendingCount },
    { key: "history", label: "History", count: null },
  ];
  if (autoresearchAvailable) {
    tabs.push({
      key: "autoresearch",
      label: "Autoresearch",
      count: null,
    });
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="shrink-0 border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <div>
            <h1 className="text-lg font-semibold">Experiments</h1>
            <p className="text-xs text-muted-foreground">
              Research bench. Author experiments, run them, review recommendations.
            </p>
          </div>
          <Link href="/">
            <Button variant="outline" size="sm">← Dashboard</Button>
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 overflow-hidden p-6">
        <Card className="flex flex-1 flex-col overflow-hidden">
          <div className="flex shrink-0 gap-1 border-b border-border px-4">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  "-mb-px border-b-2 px-4 py-3 text-sm transition-colors",
                  tab === t.key
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                {t.label}
                {t.count != null && t.count > 0 && (
                  <span className="ml-2 rounded-full bg-primary/20 px-1.5 py-0.5 text-xs text-primary">
                    {t.count}
                  </span>
                )}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto">
            {tab === "library" && <LibraryTab />}
            {tab === "recommendations" && <RecommendationsTab />}
            {tab === "history" && <HistoryTab />}
            {tab === "autoresearch" && autoresearchAvailable && <AutoresearchTab />}
          </div>
        </Card>
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LIBRARY TAB
// ---------------------------------------------------------------------------

function LibraryTab() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  // Latest run result per experiment, kept in component state so it renders
  // inline immediately after the user clicks Run. Without this, a no_action
  // diagnostic disappears into History and the operator gets zero feedback.
  const [latestByExp, setLatestByExp] = useState<Record<string, RunRow>>({});
  const experiments = useQuery<ExperimentRow[]>({
    queryKey: ["/api/tenant/experiments"],
  });

  const runMutation = useMutation({
    mutationFn: async (id: string) => {
      const r = await apiRequest(`/api/tenant/experiments/${id}/run`, { method: "POST" });
      return (await r.json()) as RunRow;
    },
    onSuccess: (run, experimentId) => {
      setLatestByExp((prev) => ({ ...prev, [experimentId]: run }));
      qc.invalidateQueries({ queryKey: ["/api/tenant/recommendations/pending"] });
      qc.invalidateQueries({ queryKey: ["/api/tenant/experiment-runs"] });
    },
    onError: (e) => alert(`Run failed: ${(e as Error).message}`),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const r = await apiRequest(`/api/tenant/experiments/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled }),
      });
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/tenant/experiments"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const r = await apiRequest(`/api/tenant/experiments/${id}`, { method: "DELETE" });
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/tenant/experiments"] }),
  });

  const rows = experiments.data ?? [];

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {rows.length} experiment{rows.length === 1 ? "" : "s"}.
          {rows.length === 0 && " Click + New to author your first."}
        </p>
        <Button size="sm" onClick={() => setShowForm((s) => !s)}>
          {showForm ? "Cancel" : "+ New experiment"}
        </Button>
      </div>

      {showForm && <NewExperimentForm onCreated={() => setShowForm(false)} />}

      <div className="space-y-2">
        {rows.map((exp) => (
          <div
            key={exp.id}
            className={cn(
              "rounded-md border border-border bg-card/40 p-4",
              !exp.enabled && "opacity-50"
            )}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="truncate text-sm font-semibold">{exp.name}</h3>
                  <Badge className="border-border text-xs">{exp.kind}</Badge>
                  {!exp.enabled && (
                    <Badge className="border-amber-500/40 text-amber-300 text-xs">paused</Badge>
                  )}
                </div>
                <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
                  {summariseConfig(exp.kind, exp.config)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => runMutation.mutate(exp.id)}
                  disabled={runMutation.isPending || !exp.enabled}
                >
                  {runMutation.isPending && runMutation.variables === exp.id ? "Running…" : "Run"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => toggleMutation.mutate({ id: exp.id, enabled: !exp.enabled })}
                >
                  {exp.enabled ? "Pause" : "Enable"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    if (confirm(`Delete "${exp.name}"? Run history is preserved.`)) {
                      deleteMutation.mutate(exp.id);
                    }
                  }}
                >
                  Delete
                </Button>
              </div>
            </div>
            {/* Inline result panel — shows the latest run for this experiment
                if one happened in this session. For runs with a diff, also
                tells the operator to head to Recommendations to action it. */}
            {latestByExp[exp.id] && <InlineRunResult run={latestByExp[exp.id]} />}
          </div>
        ))}
      </div>
    </div>
  );
}

function InlineRunResult({ run }: { run: RunRow }) {
  const rec = run.recommendation;
  if (!rec) {
    return (
      <div className="mt-3 rounded border border-border/50 bg-card/30 p-3 text-xs text-muted-foreground">
        Run completed but produced no recommendation.
      </div>
    );
  }
  const verdictColor =
    run.verdict === "no_action"
      ? "border-border text-muted-foreground"
      : run.verdict === "pending"
        ? "border-amber-500/40 text-amber-300"
        : "border-border text-muted-foreground";
  return (
    <div className="mt-3 rounded border border-border/60 bg-background/40 p-3">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h4 className="text-sm font-semibold text-foreground">{rec.summary}</h4>
        <Badge className={cn("text-[10px]", verdictColor)}>{run.verdict}</Badge>
      </div>
      <ul className="list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
        {rec.findings.map((f, i) => (
          <li key={i}>{f}</li>
        ))}
      </ul>
      {rec.diff && (
        <div className="mt-2 rounded border border-amber-500/40 bg-amber-500/5 p-2 text-xs">
          <div className="font-mono text-amber-200">
            {rec.diff.paramKey}: {rec.diff.fromValue} → {rec.diff.toValue}
          </div>
          <div className="mt-1 text-muted-foreground">{rec.diff.rationale}</div>
          <div className="mt-2 text-[11px] text-amber-300/80">
            → Open the Recommendations tab to approve and apply.
          </div>
        </div>
      )}
      {rec.variants && rec.variants.length > 0 && (
        <div className="mt-2">
          <VariantsTable variants={rec.variants} />
        </div>
      )}
    </div>
  );
}

function summariseConfig(kind: ExperimentKind, config: Record<string, unknown>): string {
  const tf = (config.timeframe as string) ?? "?";
  const lookback = (config.lookbackBars as number) ?? "?";
  if (kind === "diagnostic") {
    return `diagnostic · ${tf} · ${lookback} bars`;
  }
  if (kind === "param_sweep") {
    const key = (config.paramKey as string) ?? "?";
    const values = ((config.values as number[]) ?? []).join(", ");
    return `sweep ${key} ∈ {${values}} · ${tf} · ${lookback} bars`;
  }
  if (kind === "comparison") {
    const alts = ((config.alternatives as Array<{ label: string }>) ?? [])
      .map((a) => a.label)
      .join(" vs ");
    return `compare ${alts} · ${tf} · ${lookback} bars`;
  }
  return JSON.stringify(config);
}

// ---------------------------------------------------------------------------
// NEW EXPERIMENT FORM
// ---------------------------------------------------------------------------

function NewExperimentForm({ onCreated }: { onCreated: () => void }) {
  const qc = useQueryClient();
  const pairs = useQuery<MarketPair[]>({ queryKey: ["/api/markets"] });
  const [name, setName] = useState("");
  const [kind, setKind] = useState<ExperimentKind>("diagnostic");
  const [pairId, setPairId] = useState<string>("");
  const [timeframe, setTimeframe] = useState<"15m" | "1h" | "4h" | "12h" | "1d">("15m");
  const [lookbackBars, setLookbackBars] = useState(300);
  const [paramKey, setParamKey] = useState<AppliableParamKey>("minLevelRank");
  const [valuesStr, setValuesStr] = useState("1,2,3,4,5");

  const create = useMutation({
    mutationFn: async () => {
      const config: Record<string, unknown> = { pairId, timeframe, lookbackBars };
      if (kind === "param_sweep") {
        config.paramKey = paramKey;
        config.values = valuesStr
          .split(",")
          .map((s) => Number(s.trim()))
          .filter((n) => Number.isFinite(n));
      }
      const r = await apiRequest("/api/tenant/experiments", {
        method: "POST",
        body: JSON.stringify({ name, kind, config }),
      });
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/tenant/experiments"] });
      onCreated();
    },
    onError: (e) => alert(`Create failed: ${(e as Error).message}`),
  });

  const canSubmit = name.trim().length > 0 && pairId.length > 0;

  return (
    <div className="rounded-md border border-primary/40 bg-primary/5 p-4">
      <h3 className="mb-3 text-sm font-semibold">New experiment</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label className="text-xs">Name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Why isn't AEVO trading?"
          />
        </div>
        <div>
          <Label className="text-xs">Template</Label>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as ExperimentKind)}
            className="h-9 w-full rounded-md border border-border bg-card px-3 text-sm"
          >
            <option value="diagnostic">Diagnostic — single backtest, structured report</option>
            <option value="param_sweep">Param sweep — try N values of one param</option>
            <option value="comparison" disabled>Comparison (coming soon)</option>
          </select>
        </div>
        <div>
          <Label className="text-xs">Pair</Label>
          <select
            value={pairId}
            onChange={(e) => setPairId(e.target.value)}
            className="h-9 w-full rounded-md border border-border bg-card px-3 text-sm"
          >
            <option value="">— pick a pair —</option>
            {pairs.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.displayName}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label className="text-xs">Timeframe</Label>
          <select
            value={timeframe}
            onChange={(e) => setTimeframe(e.target.value as typeof timeframe)}
            className="h-9 w-full rounded-md border border-border bg-card px-3 text-sm"
          >
            <option value="15m">15 minute</option>
            <option value="1h">1 hour</option>
            <option value="4h">4 hour</option>
            <option value="12h">12 hour</option>
            <option value="1d">Daily</option>
          </select>
        </div>
        <div>
          <Label className="text-xs">Lookback (bars)</Label>
          <Input
            type="number"
            value={lookbackBars}
            onChange={(e) => setLookbackBars(Number(e.target.value) || 0)}
          />
        </div>

        {kind === "param_sweep" && (
          <>
            <div>
              <Label className="text-xs">Parameter to sweep</Label>
              <select
                value={paramKey}
                onChange={(e) => setParamKey(e.target.value as AppliableParamKey)}
                className="h-9 w-full rounded-md border border-border bg-card px-3 text-sm"
              >
                <option value="minLevelRank">minLevelRank</option>
                <option value="minRiskRewardRatio">minRiskRewardRatio</option>
                <option value="maxConcurrentPositions">maxConcurrentPositions</option>
              </select>
            </div>
            <div>
              <Label className="text-xs">Values (comma-separated)</Label>
              <Input
                value={valuesStr}
                onChange={(e) => setValuesStr(e.target.value)}
                placeholder="1, 2, 3, 4, 5"
              />
            </div>
          </>
        )}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button
          size="sm"
          onClick={() => create.mutate()}
          disabled={!canSubmit || create.isPending}
        >
          {create.isPending ? "Creating…" : "Create"}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// RECOMMENDATIONS TAB
// ---------------------------------------------------------------------------

function RecommendationsTab() {
  const qc = useQueryClient();
  // Same reasoning as the page-level pending query: no background polling.
  const pending = useQuery<RunRow[]>({
    queryKey: ["/api/tenant/recommendations/pending"],
  });

  const action = useMutation({
    mutationFn: async ({
      id,
      verb,
    }: {
      id: string;
      verb: "approve" | "reject" | "defer" | "apply";
    }) => {
      const r = await apiRequest(`/api/tenant/recommendations/${id}/${verb}`, {
        method: "POST",
      });
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/tenant/recommendations/pending"] });
      qc.invalidateQueries({ queryKey: ["/api/tenant/experiment-runs"] });
      qc.invalidateQueries({ queryKey: ["/api/tenant"] });
    },
    onError: (e) => alert(`Action failed: ${(e as Error).message}`),
  });

  const rows = pending.data ?? [];
  if (rows.length === 0) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        No pending recommendations. Run an experiment from the Library tab.
      </div>
    );
  }

  return (
    <div className="space-y-3 p-6">
      {rows.map((run) => (
        <RecommendationCard
          key={run.id}
          run={run}
          onAction={(verb) => action.mutate({ id: run.id, verb })}
          pending={action.isPending}
        />
      ))}
    </div>
  );
}

function RecommendationCard({
  run,
  onAction,
  pending,
}: {
  run: RunRow;
  onAction: (verb: "approve" | "reject" | "defer" | "apply") => void;
  pending: boolean;
}) {
  const rec = run.recommendation;
  if (!rec) return null;

  return (
    <div className="rounded-md border border-border bg-card/40 p-4">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold">{rec.summary}</h3>
        <span className="shrink-0 text-[11px] text-muted-foreground">
          {new Date(run.createdAt).toLocaleString()}
        </span>
      </div>

      {/* Findings */}
      <ul className="mb-3 list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
        {rec.findings.map((f, i) => (
          <li key={i}>{f}</li>
        ))}
      </ul>

      {/* Diff */}
      {rec.diff && (
        <div className="mb-3 rounded border border-amber-500/40 bg-amber-500/5 p-3 text-xs">
          <div className="font-mono text-amber-200">
            {rec.diff.paramKey}: {rec.diff.fromValue} → {rec.diff.toValue}
          </div>
          <div className="mt-1 text-muted-foreground">{rec.diff.rationale}</div>
        </div>
      )}

      {/* Variants table for sweeps/comparisons */}
      {rec.variants && rec.variants.length > 0 && <VariantsTable variants={rec.variants} />}

      {/* Actions */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {run.verdict === "pending" && rec.diff && (
          <>
            <Button size="sm" onClick={() => onAction("approve")} disabled={pending}>
              Approve
            </Button>
            <Button size="sm" variant="outline" onClick={() => onAction("reject")} disabled={pending}>
              Reject
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onAction("defer")} disabled={pending}>
              Defer
            </Button>
          </>
        )}
        {run.verdict === "approved" && (
          <Button size="sm" onClick={() => onAction("apply")} disabled={pending}>
            Apply to live config
          </Button>
        )}
      </div>
    </div>
  );
}

function VariantsTable({ variants }: { variants: ScoredVariant[] }) {
  const max = Math.max(...variants.map((v) => v.score), 0.0001);
  return (
    <div className="mb-3 space-y-1">
      {variants.map((v) => {
        const pct = (v.score / max) * 100;
        return (
          <div
            key={v.label}
            className="relative overflow-hidden rounded border border-border/50 bg-card/30"
          >
            <div
              className="absolute inset-y-0 left-0 bg-primary/10"
              style={{ width: `${pct}%` }}
            />
            <div className="relative flex items-center justify-between gap-4 px-3 py-1.5 text-xs">
              <span className="font-mono text-foreground">{v.label}</span>
              <span className="font-mono text-muted-foreground">
                score {v.score.toFixed(2)} · {v.trades} trades · {Math.round(v.winRate * 100)}%
                wins
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// HISTORY TAB — every run, every verdict, for audit
// ---------------------------------------------------------------------------

function HistoryTab() {
  const runs = useQuery<RunRow[]>({ queryKey: ["/api/tenant/experiment-runs"] });
  const [expanded, setExpanded] = useState<string | null>(null);
  const rows = runs.data ?? [];
  if (rows.length === 0) {
    return <div className="p-6 text-sm text-muted-foreground">No runs yet.</div>;
  }
  return (
    <div className="space-y-2 p-6">
      {rows.map((r) => {
        const isOpen = expanded === r.id;
        return (
          <div key={r.id} className="rounded border border-border/50 bg-card/30">
            <button
              type="button"
              onClick={() => setExpanded(isOpen ? null : r.id)}
              className="flex w-full items-baseline justify-between gap-3 p-3 text-left hover:bg-card/50"
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm">
                  {r.recommendation?.summary ?? "(no recommendation)"}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {new Date(r.createdAt).toLocaleString()} ·{" "}
                  {isOpen ? "click to collapse" : "click for details"}
                </div>
              </div>
              <Badge className={cn("shrink-0 text-xs", verdictClass(r.verdict))}>
                {r.verdict}
              </Badge>
            </button>
            {isOpen && r.recommendation && (
              <div className="border-t border-border/50 p-3">
                <ul className="list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
                  {r.recommendation.findings.map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
                {r.recommendation.diff && (
                  <div className="mt-2 rounded border border-amber-500/40 bg-amber-500/5 p-2 text-xs">
                    <div className="font-mono text-amber-200">
                      {r.recommendation.diff.paramKey}: {r.recommendation.diff.fromValue} →{" "}
                      {r.recommendation.diff.toValue}
                    </div>
                    <div className="mt-1 text-muted-foreground">
                      {r.recommendation.diff.rationale}
                    </div>
                  </div>
                )}
                {r.recommendation.variants && r.recommendation.variants.length > 0 && (
                  <div className="mt-2">
                    <VariantsTable variants={r.recommendation.variants} />
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function verdictClass(v: RunRow["verdict"]): string {
  switch (v) {
    case "pending":
      return "border-amber-500/40 text-amber-300";
    case "approved":
      return "border-blue-500/40 text-blue-200";
    case "applied":
      return "border-emerald-500/40 text-emerald-300";
    case "rejected":
      return "border-red-500/40 text-red-300";
    case "deferred":
      return "border-border text-muted-foreground";
    case "no_action":
      return "border-border text-muted-foreground";
  }
}

// ---------------------------------------------------------------------------
// AUTORESEARCH TAB — local-only viewer for results.tsv
// ---------------------------------------------------------------------------
//
// Bounded LLM-driven parameter search. Mirrors the Dashboard pattern:
// identity card on top with status + actions, then inner tabs for the
// live narration feed, the iteration table, and the archive of past
// sessions. Local-only — gated upstream by the OPENAI_API_KEY probe.

interface ARSession {
  id: string;
  goal: string;
  pairId: string;
  timeframe: string;
  lookbackBars: number;
  regime: string;
  model: string;
  maxIterations: number;
  status: "running" | "done" | "aborted" | "error";
  iterationsRun: number;
  bestIterationId: string | null;
  bestScore: string | null;
  totalCostUsd: string;
  errorMessage: string | null;
  startedAt: string;
  stoppedAt: string | null;
}

interface ARIteration {
  id: string;
  sessionId: string;
  idx: number;
  params: Record<string, number>;
  score: string;
  trades: number;
  winRate: string;
  netPnl: string;
  maxDrawdownPct: string;
  barsEvaluated: number;
  entriesTaken: number;
  rejectionTop: Record<string, number> | null;
  status: "keep" | "discard" | "crash" | "baseline";
  narration: string;
  rationale: string | null;
  inputTokens: number;
  outputTokens: number;
  costUsd: string;
  createdAt: string;
}

function AutoresearchTab() {
  const qc = useQueryClient();
  const [innerTab, setInnerTab] = useState<"live" | "iterations" | "archive">("live");

  // Active session = currently running, OR most recently finished. The
  // identity card always shows ONE session — we resolve which one to show
  // by checking active first, then falling back to the latest archive
  // entry. This way the operator sees their last result without needing
  // to dig into archive.
  const activeQuery = useQuery<ARSession | null>({
    queryKey: ["/api/autoresearch/active"],
    refetchInterval: 3_000,
  });
  const archiveQuery = useQuery<ARSession[]>({
    queryKey: ["/api/autoresearch/sessions"],
    // Refetch when active session goes from running -> done
    refetchInterval: activeQuery.data?.status === "running" ? 3_000 : false,
  });

  const focusedSession =
    activeQuery.data ?? (archiveQuery.data?.[0] ?? null);

  // Iterations for the focused session, polled while running
  const iterationsQuery = useQuery<ARIteration[]>({
    queryKey: focusedSession
      ? [`/api/autoresearch/sessions/${focusedSession.id}/iterations`]
      : ["__no_session__"],
    enabled: !!focusedSession,
    refetchInterval: focusedSession?.status === "running" ? 3_000 : false,
  });

  const stopMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const r = await apiRequest(`/api/autoresearch/sessions/${sessionId}/stop`, {
        method: "POST",
      });
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/autoresearch/active"] });
    },
    onError: (e) => alert(`Stop failed: ${(e as Error).message}`),
  });

  const status: "idle" | "running" | "done" | "aborted" | "error" =
    focusedSession?.status ?? "idle";
  const iterationsRun = focusedSession?.iterationsRun ?? 0;
  const maxIterations = focusedSession?.maxIterations ?? 0;
  const bestScore = focusedSession?.bestScore ? Number(focusedSession.bestScore) : null;
  const spentUsd = focusedSession?.totalCostUsd ? Number(focusedSession.totalCostUsd) : 0;

  return (
    <div className="space-y-4 p-6">
      <ResearcherIdentityCard
        status={status}
        iterationsRun={iterationsRun}
        maxIterations={maxIterations}
        bestScore={bestScore}
        spentUsd={spentUsd}
        goal={focusedSession?.goal}
        stats={
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatBlock label="Status" value={status.toUpperCase()} />
            <StatBlock
              label="Iteration"
              value={
                focusedSession ? `${iterationsRun} / ${maxIterations}` : "—"
              }
            />
            <StatBlock
              label="Best score"
              value={bestScore != null && bestScore > 0 ? bestScore.toFixed(4) : "—"}
            />
            <StatBlock label="Spent" value={`$${spentUsd.toFixed(2)}`} />
          </div>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {status === "running" && focusedSession ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => stopMutation.mutate(focusedSession.id)}
                disabled={stopMutation.isPending}
              >
                {stopMutation.isPending ? "Stopping…" : "Stop"}
              </Button>
            ) : (
              <StartSessionForm />
            )}
            {focusedSession && focusedSession.errorMessage && (
              <span className="text-xs text-red-300">{focusedSession.errorMessage}</span>
            )}
          </div>
        }
      />

      {/* Inner tabs */}
      <div className="rounded-md border border-border bg-card/40">
        <div className="flex shrink-0 gap-1 border-b border-border px-4">
          {(
            [
              { key: "live", label: "Live" },
              { key: "iterations", label: "Iterations" },
              { key: "archive", label: "Archive" },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              onClick={() => setInnerTab(t.key)}
              className={cn(
                "-mb-px border-b-2 px-3 py-2 text-xs transition-colors",
                innerTab === t.key
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="max-h-[480px] overflow-y-auto">
          {innerTab === "live" && (
            <LiveResearchFeed
              session={focusedSession}
              iterations={iterationsQuery.data ?? []}
            />
          )}
          {innerTab === "iterations" && (
            <IterationsTable iterations={iterationsQuery.data ?? []} />
          )}
          {innerTab === "archive" && (
            <ArchiveList
              sessions={archiveQuery.data ?? []}
              activeId={focusedSession?.id ?? null}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function StatBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 text-lg font-semibold text-foreground">{value}</div>
    </div>
  );
}

// ---- Start session form ---------------------------------------------------

function StartSessionForm() {
  const qc = useQueryClient();
  const pairs = useQuery<MarketPair[]>({ queryKey: ["/api/markets"] });
  const [open, setOpen] = useState(false);
  const [goal, setGoal] = useState(
    "Find a config where this pair opens at least 1 trade per day with positive net PnL."
  );
  const [pairId, setPairId] = useState("");
  const [timeframe, setTimeframe] = useState<"15m" | "1h" | "4h" | "12h" | "1d">("1h");
  const [lookbackBars, setLookbackBars] = useState(500);
  const [model, setModel] = useState<"gpt-4o" | "gpt-4o-mini">("gpt-4o-mini");
  const [maxIterations, setMaxIterations] = useState(30);

  const start = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("/api/autoresearch/sessions", {
        method: "POST",
        body: JSON.stringify({
          goal,
          pairId,
          timeframe,
          lookbackBars,
          regime: "trending", // we'll let the operator pick later if needed
          model,
          maxIterations,
        }),
      });
      return r.json();
    },
    onSuccess: () => {
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["/api/autoresearch/active"] });
      qc.invalidateQueries({ queryKey: ["/api/autoresearch/sessions"] });
    },
    onError: (e) => alert(`Start failed: ${(e as Error).message}`),
  });

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        Start a session
      </Button>
    );
  }

  // Cost ballpark — see openai.ts PRICING. Each iteration ~2k input + 500
  // output tokens. This is informational only.
  const costPerIter = model === "gpt-4o" ? 0.01 : 0.0006;
  const estCost = (costPerIter * maxIterations).toFixed(2);

  const canSubmit = goal.trim().length > 5 && pairId.length > 0;

  return (
    <div className="w-full rounded-md border border-primary/40 bg-primary/5 p-4">
      <h3 className="mb-3 text-sm font-semibold">New autoresearch session</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label className="text-xs">Goal</Label>
          <Input value={goal} onChange={(e) => setGoal(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Pair</Label>
          <select
            value={pairId}
            onChange={(e) => setPairId(e.target.value)}
            className="h-9 w-full rounded-md border border-border bg-card px-3 text-sm"
          >
            <option value="">— pick a pair —</option>
            {pairs.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.displayName}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label className="text-xs">Timeframe</Label>
          <select
            value={timeframe}
            onChange={(e) => setTimeframe(e.target.value as typeof timeframe)}
            className="h-9 w-full rounded-md border border-border bg-card px-3 text-sm"
          >
            <option value="15m">15 minute</option>
            <option value="1h">1 hour</option>
            <option value="4h">4 hour</option>
            <option value="12h">12 hour</option>
            <option value="1d">Daily</option>
          </select>
        </div>
        <div>
          <Label className="text-xs">Lookback (bars)</Label>
          <Input
            type="number"
            value={lookbackBars}
            onChange={(e) => setLookbackBars(Number(e.target.value) || 0)}
          />
        </div>
        <div>
          <Label className="text-xs">Model</Label>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value as typeof model)}
            className="h-9 w-full rounded-md border border-border bg-card px-3 text-sm"
          >
            <option value="gpt-4o-mini">gpt-4o-mini (cheap, ~$0.02/session)</option>
            <option value="gpt-4o">gpt-4o (better, ~$0.30/session)</option>
          </select>
        </div>
        <div>
          <Label className="text-xs">Iterations (10–200)</Label>
          <Input
            type="number"
            value={maxIterations}
            onChange={(e) =>
              setMaxIterations(Math.max(10, Math.min(200, Number(e.target.value) || 30)))
            }
          />
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">
          Estimated cost: ~${estCost}
        </span>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => start.mutate()}
            disabled={!canSubmit || start.isPending}
          >
            {start.isPending ? "Starting…" : "Start session"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---- Live research feed ---------------------------------------------------

function LiveResearchFeed({
  session,
  iterations,
}: {
  session: ARSession | null;
  iterations: ARIteration[];
}) {
  if (!session) {
    return (
      <div className="p-6 text-xs text-muted-foreground">
        No session yet. Click "Start a session" above to kick one off.
      </div>
    );
  }
  if (iterations.length === 0 && session.status === "running") {
    return (
      <div className="p-6 text-xs text-muted-foreground">
        Session started. First iteration in flight…
      </div>
    );
  }
  if (iterations.length === 0) {
    return <div className="p-6 text-xs text-muted-foreground">No iterations yet.</div>;
  }
  // Newest at top — same as the bot's HeartbeatFeed
  const reversed = [...iterations].reverse();
  return (
    <div className="space-y-3 p-6">
      {reversed.map((it) => (
        <div
          key={it.id}
          className={cn(
            "border-l-2 pl-4 leading-snug",
            iterationMoodClass(it.status)
          )}
        >
          <div className="text-sm">{it.narration}</div>
          {it.rationale && (
            <div className="mt-0.5 text-[11px] italic text-muted-foreground">
              "{it.rationale}"
            </div>
          )}
          <div className="mt-0.5 text-[10px] text-muted-foreground/70">
            {new Date(it.createdAt).toLocaleTimeString()}
          </div>
        </div>
      ))}
    </div>
  );
}

function iterationMoodClass(status: ARIteration["status"]): string {
  switch (status) {
    case "keep":
      return "border-emerald-500/50 text-emerald-200";
    case "baseline":
      return "border-blue-500/50 text-blue-200";
    case "discard":
      return "border-border/60 text-muted-foreground";
    case "crash":
      return "border-red-500/50 text-red-300";
  }
}

// ---- Iterations table ----------------------------------------------------

function IterationsTable({ iterations }: { iterations: ARIteration[] }) {
  if (iterations.length === 0) {
    return <div className="p-6 text-xs text-muted-foreground">No iterations yet.</div>;
  }
  const maxScore = Math.max(...iterations.map((i) => Number(i.score) || 0), 0.0001);
  return (
    <div className="space-y-1 p-6">
      <div className="grid grid-cols-12 gap-2 px-3 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
        <div className="col-span-1">#</div>
        <div className="col-span-2 text-right">score</div>
        <div className="col-span-1 text-right">trades</div>
        <div className="col-span-2 text-right">win / pnl</div>
        <div className="col-span-1">status</div>
        <div className="col-span-5">narration</div>
      </div>
      {[...iterations].reverse().map((it) => {
        const score = Number(it.score) || 0;
        const widthPct = (score / maxScore) * 100;
        return (
          <div
            key={it.id}
            className="relative overflow-hidden rounded border border-border/40 bg-card/30"
          >
            {score > 0 && (
              <div
                className="absolute inset-y-0 left-0 bg-primary/10"
                style={{ width: `${widthPct}%` }}
              />
            )}
            <div className="relative grid grid-cols-12 items-center gap-2 px-3 py-2 text-xs">
              <div className="col-span-1 font-mono text-muted-foreground">{it.idx + 1}</div>
              <div className="col-span-2 text-right font-mono">{score.toFixed(4)}</div>
              <div className="col-span-1 text-right font-mono text-muted-foreground">
                {it.trades}
              </div>
              <div className="col-span-2 text-right font-mono text-muted-foreground">
                {Math.round(Number(it.winRate) * 100)}% / {Number(it.netPnl).toFixed(0)}
              </div>
              <div className="col-span-1">
                <Badge className={cn("text-[10px]", iterationStatusClass(it.status))}>
                  {it.status}
                </Badge>
              </div>
              <div className="col-span-5 truncate text-muted-foreground" title={it.narration}>
                {it.narration}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function iterationStatusClass(status: ARIteration["status"]): string {
  switch (status) {
    case "keep":
      return "border-emerald-500/40 text-emerald-300";
    case "baseline":
      return "border-blue-500/40 text-blue-200";
    case "discard":
      return "border-border text-muted-foreground";
    case "crash":
      return "border-red-500/40 text-red-300";
  }
}

// ---- Archive list --------------------------------------------------------

function ArchiveList({
  sessions,
  activeId,
}: {
  sessions: ARSession[];
  activeId: string | null;
}) {
  if (sessions.length === 0) {
    return (
      <div className="p-6 text-xs text-muted-foreground">
        No past sessions yet. Once you've run a session it'll appear here.
      </div>
    );
  }
  return (
    <div className="space-y-2 p-6">
      {sessions.map((s) => (
        <div
          key={s.id}
          className={cn(
            "rounded border bg-card/30 p-3",
            s.id === activeId ? "border-primary/40" : "border-border/40"
          )}
        >
          <div className="flex items-baseline justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm">{s.goal}</div>
              <div className="text-[11px] text-muted-foreground">
                {new Date(s.startedAt).toLocaleString()} · {s.timeframe} ·{" "}
                {s.iterationsRun}/{s.maxIterations} iters · {s.model} · $
                {Number(s.totalCostUsd).toFixed(2)}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm">
                {s.bestScore ? Number(s.bestScore).toFixed(4) : "—"}
              </span>
              <Badge className={cn("text-[10px]", sessionStatusClass(s.status))}>
                {s.status}
              </Badge>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function sessionStatusClass(status: ARSession["status"]): string {
  switch (status) {
    case "running":
      return "border-amber-500/40 text-amber-300";
    case "done":
      return "border-emerald-500/40 text-emerald-300";
    case "aborted":
      return "border-border text-muted-foreground";
    case "error":
      return "border-red-500/40 text-red-300";
  }
}
