import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import ResearcherIdentityCard from "@/components/ResearcherIdentityCard";
import ConfirmModal from "@/components/ConfirmModal";
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

type TabKey = "live" | "history" | "library" | "recommendations";

interface AutoresearchCapabilities {
  available: boolean;
}

export default function Experiments() {
  // Default landing tab is Live (the active autoresearch session view)
  // when autoresearch is available. On prd it's hidden so we land on
  // History instead.
  const [tab, setTab] = useState<TabKey>("live");
  // Prefill payload for the start form. Set when the operator clicks
  // "Continue from this iteration" anywhere in the page; the start form
  // consumes it (auto-opens, applies values) and clears it via the
  // onPrefillConsumed callback. Lifted to the top-level so it survives
  // tab switches.
  const [startPrefill, setStartPrefill] = useState<StartFormPrefill | null>(null);
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

  // Top-level tabs are flat. Live is the active autoresearch session
  // view (with sub-tabs underneath the identity card for Trades / Score
  // / Iterations / Successes — handled inside AutoresearchSurface).
  // History is the archive of past sessions. Library/Recommendations
  // are the legacy manual framework.
  const tabs: Array<{ key: TabKey; label: string; count: number | null }> = [];
  if (autoresearchAvailable) {
    tabs.push({ key: "live", label: "Live", count: null });
  }
  tabs.push({ key: "history", label: "History", count: null });
  tabs.push({ key: "library", label: "Library", count: null });
  tabs.push({ key: "recommendations", label: "Recommendations", count: pendingCount });

  // If autoresearch isn't available (prd), redirect Live to History.
  useEffect(() => {
    if (!autoresearchAvailable && tab === "live") {
      setTab("history");
    }
  }, [autoresearchAvailable, tab]);

  return (
    <div className="min-h-screen bg-background">
      {/* Header is sticky so the tabs stay reachable when the page is
          scrolled. NO h-screen / flex-col / overflow-hidden anywhere in
          the layout — the rule is: scroll the window, not elements
          inside it. */}
      <header className="sticky top-0 z-20 border-b border-border bg-background">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <div>
            <h1 className="text-lg font-semibold">Autoresearch</h1>
            <p className="text-xs text-muted-foreground">
              Bounded LLM-driven parameter search. Start a session, watch it run, review the result in History.
            </p>
          </div>
          <Link href="/">
            <Button variant="outline" size="sm">← Dashboard</Button>
          </Link>
        </div>
        {/* Tabs join the sticky header so they're always visible */}
        <div className="mx-auto flex max-w-6xl gap-1 px-6">
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
      </header>

      <main className="mx-auto max-w-6xl px-6 py-6">
        {/* Live renders the AutoresearchSurface — identity card +
            start form + 4 sub-tabs (Trades / Score / Iterations /
            Successes). The sub-tabs are owned by the surface itself. */}
        {tab === "live" && autoresearchAvailable && (
          <AutoresearchSurface
            onViewHistory={() => setTab("history")}
            prefill={startPrefill}
            onPrefillConsumed={() => setStartPrefill(null)}
            onContinueFromIteration={(p) => {
              setStartPrefill(p);
              setTab("live");
            }}
          />
        )}
        {tab === "history" && <HistoryTab />}
        {tab === "library" && <LibraryTab />}
        {tab === "recommendations" && <RecommendationsTab />}
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
      <div className="text-sm text-muted-foreground">
        No pending recommendations. Run an experiment from the Library tab.
      </div>
    );
  }

  return (
    <div className="space-y-3">
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
// HISTORY TAB — unified timeline of past research activity
// ---------------------------------------------------------------------------
//
// Two sources merged into one chronological list:
//   1. Autoresearch sessions  → rich cards with verdict + chart + params
//   2. Manual experiment runs → smaller expandable cards (existing behaviour)
//
// Most important info first: results-led headlines, supporting detail
// underneath. The richest cards (autoresearch sessions) lead because
// they carry the most useful insights.

function HistoryTab() {
  // Light refetch so a session that finishes while you're on this tab
  // appears without a manual refresh. 10s is plenty — sessions take
  // minutes, this isn't a live screen.
  const sessions = useQuery<ARSession[]>({
    queryKey: ["/api/autoresearch/sessions"],
    refetchInterval: 10_000,
  });
  const runs = useQuery<RunRow[]>({ queryKey: ["/api/tenant/experiment-runs"] });

  // Running sessions live on the Autoresearch tab. History only shows
  // finished ones (done/aborted/error) so the "View result in History"
  // button always lands on a row that has a verdict to render.
  const sessionRows = (sessions.data ?? []).filter(
    (s) => s.status !== "running"
  );
  const runRows = runs.data ?? [];

  if (sessionRows.length === 0 && runRows.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        No history yet. Run an autoresearch session or a manual experiment to get started.
      </div>
    );
  }

  // Merge by date, newest first. Each entry knows its kind so we render
  // it with the right component.
  type TimelineItem =
    | { kind: "session"; at: number; row: ARSession }
    | { kind: "run"; at: number; row: RunRow };
  const timeline: TimelineItem[] = [
    ...sessionRows.map((s) => ({
      kind: "session" as const,
      at: new Date(s.startedAt).getTime(),
      row: s,
    })),
    ...runRows.map((r) => ({
      kind: "run" as const,
      at: new Date(r.createdAt).getTime(),
      row: r,
    })),
  ].sort((a, b) => b.at - a.at);

  return (
    <div className="space-y-4">
      {timeline.map((item) =>
        item.kind === "session" ? (
          <SessionHistoryCard key={`s-${item.row.id}`} session={item.row} />
        ) : (
          <ManualRunHistoryCard key={`r-${item.row.id}`} run={item.row} />
        )
      )}
    </div>
  );
}

