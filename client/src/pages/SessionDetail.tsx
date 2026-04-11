import { Link, useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { SessionDetailView } from "@/pages/Experiments";

// Standalone page for ONE autoresearch session, identified by the
// session id in the URL. Renders the same SessionDetailView as the Live
// tab so a past session is shown with full fidelity — same identity
// card, same Trades / Score / Iterations / Successes sub-tabs.
//
// History cards link here with target="_blank", letting the operator
// open multiple sessions side-by-side in browser tabs for comparison.
//
// Conceptually: an active session and a past session are the same
// object in different states. Same UI renders both. The Live tab is
// just this page with the active session selected automatically.

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

export default function SessionDetail() {
  const [match, params] = useRoute("/experiments/sessions/:id");
  const sessionId = match ? params.id : null;

  // Polls only while the session is running so a tab opened on a
  // currently-running session updates live. Done sessions are static.
  const sessionQuery = useQuery<ARSession>({
    queryKey: [`/api/autoresearch/sessions/${sessionId}`],
    enabled: !!sessionId,
    refetchInterval: (q) =>
      (q.state.data as ARSession | undefined)?.status === "running" ? 5_000 : false,
  });
  const iterationsQuery = useQuery<ARIteration[]>({
    queryKey: [`/api/autoresearch/sessions/${sessionId}/iterations`],
    enabled: !!sessionId,
    refetchInterval: (q) =>
      sessionQuery.data?.status === "running" ? 5_000 : false,
  });

  if (!sessionId) {
    return (
      <div className="min-h-screen bg-background p-6 text-sm text-muted-foreground">
        Invalid session URL.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Sticky header — same visual language as the Experiments page,
          but the title is the session goal so each open tab is
          identifiable in the browser tab strip. */}
      <header className="sticky top-0 z-20 border-b border-border bg-background">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold">
              {sessionQuery.data?.goal ?? "Session"}
            </h1>
            <p className="text-xs text-muted-foreground">
              Past session view · read-only
            </p>
          </div>
          <Link href="/experiments">
            <Button variant="outline" size="sm">← Experiments</Button>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-6">
        {sessionQuery.isLoading && (
          <div className="text-sm text-muted-foreground">Loading session…</div>
        )}
        {sessionQuery.isError && (
          <div className="text-sm text-red-300">Failed to load session.</div>
        )}
        {sessionQuery.data && (
          // No actions slot — this is a viewer, not a controller.
          // Stopping a running session and starting new ones happen
          // on the Live tab, not from a session-detail tab opened
          // for comparison.
          <SessionDetailView
            session={sessionQuery.data}
            iterations={iterationsQuery.data ?? []}
          />
        )}
      </main>
    </div>
  );
}
