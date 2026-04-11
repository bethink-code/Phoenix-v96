import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// Mirrors IdentityCard but for the autoresearch persona — the part of the
// system that experiments with parameters on your behalf during a session.
// Different name, different status vocabulary, different mood states, but
// the same visual language as the bot's identity card on the Dashboard
// so the operator's mental model transfers cleanly.

interface ResearcherIdentityCardProps {
  // Session lifecycle. Mirrors ARSession["status"] + "idle" for the
  // empty state. paused = natural or operator pause, can continue.
  // stopped = terminal (operator clicked Done). Legacy "done" and
  // "aborted" values handled for pre-refactor rows.
  status: "idle" | "running" | "paused" | "stopped" | "done" | "aborted" | "error";
  iterationsRun: number;
  maxIterations: number;
  bestScore: number | null;
  spentUsd: number;
  goal?: string;
  stats?: ReactNode;
  actions?: ReactNode;
}

export default function ResearcherIdentityCard({
  status,
  iterationsRun,
  maxIterations,
  bestScore,
  spentUsd,
  goal,
  stats,
  actions,
}: ResearcherIdentityCardProps) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-start gap-5 p-6">
        <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-primary/40 bg-muted text-2xl">
          🔬
        </div>
        <div className="flex-1">
          <div className="flex items-baseline gap-3">
            <h2 className="text-2xl font-semibold">Phoenix Researcher</h2>
            <span className="text-xs uppercase tracking-wider text-muted-foreground">
              autoresearch
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {statusLine({ status, iterationsRun, maxIterations, bestScore, goal })}
          </p>
        </div>
        <MoodIndicator status={status} />
      </div>
      {stats && <div className="border-t border-border/50 px-6 py-4">{stats}</div>}
      {actions && <div className="border-t border-border/50 px-6 py-4">{actions}</div>}
    </Card>
  );
}

function statusLine(args: {
  status: ResearcherIdentityCardProps["status"];
  iterationsRun: number;
  maxIterations: number;
  bestScore: number | null;
  goal?: string;
}): string {
  const { status, iterationsRun, maxIterations, bestScore, goal } = args;
  if (status === "idle") {
    return "Waiting for a session to start. Tell me what you want to find and I'll iterate until I find it.";
  }
  if (status === "running") {
    if (iterationsRun === 0) {
      return `Just started. ${goal ? `Goal: ${goal}` : "Running baseline first."}`;
    }
    const bestPart = bestScore != null && bestScore > 0
      ? ` Best score so far: ${bestScore.toFixed(4)}.`
      : " No improvement yet — still searching.";
    return `Iteration ${iterationsRun} of ${maxIterations}.${bestPart}`;
  }
  if (status === "paused" || status === "aborted") {
    return `Paused at iteration ${iterationsRun} of ${maxIterations}. Continue to keep going, or mark Done to finish.`;
  }
  if (status === "stopped" || status === "done") {
    return `Finished after ${iterationsRun} iterations. Archived to History.`;
  }
  if (status === "error") {
    return "Something went wrong. Check the error message and try again.";
  }
  return "";
}

function MoodIndicator({ status }: { status: ResearcherIdentityCardProps["status"] }) {
  const map: Record<string, { dot: string; label: string }> = {
    idle: { dot: "bg-muted-foreground", label: "Idle" },
    running: { dot: "bg-primary animate-pulse", label: "Running" },
    paused: { dot: "bg-blue-400", label: "Paused" },
    aborted: { dot: "bg-blue-400", label: "Paused" }, // legacy = paused
    stopped: { dot: "bg-emerald-500", label: "Done" },
    done: { dot: "bg-emerald-500", label: "Done" }, // legacy = stopped
    error: { dot: "bg-red-500", label: "Error" },
  };
  const { dot, label } = map[status] ?? map.idle;
  return (
    <div className="flex items-center gap-2">
      <span className={cn("h-2.5 w-2.5 rounded-full", dot)} />
      <span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
    </div>
  );
}