// Collapsible card for an autoresearch session. Default state is
// collapsed — at 50+ sessions in History, expanded-by-default would
// make the page unscrollable. Collapsed shows just enough to scan:
// the goal as the title, the verdict headline as the key finding,
// a sparkline of score progression, and a metadata strip. Click to
// expand into the full SessionResult body (chart with axes, params).
function SessionHistoryCard({
  session,
}: {
  session: ARSession;
  // onContinueFromIteration is no longer used here — clicking a card
  // opens a dedicated SessionDetail page in a new browser tab, and
  // any Continue actions happen from THAT page (which has its own
  // path back to the Live tab via prefill). Keeping the prop in
  // HistoryTab's signature for forward compat but not threading.
}) {
  // History cards used to expand inline. Now they're pure summary
  // cards: title + action + sparkline + metadata. Click anywhere on
  // the card to open the full session detail in a new browser tab,
  // letting the operator compare multiple past sessions side by side.
  const iterationsQuery = useQuery<ARIteration[]>({
    queryKey: [`/api/autoresearch/sessions/${session.id}/iterations`],
  });
  const iterations = iterationsQuery.data ?? [];
  const verdict = computeVerdict(session, iterations);
  const toneClass = toneToClass(verdict.tone);

  return (
    <a
      href={`/experiments/sessions/${session.id}`}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "block rounded-lg border p-5 transition-colors hover:bg-foreground/[0.02]",
        toneClass
      )}
    >
      {/* ACTION — biggest text on the card. Plain language description
          of what the session produced. Mode badge sits next to the
          status badge so the operator can tell tune from discover
          sessions at a glance. */}
      <div className="flex items-start justify-between gap-3">
        <h3 className="min-w-0 flex-1 text-lg font-semibold leading-snug text-foreground">
          {verdict.action}
        </h3>
        <div className="flex shrink-0 items-center gap-1">
          <Badge className={cn("text-[10px]", modeBadgeClass(session.mode))}>
            {session.mode}
          </Badge>
          <Badge className={cn("text-[10px]", sessionStatusClass(session.status))}>
            {session.status}
          </Badge>
        </div>
      </div>

      {/* Optional supporting detail — smaller, grey */}
      {verdict.detail && (
        <p className="mt-1 text-xs text-muted-foreground">{verdict.detail}</p>
      )}

      {/* Sparkline — visible at-a-glance trade-count-over-iterations
          shape. Trades is the more informative metric than score for
          diagnostic experiments (score is 0 unless trades >= 3, so a
          score sparkline is a flat line by definition for "no trades"
          sessions). */}
      {iterations.length > 0 && (
        <div className="mt-3">
          <Sparkline iterations={iterations} metric="trades" />
        </div>
      )}

      {/* Goal — context, not headline. Small and grey because the
          operator already knows what they asked; the answer is what
          they care about. */}
      <p className="mt-3 text-[11px] text-muted-foreground/70">
        Goal: {session.goal}
      </p>

      {/* Metadata strip */}
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground/70">
        <span>{new Date(session.startedAt).toLocaleDateString()}</span>
        <span>·</span>
        <span>{session.timeframe} · {session.regime}</span>
        <span>·</span>
        <span>{session.iterationsRun}/{session.maxIterations} iters</span>
        <span>·</span>
        <span>{session.model}</span>
        <span>·</span>
        <span>${Number(session.totalCostUsd).toFixed(2)}</span>
        <span className="ml-auto text-foreground/60">open in new tab ↗</span>
      </div>
    </a>
  );
}

