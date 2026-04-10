import { useQuery } from "@tanstack/react-query";
import { narrate, type Mood, type Narration } from "@/lib/narrate";
import { cn } from "@/lib/utils";

// The scrolling first-person voice feed. Standalone component for use
// inside the Heartbeat tab. Identity header lives in IdentityCard.

interface DecisionRow {
  id: string;
  createdAt: string;
  decisionType: string;
  regime: string;
  reasoning: string | null;
  outputs: Record<string, unknown> | null;
}

const MOOD_CLASSES: Record<Mood, string> = {
  idle: "border-border/40 text-muted-foreground",
  watching: "border-border/60 text-foreground/80",
  interested: "border-amber-500/40 text-amber-100",
  entered: "border-primary/60 text-primary",
  won: "border-emerald-500/50 text-emerald-300",
  lost: "border-red-500/40 text-red-300",
  halted: "border-red-500/60 text-red-300",
  regime: "border-blue-500/40 text-blue-200",
};

interface CollapsedEntry {
  key: string;
  narration: Narration;
  latestAt: Date;
  earliestAt: Date;
  count: number;
}

// Collapse consecutive identical narrations into one row with a × N counter
function collapse(rows: DecisionRow[]): CollapsedEntry[] {
  const out: CollapsedEntry[] = [];
  for (const row of rows) {
    const n = narrate(row);
    const last = out[out.length - 1];
    if (last && last.narration.text === n.text) {
      last.count++;
      last.earliestAt = new Date(row.createdAt);
      continue;
    }
    out.push({
      key: row.id,
      narration: n,
      latestAt: new Date(row.createdAt),
      earliestAt: new Date(row.createdAt),
      count: 1,
    });
  }
  return out;
}

export default function HeartbeatFeed() {
  const { data } = useQuery<DecisionRow[]>({
    queryKey: ["/api/tenant/decisions"],
    refetchInterval: 15_000,
  });

  const entries = collapse((data ?? []).slice(0, 120));

  if (entries.length === 0) {
    return (
      <p className="p-6 text-sm text-muted-foreground">
        Nothing to say yet — start the bot to hear from me.
      </p>
    );
  }

  return (
    <div className="h-full space-y-3 overflow-y-auto p-6">
      {entries.map((e) => (
        <div
          key={e.key}
          className={cn("border-l-2 pl-4 leading-snug", MOOD_CLASSES[e.narration.mood])}
        >
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span>{e.narration.text}</span>
            {e.count > 1 && (
              <span className="shrink-0 text-xs text-muted-foreground/80">× {e.count}</span>
            )}
          </div>
          <div className="mt-0.5 flex gap-2 text-[11px] text-muted-foreground/70">
            <span>
              {formatWhen(e.latestAt)}
              {e.count > 1 ? ` — ${formatWhen(e.earliestAt)}` : ""}
            </span>
            {e.narration.subtext && <span>· {e.narration.subtext}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

function formatWhen(d: Date): string {
  const now = Date.now();
  const diff = now - d.getTime();
  if (diff < 60_000) return "just now";
  if (diff < 60 * 60_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 24 * 60 * 60_000) return `${Math.floor(diff / (60 * 60_000))}h ago`;
  return d.toLocaleString();
}