// Compact card for a manual experiment run — same expandable behaviour
// as before. These are smaller because they carry less rich data than
// an autoresearch session (no iterations, no chart).
function ManualRunHistoryCard({ run }: { run: RunRow }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded border border-border/50 bg-card/30">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-baseline justify-between gap-3 p-3 text-left hover:bg-card/50"
      >
        <div className="min-w-0 flex-1">
          <div className="text-sm">
            {run.recommendation?.summary ?? "(no recommendation)"}
          </div>
          <div className="text-[11px] text-muted-foreground">
            manual experiment · {new Date(run.createdAt).toLocaleString()} ·{" "}
            {open ? "click to collapse" : "click for details"}
          </div>
        </div>
        <Badge className={cn("shrink-0 text-xs", verdictClass(run.verdict))}>
          {run.verdict}
        </Badge>
      </button>
      {open && run.recommendation && (
        <div className="border-t border-border/50 p-3">
          <ul className="list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
            {run.recommendation.findings.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
          {run.recommendation.diff && (
            <div className="mt-2 rounded border border-amber-500/40 bg-amber-500/5 p-2 text-xs">
              <div className="font-mono text-amber-200">
                {run.recommendation.diff.paramKey}: {run.recommendation.diff.fromValue} →{" "}
                {run.recommendation.diff.toValue}
              </div>
              <div className="mt-1 text-muted-foreground">
                {run.recommendation.diff.rationale}
              </div>
            </div>
          )}
          {run.recommendation.variants && run.recommendation.variants.length > 0 && (
            <div className="mt-2">
              <VariantsTable variants={run.recommendation.variants} />
            </div>
          )}
        </div>
      )}
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
  mode: "tune" | "discover";
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
  status: "keep" | "discard" | "crash" | "baseline" | "sampled";
  narration: string;
  rationale: string | null;
  inputTokens: number;
  outputTokens: number;
  costUsd: string;
  createdAt: string;
}

export type SessionView = "trades" | "score" | "iterations" | "successes";

// Shared layout used by both the live AutoresearchSurface and the
// dedicated SessionDetail page. Takes a session + iterations and renders
// the identity card + 4 sub-tabs (Trades / Score / Iterations /
// Successes). Caller provides optional `actions` for the identity card
// (Live tab provides Start/Stop/View buttons; SessionDetail leaves it
// empty so it's a pure viewer).
export function SessionDetailView({
  session,
  iterations,
  actions,
  onContinueFromIteration,
}: {
  session: ARSession | null;
  iterations: ARIteration[];
  actions?: React.ReactNode;
  onContinueFromIteration?: (p: StartFormPrefill) => void;
}) {
  const [view, setView] = useState<SessionView>("trades");
  const status: "idle" | "running" | "done" | "aborted" | "error" =
    session?.status ?? "idle";
  const iterationsRun = session?.iterationsRun ?? 0;
  const maxIterations = session?.maxIterations ?? 0;
  const bestScore = session?.bestScore ? Number(session.bestScore) : null;
  const spentUsd = session?.totalCostUsd ? Number(session.totalCostUsd) : 0;

  // Market lookup for the pair label. The session row only stores
  // pairId (uuid); the display symbol lives on the market_pairs row.
  // This query is already in the TanStack cache from other pages
  // (StartSessionForm uses it too) so there's no extra network cost.
  const marketsQuery = useQuery<MarketPair[]>({ queryKey: ["/api/markets"] });
  const pair = session?.pairId
    ? marketsQuery.data?.find((m) => m.id === session.pairId) ?? null
    : null;
  const pairLabel = pair ? `${pair.baseAsset}${pair.quoteAsset}` : "—";

  // Successes and best P&L — any iteration that actually traded AND
  // was profitable counts. Same rule used by the Successes sub-tab
  // and by the top-25% highlight on iteration rows, so all three
  // surfaces agree on what "worth looking at" means.
  const successes = iterations.filter(
    (i) => i.trades > 0 && Number(i.netPnl) > 0
  );
  const successCount = successes.length;
  const bestPnl =
    successes.length > 0
      ? Math.max(...successes.map((i) => Number(i.netPnl)))
      : null;

  return (
    <div className="space-y-4">
      <ResearcherIdentityCard
        status={status}
        iterationsRun={iterationsRun}
        maxIterations={maxIterations}
        bestScore={bestScore}
        spentUsd={spentUsd}
        goal={session?.goal}
        stats={
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <StatBlock label="Status" value={status.toUpperCase()} />
            <StatBlock label="Pair" value={pairLabel} />
            <StatBlock
              label="Iteration"
              value={session ? `${iterationsRun} / ${maxIterations}` : "—"}
            />
            <StatBlock
              label="Successes"
              value={session ? String(successCount) : "—"}
            />
            <StatBlock
              label="Best P&L"
              value={
                bestPnl != null
                  ? `${bestPnl >= 0 ? "+" : ""}$${bestPnl.toFixed(2)}`
                  : "—"
              }
            />
            <StatBlock label="Spent" value={`$${spentUsd.toFixed(2)}`} />
          </div>
        }
        actions={actions}
      />
      <SessionViewTabs view={view} onChange={setView} />
      <SessionViewContent
        view={view}
        session={session}
        iterations={iterations}
        onContinueFromIteration={onContinueFromIteration}
      />
    </div>
  );
}

function AutoresearchSurface({
  onViewHistory,
  prefill,
  onPrefillConsumed,
  onContinueFromIteration,
}: {
  onViewHistory: () => void;
  prefill: StartFormPrefill | null;
  onPrefillConsumed: () => void;
  onContinueFromIteration: (p: StartFormPrefill) => void;
}) {
  const qc = useQueryClient();

  // Active session = currently running, OR most recently finished. The
  // identity card always shows ONE session — we resolve which one to show
  // by checking active first, then falling back to the latest archive
  // entry. This way the operator sees their last result without needing
  // to dig into archive.
  // Polling cadences are calibrated to ≈ iteration speed (~3-5s per
  // iteration). Faster polling buys nothing because the data only changes
  // when an iteration completes, and faster polling burns rate-limit
  // budget.
  const activeQuery = useQuery<ARSession | null>({
    queryKey: ["/api/autoresearch/active"],
    refetchInterval: 5_000,
  });
  const archiveQuery = useQuery<ARSession[]>({
    queryKey: ["/api/autoresearch/sessions"],
    refetchInterval: activeQuery.data?.status === "running" ? 5_000 : false,
  });

  const focusedSession =
    activeQuery.data ?? (archiveQuery.data?.[0] ?? null);

  // Iterations for the focused session, polled while running
  const iterationsQuery = useQuery<ARIteration[]>({
    queryKey: focusedSession
      ? [`/api/autoresearch/sessions/${focusedSession.id}/iterations`]
      : ["__no_session__"],
    enabled: !!focusedSession,
    refetchInterval: focusedSession?.status === "running" ? 5_000 : false,
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

  // Live-tab actions: only two cases that need a button.
  //   running  → Stop (graceful)
  //   idle / done / aborted / error → Start a session (form)
  // No "View result in History" — the full result is already visible
  // right here in the sub-tabs below; jumping to History would just
  // show the same thing twice.
  const actions = (
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
        <StartSessionForm
          prefill={prefill ?? undefined}
          onPrefillConsumed={onPrefillConsumed}
        />
      )}
      {focusedSession && focusedSession.errorMessage && (
        <span className="text-xs text-red-300">{focusedSession.errorMessage}</span>
      )}
    </div>
  );

  return (
    <SessionDetailView
      session={focusedSession}
      iterations={iterationsQuery.data ?? []}
      actions={actions}
      onContinueFromIteration={onContinueFromIteration}
    />
  );
}

// Sub-tab bar for the active session views. Lives directly under the
// identity card. Same visual language as the page-level tabs.
function SessionViewTabs({
  view,
  onChange,
}: {
  view: SessionView;
  onChange: (v: SessionView) => void;
}) {
  const tabs: Array<{ key: SessionView; label: string }> = [
    { key: "trades", label: "Trades" },
    { key: "score", label: "Score" },
    { key: "iterations", label: "Iterations" },
    { key: "successes", label: "Successes" },
  ];
  return (
    <div className="flex gap-1 border-b border-border">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={cn(
            "-mb-px border-b-2 px-3 py-2 text-xs transition-colors",
            view === t.key
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// Renders one of the four session sub-views. Pure switch — used by
// both AutoresearchSurface and the expanded body of SessionHistoryCard
// so the structure stays consistent.
function SessionViewContent({
  view,
  session,
  iterations,
  onContinueFromIteration,
}: {
  view: SessionView;
  session: ARSession | null;
  iterations: ARIteration[];
  onContinueFromIteration?: (p: StartFormPrefill) => void;
}) {
  if (!session) {
    return (
      <div className="text-xs text-muted-foreground">
        No session yet. Click "Start a session" above to kick one off.
      </div>
    );
  }
  if (iterations.length === 0 && session.status === "running") {
    return (
      <div className="text-xs text-muted-foreground">
        Session started. First iteration in flight…
      </div>
    );
  }
  if (iterations.length === 0) {
    return <div className="text-xs text-muted-foreground">No iterations yet.</div>;
  }

  // The Continue handler — converts an iteration into a StartFormPrefill
  // by carrying forward the session's pair/timeframe/regime/etc and
  // setting seedParams to the iteration's params.
  const continueFromIteration = onContinueFromIteration
    ? (it: ARIteration) =>
        onContinueFromIteration({
          seedParams: it.params,
          pairId: session.pairId,
          timeframe: session.timeframe as StartFormPrefill["timeframe"],
          regime: session.regime as StartFormPrefill["regime"],
          lookbackBars: session.lookbackBars,
          model: session.model as StartFormPrefill["model"],
          mode: session.mode,
          sourceLabel: `iteration #${it.idx + 1}`,
        })
    : undefined;

  if (view === "trades") {
    return <IterationChart iterations={iterations} metric="trades" showBest={session.mode === "tune"} />;
  }
  if (view === "score") {
    return <IterationChart iterations={iterations} metric="score" showBest={session.mode === "tune"} />;
  }
  if (view === "iterations") {
    return (
      <IterationsTable
        iterations={iterations}
        onContinueFromIteration={continueFromIteration}
      />
    );
  }
  if (view === "successes") {
    return (
      <SuccessesView
        iterations={iterations}
        onContinueFromIteration={continueFromIteration}
      />
    );
  }
  return null;
}

// "Successes" — filtered iteration list. A success is any iteration
// that actually traded AND was profitable (trades > 0 AND netPnl > 0).
// Sorted by net P&L descending so the strongest candidates lead.
// Pure data filter, no opinion. Matches the rule in SessionDetailView's
// stats counter and the top-25% highlight on iteration rows so all
// three surfaces agree on what "worth looking at" means.
function SuccessesView({
  iterations,
  onContinueFromIteration,
}: {
  iterations: ARIteration[];
  onContinueFromIteration?: (it: ARIteration) => void;
}) {
  const successes = iterations
    .filter((i) => i.trades > 0 && Number(i.netPnl) > 0)
    .sort((a, b) => Number(b.netPnl) - Number(a.netPnl));

  if (successes.length === 0) {
    return (
      <div className="rounded border border-border/40 bg-card/30 p-4 text-xs text-muted-foreground">
        No successes yet. A success is an iteration that actually traded AND was profitable. None of the {iterations.length} iterations met both criteria.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        {successes.length} of {iterations.length} iterations traded profitably. Sorted by net P&L descending.
      </p>
      <IterationsTable
        iterations={successes}
        onContinueFromIteration={onContinueFromIteration}
      />
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

// Prefill payload an external caller (e.g. an iteration row's "Continue
// from this" button) can pass in to pre-populate the form. When set,
// the form auto-opens, applies the values, and the seedParams banner
// becomes visible. consumed by the form via onPrefillConsumed.
interface StartFormPrefill {
  seedParams?: Record<string, number>;
  pairId?: string;
  timeframe?: "15m" | "1h" | "4h" | "12h" | "1d";
  regime?:
    | "ranging"
    | "trending"
    | "breakout"
    | "high_volatility"
    | "low_liquidity"
    | "accumulation_distribution";
  lookbackBars?: number;
  model?: "gpt-4o" | "gpt-4o-mini";
  maxIterations?: number;
  mode?: "tune" | "discover";
  // Source iteration label, for the banner ("Continuing from session X iter Y")
  sourceLabel?: string;
}

function StartSessionForm({
  prefill,
  onPrefillConsumed,
}: {
  prefill?: StartFormPrefill;
  onPrefillConsumed?: () => void;
}) {
  const qc = useQueryClient();
  const pairs = useQuery<MarketPair[]>({ queryKey: ["/api/markets"] });
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"tune" | "discover">("tune");
  const [goal, setGoal] = useState(
    "Find a config where this pair opens at least 1 trade per day with positive net PnL."
  );
  const [pairId, setPairId] = useState("");
  const [timeframe, setTimeframe] = useState<"15m" | "1h" | "4h" | "12h" | "1d">("1h");
  const [lookbackBars, setLookbackBars] = useState(500);
  const [regime, setRegime] = useState<
    "ranging" | "trending" | "breakout" | "high_volatility" | "low_liquidity" | "accumulation_distribution"
  >("trending");
  const [model, setModel] = useState<"gpt-4o" | "gpt-4o-mini">("gpt-4o-mini");
  const [maxIterations, setMaxIterations] = useState(30);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [promptOpen, setPromptOpen] = useState(false);
  // Seed params live in form state, populated either by prefill (Continue
  // from this iteration) or empty (fresh session). Empty object means
  // the orchestrator uses DEFAULT_PARAMS for the baseline.
  const [seedParams, setSeedParams] = useState<Record<string, number> | null>(null);
  const [seedSourceLabel, setSeedSourceLabel] = useState<string | null>(null);

  // Apply prefill when it changes. This is the entry point for the
  // "Continue from this iteration" flow — the parent passes prefill,
  // we apply, then call onPrefillConsumed so the parent clears it
  // and we don't loop.
  useEffect(() => {
    if (!prefill) return;
    if (prefill.seedParams) setSeedParams(prefill.seedParams);
    if (prefill.sourceLabel) setSeedSourceLabel(prefill.sourceLabel);
    if (prefill.pairId) setPairId(prefill.pairId);
    if (prefill.timeframe) setTimeframe(prefill.timeframe);
    if (prefill.regime) setRegime(prefill.regime);
    if (prefill.lookbackBars) setLookbackBars(prefill.lookbackBars);
    if (prefill.model) setModel(prefill.model);
    if (prefill.maxIterations) setMaxIterations(prefill.maxIterations);
    if (prefill.mode) setMode(prefill.mode);
    setOpen(true);
    onPrefillConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill]);
  // When the form opens or the mode toggles, refetch the default prompt
  // for that mode. We track which mode the current textarea contents
  // came from so toggling mode → refetches → replaces. If the operator
  // has edited the prompt, switching mode wipes their edit (intentional —
  // mode-specific prompts are very different in shape).
  const [promptLoadedForMode, setPromptLoadedForMode] = useState<"tune" | "discover" | null>(null);

  useEffect(() => {
    if (!open) return;
    if (promptLoadedForMode === mode && systemPrompt) return;
    fetch(`/api/autoresearch/default-system-prompt?mode=${mode}`, {
      credentials: "include",
    })
      .then((r) => (r.ok ? r.text() : Promise.reject(r.statusText)))
      .then((text) => {
        setSystemPrompt(text);
        setPromptLoadedForMode(mode);
      })
      .catch((err) => console.error("[autoresearch] fetch default prompt failed", err));
  }, [open, mode, promptLoadedForMode, systemPrompt]);

  // When goal isn't explicitly customised AND mode flips to discover,
  // suggest a more discover-flavoured default goal text. The operator
  // can still edit. Tune-flavoured stays as-is when flipping back.
  useEffect(() => {
    if (mode === "discover" && goal.startsWith("Find a config where")) {
      setGoal("Map how this pair behaves across the parameter space — show me where trades happen and how they relate to win rate, P&L, and drawdown.");
    } else if (mode === "tune" && goal.startsWith("Map how")) {
      setGoal("Find a config where this pair opens at least 1 trade per day with positive net PnL.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const start = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("/api/autoresearch/sessions", {
        method: "POST",
        body: JSON.stringify({
          goal,
          pairId,
          timeframe,
          lookbackBars,
          regime,
          model,
          maxIterations,
          mode,
          systemPrompt,
          // Only include seedParams when set — when null/empty we omit
          // the field entirely so the server falls through to the
          // historical "start from DEFAULT_PARAMS" behaviour.
          ...(seedParams ? { seedParams } : {}),
        }),
      });
      return r.json();
    },
    onSuccess: () => {
      setOpen(false);
      // Clear seed state after a successful start so the next session
      // doesn't accidentally inherit the previous seed.
      setSeedParams(null);
      setSeedSourceLabel(null);
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

      {/* Seed banner — visible only when the form was opened via
          "Continue from this iteration". Tells the operator the agent
          will start from a non-default baseline, and lets them clear
          the seed if they change their mind. */}
      {seedParams && (
        <div className="mb-4 flex items-start justify-between gap-3 rounded border border-emerald-500/40 bg-emerald-500/5 p-3 text-xs">
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-emerald-200">
              Continuing from {seedSourceLabel ?? "previous iteration"}
            </div>
            <div className="mt-1 text-muted-foreground">
              The baseline iteration will use these params instead of the engine defaults. The agent refines from this starting point.
            </div>
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5 font-mono text-[10px] text-muted-foreground/80">
              {Object.entries(seedParams).map(([k, v]) => (
                <div key={k} className="flex justify-between">
                  <span>{k}</span>
                  <span>{Number.isInteger(v) ? v : v.toFixed(3)}</span>
                </div>
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setSeedParams(null);
              setSeedSourceLabel(null);
            }}
            className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground hover:text-foreground"
          >
            clear seed
          </button>
        </div>
      )}

      {/* Mode toggle — top of form because it changes everything below
          (default goal text, default system prompt, agent behaviour, and
          how the result is rendered). */}
      <div className="mb-4">
        <Label className="text-xs">Mode</Label>
        <div className="mt-1 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setMode("tune")}
            className={cn(
              "rounded border p-3 text-left text-xs transition-colors",
              mode === "tune"
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border bg-card text-muted-foreground hover:text-foreground"
            )}
          >
            <div className="text-sm font-semibold">Tune</div>
            <div className="mt-0.5">
              Hill-climb against the existing scoring function. Find the best param set under our current rules.
            </div>
          </button>
          <button
            type="button"
            onClick={() => setMode("discover")}
            className={cn(
              "rounded border p-3 text-left text-xs transition-colors",
              mode === "discover"
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border bg-card text-muted-foreground hover:text-foreground"
            )}
          >
            <div className="text-sm font-semibold">Discover</div>
            <div className="mt-0.5">
              Sample the search space diversely. No winner — output is a survey of how the strategy behaves across configs.
            </div>
          </button>
        </div>
      </div>

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
          <Label className="text-xs">Regime</Label>
          <select
            value={regime}
            onChange={(e) => setRegime(e.target.value as typeof regime)}
            className="h-9 w-full rounded-md border border-border bg-card px-3 text-sm"
          >
            <option value="trending">Trending — Mode B confirmation only</option>
            <option value="ranging">Ranging — fade sweeps inside the range</option>
            <option value="breakout">Breakout — wait for confirmation</option>
            <option value="high_volatility">High volatility — defensive sizing</option>
            <option value="low_liquidity">Low liquidity — careful entries</option>
            <option value="accumulation_distribution">Accumulation / distribution</option>
          </select>
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
      {/* System prompt — the agent's "constitution". Always editable,
          always submitted with the request. Collapsed by default behind
          a toggle so the form isn't a wall of text on first open, but
          fully visible when the operator wants to read or edit. */}
      <div className="mt-4 rounded border border-border/40 bg-background/40">
        <button
          type="button"
          onClick={() => setPromptOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-xs hover:bg-card/40"
        >
          <span className="text-muted-foreground">
            {promptOpen ? "▾" : "▸"} System prompt — the agent's instructions ({systemPrompt.length} chars)
          </span>
          <span className="text-[10px] text-muted-foreground/70">
            click to {promptOpen ? "collapse" : "view / edit"}
          </span>
        </button>
        {promptOpen && (
          <div className="border-t border-border/40 p-3">
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              className="h-72 w-full rounded border border-border bg-card p-3 font-mono text-[11px] leading-relaxed"
              spellCheck={false}
            />
            <p className="mt-2 text-[10px] text-muted-foreground/70">
              This prompt is sent verbatim to the agent on every iteration of this session. The prompt is also stored on the session row so you can audit later. Edits here only affect this session — the default loaded from the server is unchanged.
            </p>
          </div>
        )}
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
            disabled={!canSubmit || start.isPending || systemPrompt.length < 50}
          >
            {start.isPending ? "Starting…" : "Start session"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---- Session result panel ------------------------------------------------
//
// Shows ONE clear verdict for a finished session: "found a winner",
// "no improvement", "stopped early", or "errored". Plus the best params
// (if any improvement happened) so the operator can read off concrete
// values to copy into Settings if they want.

// Pure helper — computes the verdict for a session. Returns a plain-language
// `action` sentence that's the headline of every history card. The action
// is what the operator can DO with the result. Everything else (goal text,
// metadata, charts) is supporting context.
//
// `suggestions` are concrete one-click follow-up sessions the operator can
// kick off. Each suggestion carries an `overrides` blob that the
// StartSessionForm uses to pre-fill its fields when the suggestion button
// is clicked. Rest of the form stays as-is so the operator can review.
interface SessionPrefill {
  pairId?: string;
  timeframe?: "15m" | "1h" | "4h" | "12h" | "1d";
  lookbackBars?: number;
  regime?:
    | "ranging"
    | "trending"
    | "breakout"
    | "high_volatility"
    | "low_liquidity"
    | "accumulation_distribution";
  model?: "gpt-4o" | "gpt-4o-mini";
  maxIterations?: number;
  goal?: string;
}

interface SessionSuggestion {
  label: string; // button text
  overrides: SessionPrefill; // values to pre-fill in the form
}

interface Verdict {
  tone: "good" | "neutral" | "bad";
  action: string; // BIG plain-language sentence — outcome + recommendation
  detail?: string; // optional supporting line, smaller
  suggestions: SessionSuggestion[]; // one-click follow-up sessions
  foundWinner: boolean;
  bestIter: ARIteration | null;
  baseline: ARIteration | null;
}

// ---- Rejection aggregation (pure data, no opinions) ---------------------
//
// Sums rejection counts across every iteration in the session. Used by
// the verdict to display facts ("X% of rejections were Y") — never to
// recommend a fix. The agent owns the recommendation; this client only
// surfaces what happened.

interface RejectionAggregate {
  total: number;
  byReason: Array<{ reason: string; count: number; pct: number }>;
}

function aggregateRejections(iterations: ARIteration[]): RejectionAggregate {
  const sums = new Map<string, number>();
  let total = 0;
  for (const it of iterations) {
    if (!it.rejectionTop) continue;
    for (const [reason, count] of Object.entries(it.rejectionTop)) {
      sums.set(reason, (sums.get(reason) ?? 0) + count);
      total += count;
    }
  }
  const byReason = Array.from(sums.entries())
    .map(([reason, count]) => ({
      reason,
      count,
      pct: total > 0 ? (count / total) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count);
  return { total, byReason };
}

// Human-readable label for a rejection reason. Pure rendering helper —
// turns machine-readable codes into something a layperson can read,
// nothing more.
function humanReason(reason: string): string {
  const map: Record<string, string> = {
    no_levels: "no levels identified",
    no_sweep: "no liquidity sweep detected",
    no_proposal: "sweep found but no valid setup",
    "risk_rejected:regime_suppresses_entries": "regime suppresses entries",
    "risk_rejected:daily_drawdown_breached": "daily drawdown breached",
    "risk_rejected:weekly_drawdown_breached": "weekly drawdown breached",
    "risk_rejected:max_concurrent_positions_reached": "at max concurrent positions",
    "risk_rejected:level_rank_below_minimum": "level rank below minimum",
    "risk_rejected:rr_below_minimum": "R:R below minimum",
    "risk_rejected:invalid_stop_distance": "invalid stop distance",
    "risk_rejected:regime_size_multiplier_zero": "regime size multiplier zero",
    "risk_rejected:below_min_order_size": "position below exchange minimum",
    "risk_rejected:position_exceeds_capital": "position would exceed capital",
  };
  return map[reason] ?? reason;
}

// ---- Verdict computation -------------------------------------------------
//
// Pure data summarisation. The client describes WHAT happened (numbers
// from the iteration log) and never WHAT TO DO (that's the agent's job
// via its end-of-session summary, which lives on the session row once
// implemented). If the data is "no trades found", the action says exactly
// that and nothing more. No fixes, no exploratory suggestions, no
// hypotheses about the underlying cause. The role split is:
//
//   Agent → testing strategy + recommendations
//   Client → objective display

function computeVerdict(session: ARSession, iterations: ARIteration[]): Verdict {
  const bestScore = session.bestScore ? Number(session.bestScore) : 0;
  const bestIter = iterations.find((i) => i.id === session.bestIterationId) ?? null;
  const baseline = iterations.find((i) => i.idx === 0) ?? null;
  const foundWinner = bestScore > 0 && !!bestIter && bestIter.idx > 0;
  const maxTrades = Math.max(0, ...iterations.map((i) => i.trades));
  const noTradesFound = maxTrades === 0;
  const agg = aggregateRejections(iterations);

  // Errored sessions: report what the server said.
  if (session.status === "error") {
    return {
      tone: "bad",
      action: "Session crashed before it could finish.",
      detail: session.errorMessage ?? undefined,
      suggestions: [],
      foundWinner: false,
      bestIter,
      baseline,
    };
  }

  // Discover-mode sessions get a descriptive survey verdict — no
  // "winner", no "best", no opinions. Just the spread of what was
  // sampled across iterations.
  if (session.mode === "discover") {
    const trades = iterations.map((i) => i.trades);
    const winRates = iterations.map((i) => Number(i.winRate) || 0);
    const pnls = iterations.map((i) => Number(i.netPnl) || 0);
    const drawdowns = iterations.map((i) => Number(i.maxDrawdownPct) || 0);
    const tradesNonZero = iterations.filter((i) => i.trades > 0).length;
    const total = session.iterationsRun;
    let action: string;
    if (tradesNonZero === 0) {
      action = `${total} configurations sampled. None produced any trades.`;
    } else if (tradesNonZero === total) {
      action = `${total} configurations sampled. All of them produced trades.`;
    } else {
      action = `${total} configurations sampled. ${tradesNonZero} produced trades, ${total - tradesNonZero} didn't.`;
    }
    const ranges: string[] = [];
    if (trades.length > 0) {
      ranges.push(`Trades ${Math.min(...trades)}–${Math.max(...trades)}`);
    }
    if (winRates.length > 0 && tradesNonZero > 0) {
      ranges.push(`win rate ${Math.round(Math.min(...winRates) * 100)}%–${Math.round(Math.max(...winRates) * 100)}%`);
    }
    if (pnls.length > 0 && tradesNonZero > 0) {
      const minPnl = Math.min(...pnls);
      const maxPnl = Math.max(...pnls);
      ranges.push(`P&L ${minPnl >= 0 ? "+" : ""}${minPnl.toFixed(0)} to ${maxPnl >= 0 ? "+" : ""}${maxPnl.toFixed(0)}`);
    }
    if (drawdowns.length > 0 && tradesNonZero > 0) {
      ranges.push(`drawdown ${Math.min(...drawdowns).toFixed(1)}%–${Math.max(...drawdowns).toFixed(1)}%`);
    }
    return {
      tone: tradesNonZero === 0 ? "bad" : "neutral",
      action,
      detail: ranges.length > 0 ? ranges.join(" · ") + "." : undefined,
      suggestions: [],
      foundWinner: false,
      bestIter: null,
      baseline,
    };
  }

  // Found a winner: describe the winning iteration with real numbers.
  if (foundWinner) {
    const t = bestIter!.trades;
    const wr = Math.round(Number(bestIter!.winRate) * 100);
    const pnl = Number(bestIter!.netPnl);
    return {
      tone: "good",
      action: `Iteration #${bestIter!.idx + 1} produced the best result: ${t} trades, ${wr}% wins, ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)} net PnL.`,
      detail: `Score ${bestScore.toFixed(4)} vs baseline ${(baseline ? Number(baseline.score) : 0).toFixed(4)}. The agent's iteration history has its rationale for why these params worked.`,
      suggestions: [],
      foundWinner: true,
      bestIter,
      baseline,
    };
  }

  // No winner (tune mode) — describe what the data shows. The action is
  // purely factual. No recommendation. The agent's per-iteration
  // rationales (visible in the Live tab and Iterations table) are the
  // real analysis.
  const factParts: string[] = [
    `${session.iterationsRun} iterations completed`,
    `${maxTrades === 0 ? "no trades produced" : `${maxTrades} trades at best`}`,
    `best score ${bestScore.toFixed(4)}`,
  ];
  let detail: string | undefined;
  if (agg.byReason.length > 0) {
    const top3 = agg.byReason
      .slice(0, 3)
      .map((r) => `${Math.round(r.pct)}% ${humanReason(r.reason)}`)
      .join(" · ");
    detail = `Top rejection reasons across all iterations: ${top3}.`;
  } else {
    detail = "No rejection data was recorded for any iteration.";
  }
  return {
    tone: noTradesFound ? "bad" : "neutral",
    action: factParts.join(" · ") + ".",
    detail,
    suggestions: [],
    foundWinner: false,
    bestIter,
    baseline,
  };
}

function toneToClass(tone: Verdict["tone"]): string {
  return tone === "good"
    ? "border-emerald-500/40 bg-emerald-500/5"
    : tone === "bad"
      ? "border-red-500/40 bg-red-500/5"
      : "border-amber-500/40 bg-amber-500/5";
}

function ParamDiffTable({
  baseline,
  winner,
}: {
  baseline: Record<string, number>;
  winner: Record<string, number>;
}) {
  const keys = Object.keys(winner);
  return (
    <div className="space-y-1">
      {keys.map((k) => {
        const b = baseline[k];
        const w = winner[k];
        const changed = b !== w;
        return (
          <div
            key={k}
            className={cn(
              "flex items-center justify-between gap-3 text-xs",
              changed ? "text-foreground" : "text-muted-foreground/60"
            )}
          >
            <span className="font-mono">{k}</span>
            <span className="font-mono">
              {fmt(b)}{" "}
              {changed && <span className="text-emerald-300">→ {fmt(w)}</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function ParamGrid({ params }: { params: Record<string, number> }) {
  const entries = Object.entries(params);
  return (
    <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
      {entries.map(([k, v]) => (
        <div key={k} className="flex items-center justify-between text-xs">
          <span className="font-mono text-muted-foreground">{k}</span>
          <span className="font-mono text-foreground">{fmt(v)}</span>
        </div>
      ))}
    </div>
  );
}

function fmt(v: number): string {
  if (Number.isInteger(v)) return v.toString();
  return v.toFixed(3);
}

// ---- Iteration chart -----------------------------------------------------
//
// Inline SVG, zero dependencies. X axis is iteration number, Y axis is
// the chosen metric (score or trades). Shows two series:
//   1. Each iteration as a dot (colour by status: baseline / keep / discard / crash)
//   2. Running best as a step line — only goes up, shows convergence at a glance
//
// `metric` defaults to "score" but for diagnostic experiments where the
// goal is "find a config that trades", trades is the more informative
// signal because score is 0 by definition until trades >= 3.

type Metric = "score" | "trades" | "winRate" | "netPnl" | "drawdown";

function getMetricValue(it: ARIteration, metric: Metric): number {
  switch (metric) {
    case "score":
      return Number(it.score) || 0;
    case "trades":
      return it.trades;
    case "winRate":
      return Number(it.winRate) || 0;
    case "netPnl":
      return Number(it.netPnl) || 0;
    case "drawdown":
      return Number(it.maxDrawdownPct) || 0;
  }
}

function metricLabel(metric: Metric): string {
  switch (metric) {
    case "score":
      return "Score over iterations";
    case "trades":
      return "Trades over iterations";
    case "winRate":
      return "Win rate over iterations";
    case "netPnl":
      return "Net PnL over iterations";
    case "drawdown":
      return "Max drawdown % over iterations";
  }
}

function metricFormat(metric: Metric, v: number): string {
  switch (metric) {
    case "score":
      return v.toFixed(4);
    case "trades":
      return v.toFixed(0);
    case "winRate":
      return `${Math.round(v * 100)}%`;
    case "netPnl":
      return `${v >= 0 ? "+" : ""}${v.toFixed(0)}`;
    case "drawdown":
      return `${v.toFixed(1)}%`;
  }
}

function IterationChart({
  iterations,
  metric,
  showBest = true,
}: {
  iterations: ARIteration[];
  metric: Metric;
  // showBest=true draws a step-line of the running best (used in tune
  // mode where the agent is hill-climbing). discover mode passes false
  // because every iteration is a data point — there's no "best so far".
  showBest?: boolean;
}) {
  if (iterations.length === 0) return null;
  const sorted = [...iterations].sort((a, b) => a.idx - b.idx);
  const values = sorted.map((i) => getMetricValue(i, metric));
  // Compute y range from actual data so metrics that can be negative
  // (like netPnl) render correctly. Always include 0 in the range so
  // there's a zero baseline visible.
  const dataMin = Math.min(...values, 0);
  const dataMax = Math.max(...values, metric === "score" ? 0.0001 : 0);
  const span = Math.max(dataMax - dataMin, 0.0001);
  const yMin = dataMin - span * 0.05;
  const yMax = dataMax + span * 0.05;
  const yToPx = (v: number) =>
    padT + innerH - ((v - yMin) / (yMax - yMin)) * innerH;
  const W = 600;
  const H = 200;
  const padL = 48;
  const padR = 12;
  const padT = 12;
  const padB = 28;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const xStep = sorted.length > 1 ? innerW / (sorted.length - 1) : 0;

  // Build the running-best step path (only used when showBest is true).
  // For metrics where higher is better (score, trades, winRate, netPnl)
  // we track the running max. drawdown isn't shown with a best line
  // because lower-is-better — caller passes showBest=false for it.
  const bestPath: string[] = [];
  if (showBest) {
    let bestSoFar = -Infinity;
    sorted.forEach((it, i) => {
      const v = getMetricValue(it, metric);
      if (v > bestSoFar) bestSoFar = v;
      const x = padL + i * xStep;
      const y = yToPx(bestSoFar);
      if (i === 0) {
        bestPath.push(`M ${x} ${y}`);
      } else {
        const prevBest = Math.max(...values.slice(0, i));
        const prevY = yToPx(prevBest);
        bestPath.push(`L ${x} ${prevY} L ${x} ${y}`);
      }
    });
  }

  const yTicks = [yMin, (yMin + yMax) / 2, yMax];

  return (
    <div className="rounded border border-border/40 bg-background/40 p-3">
      <div className="mb-2 flex items-baseline justify-between gap-3 text-[10px] uppercase tracking-wide text-muted-foreground">
        <span>{metricLabel(metric)}</span>
        <span>
          {sorted.length} iterations · range {metricFormat(metric, dataMin)}–{metricFormat(metric, dataMax)}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full">
        {yTicks.map((v, i) => {
          const y = yToPx(v);
          return (
            <g key={i}>
              <line
                x1={padL}
                x2={W - padR}
                y1={y}
                y2={y}
                stroke="currentColor"
                strokeOpacity={0.1}
                strokeDasharray="2 2"
              />
              <text
                x={padL - 6}
                y={y + 3}
                textAnchor="end"
                fontSize="10"
                fill="currentColor"
                fillOpacity={0.5}
              >
                {metricFormat(metric, v)}
              </text>
            </g>
          );
        })}

        {/* Zero baseline for metrics that can go negative */}
        {yMin < 0 && yMax > 0 && (
          <line
            x1={padL}
            x2={W - padR}
            y1={yToPx(0)}
            y2={yToPx(0)}
            stroke="currentColor"
            strokeOpacity={0.25}
          />
        )}

        {[0, Math.floor(sorted.length / 2), sorted.length - 1].map((i) => {
          if (i < 0 || i >= sorted.length) return null;
          const x = padL + i * xStep;
          return (
            <text
              key={i}
              x={x}
              y={H - 8}
              textAnchor="middle"
              fontSize="10"
              fill="currentColor"
              fillOpacity={0.5}
            >
              {i + 1}
            </text>
          );
        })}

        {showBest && (
          <path
            d={bestPath.join(" ")}
            fill="none"
            stroke="rgb(16 185 129)"
            strokeWidth="2"
            strokeOpacity={0.8}
          />
        )}

        {sorted.map((it, i) => {
          const v = getMetricValue(it, metric);
          const x = padL + i * xStep;
          const y = yToPx(v);
          const color = dotColor(it.status);
          return (
            <circle
              key={it.id}
              cx={x}
              cy={y}
              r={3}
              fill={color}
              stroke="rgb(20 20 20)"
              strokeWidth={0.5}
            >
              <title>
                #{it.idx + 1} · {metricFormat(metric, v)} · {it.trades} trades · {it.status}
              </title>
            </circle>
          );
        })}
      </svg>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
        <LegendDot color="rgb(59 130 246)" label="baseline" />
        <LegendDot color="rgb(16 185 129)" label="keep" />
        <LegendDot color="rgb(115 115 115)" label="discard / sampled" />
        <LegendDot color="rgb(239 68 68)" label="crash" />
        {showBest && <span className="ml-auto">— line: best so far</span>}
      </div>
    </div>
  );
}

// Tiny inline chart for collapsed history cards. ~60px tall, no axes, no
// labels — just dots and the running-best line in a compact box. Same
// colour vocabulary as the full IterationChart so the visual link is
// obvious when the operator expands the card.
//
// `metric` defaults to "trades" because it's the most informative single
// signal for diagnostic experiments — score is 0 by definition until
// trades >= 3, so a score sparkline is a flat line for any session that
// didn't find a trading config.
function Sparkline({
  iterations,
  metric = "trades",
}: {
  iterations: ARIteration[];
  metric?: Metric;
}) {
  if (iterations.length === 0) return null;
  const sorted = [...iterations].sort((a, b) => a.idx - b.idx);
  const values = sorted.map((i) => getMetricValue(i, metric));
  const maxValue = Math.max(...values, metric === "score" ? 0.0001 : 1);
  const yMax = maxValue * 1.1;
  const W = 400;
  const H = 50;
  const padX = 4;
  const padY = 4;
  const innerW = W - padX * 2;
  const innerH = H - padY * 2;
  const xStep = sorted.length > 1 ? innerW / (sorted.length - 1) : 0;

  let bestSoFar = 0;
  const bestPath: string[] = [];
  sorted.forEach((it, i) => {
    const v = getMetricValue(it, metric);
    if (v > bestSoFar) bestSoFar = v;
    const x = padX + i * xStep;
    const y = padY + innerH - (bestSoFar / yMax) * innerH;
    if (i === 0) {
      bestPath.push(`M ${x} ${y}`);
    } else {
      const prevBest = Math.max(...values.slice(0, i));
      const prevY = padY + innerH - (prevBest / yMax) * innerH;
      bestPath.push(`L ${x} ${prevY} L ${x} ${y}`);
    }
  });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-12 w-full">
      <path
        d={bestPath.join(" ")}
        fill="none"
        stroke="rgb(16 185 129)"
        strokeWidth="1.5"
        strokeOpacity={0.7}
      />
      {sorted.map((it, i) => {
        const v = getMetricValue(it, metric);
        const x = padX + i * xStep;
        const y = padY + innerH - (v / yMax) * innerH;
        return (
          <circle
            key={it.id}
            cx={x}
            cy={y}
            r={1.8}
            fill={dotColor(it.status)}
          />
        );
      })}
    </svg>
  );
}

function dotColor(status: ARIteration["status"]): string {
  switch (status) {
    case "baseline":
      return "rgb(59 130 246)"; // blue
    case "keep":
      return "rgb(16 185 129)"; // emerald
    case "discard":
      return "rgb(115 115 115)"; // grey
    case "sampled":
      return "rgb(168 85 247)"; // purple — discover-mode data point
    case "crash":
      return "rgb(239 68 68)"; // red
  }
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span
        className="inline-block h-2 w-2 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span>{label}</span>
    </span>
  );
}

// ---- Iterations table ----------------------------------------------------
//
// Each row has an "Install" button that writes the iteration's full
// 9-param config to the operator's tenant_configs. The next bot tick
// uses the new params. Disabled for crashed iterations.

function IterationsTable({
  iterations,
  onContinueFromIteration,
}: {
  iterations: ARIteration[];
  // When provided, each row gets a "Continue" button that pre-fills the
  // start form with this iteration's params and jumps to the Autoresearch
  // tab. The caller is responsible for the navigation; this component
  // just emits the click.
  onContinueFromIteration?: (it: ARIteration) => void;
}) {
  const qc = useQueryClient();
  // Lift confirm state up: track which iteration is being confirmed for
  // install. Drives the ConfirmModal at the bottom of the table.
  const [installTarget, setInstallTarget] = useState<ARIteration | null>(null);

  const installMutation = useMutation({
    mutationFn: async (iterationId: string) => {
      const r = await apiRequest(
        `/api/autoresearch/iterations/${iterationId}/install`,
        { method: "POST" }
      );
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/tenant"] });
      setInstallTarget(null);
    },
    onError: (e) => {
      alert(`Install failed: ${(e as Error).message}`);
      setInstallTarget(null);
    },
  });

  if (iterations.length === 0) {
    return <div className="text-xs text-muted-foreground">No iterations yet.</div>;
  }

  // Compute the "top 25% by net PnL among iterations that traded" set.
  // Pure ranking, no opinion — flagged iterations get a subtle emerald
  // border so the operator can scan for the best candidates without
  // sorting manually.
  const tradingIters = iterations.filter((i) => i.trades > 0);
  const sortedByPnl = [...tradingIters].sort(
    (a, b) => Number(b.netPnl) - Number(a.netPnl)
  );
  const topQuartileCount = Math.max(1, Math.ceil(sortedByPnl.length / 4));
  const topPnlIds = new Set(sortedByPnl.slice(0, topQuartileCount).map((i) => i.id));

  const maxScore = Math.max(...iterations.map((i) => Number(i.score) || 0), 0.0001);

  return (
    <div className="space-y-1">
      <div className="grid grid-cols-12 gap-2 px-3 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
        <div className="col-span-1">#</div>
        <div className="col-span-2 text-right">score</div>
        <div className="col-span-1 text-right">trades</div>
        <div className="col-span-2 text-right">win / pnl</div>
        <div className="col-span-1">status</div>
        <div className="col-span-2">narration</div>
        <div className="col-span-3 text-right">actions</div>
      </div>
      {[...iterations].reverse().map((it) => {
        const score = Number(it.score) || 0;
        const widthPct = (score / maxScore) * 100;
        const canInstall = it.status !== "crash";
        const isTopPnl = topPnlIds.has(it.id);
        return (
          <div
            key={it.id}
            className={cn(
              "relative overflow-hidden rounded border bg-card/30",
              isTopPnl ? "border-emerald-500/50 bg-emerald-500/5" : "border-border/40"
            )}
            title={isTopPnl ? "Top 25% by net P&L (among iterations that traded)" : undefined}
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
              <div className="col-span-2 truncate text-muted-foreground" title={it.narration}>
                {it.narration}
              </div>
              <div className="col-span-3 flex items-center justify-end gap-1.5">
                {onContinueFromIteration && canInstall && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onContinueFromIteration(it)}
                    title="Start a new autoresearch session seeded with this iteration's params"
                  >
                    Continue
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!canInstall || installMutation.isPending}
                  onClick={() => setInstallTarget(it)}
                >
                  Install
                </Button>
              </div>
            </div>
          </div>
        );
      })}

      {/* Install confirm modal — uses the project's reusable ConfirmModal
          pattern instead of native confirm() */}
      <ConfirmModal
        open={installTarget !== null}
        title={
          installTarget
            ? `Install iteration #${installTarget.idx + 1} as live config?`
            : ""
        }
        description="These params become your tenant's live strategy. The next bot tick (within 60s) will use them."
        consequences={
          installTarget
            ? Object.entries(installTarget.params).map(
                ([k, v]) => `${k}: ${typeof v === "number" && !Number.isInteger(v) ? v.toFixed(4) : v}`
              )
            : []
        }
        confirmLabel="Install"
        pending={installMutation.isPending}
        onConfirm={() => installTarget && installMutation.mutate(installTarget.id)}
        onCancel={() => setInstallTarget(null)}
      />
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
    case "sampled":
      return "border-purple-500/40 text-purple-200";
    case "crash":
      return "border-red-500/40 text-red-300";
  }
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

function modeBadgeClass(mode: ARSession["mode"]): string {
  switch (mode) {
    case "tune":
      return "border-blue-500/40 text-blue-200";
    case "discover":
      return "border-purple-500/40 text-purple-200";
  }
}
