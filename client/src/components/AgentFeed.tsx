import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { narrate, type Mood } from "@/lib/narrate";
import { cn } from "@/lib/utils";

// The dashboard's centrepiece — the operator's alter ego watching the
// market on their behalf. Big avatar, first name, current status,
// and a scrolling feed of short first-person lines. Not a log. A voice.

interface DecisionRow {
  id: string;
  createdAt: string;
  decisionType: string;
  regime: string;
  reasoning: string | null;
  outputs: Record<string, unknown> | null;
}

interface AgentFeedProps {
  botStatus: string;
  activeRegime: string;
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

export default function AgentFeed({ botStatus, activeRegime }: AgentFeedProps) {
  const { user } = useAuth();
  const { data } = useQuery<DecisionRow[]>({
    queryKey: ["/api/tenant/decisions"],
    refetchInterval: 15_000, // quiet poll — the feed updates on its own
  });

  const lines = (data ?? []).slice(0, 80);
  const firstName = user?.firstName ?? user?.email?.split("@")[0] ?? "You";
  const avatar = user?.profileImageUrl;
  const initials = (firstName.charAt(0) + (user?.lastName?.charAt(0) ?? "")).toUpperCase();

  return (
    <Card className="overflow-hidden">
      <div className="flex items-start gap-5 border-b border-border/50 p-6">
        {avatar ? (
          <img
            src={avatar}
            alt={firstName}
            className="h-20 w-20 rounded-full border-2 border-primary/40 object-cover"
          />
        ) : (
          <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-primary/40 bg-muted text-2xl font-semibold">
            {initials || "?"}
          </div>
        )}
        <div className="flex-1">
          <div className="flex items-baseline gap-3">
            <h2 className="text-2xl font-semibold">{firstName}</h2>
            <span className="text-xs uppercase tracking-wider text-muted-foreground">
              alter ego
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {statusLine(botStatus, activeRegime)}
          </p>
        </div>
        <MoodIndicator status={botStatus} />
      </div>

      <div className="max-h-[420px] space-y-3 overflow-y-auto p-6">
        {lines.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing to say yet — start the bot to hear from me.
          </p>
        ) : (
          lines.map((row) => {
            const n = narrate(row);
            const when = new Date(row.createdAt);
            return (
              <div
                key={row.id}
                className={cn(
                  "border-l-2 pl-4 leading-snug",
                  MOOD_CLASSES[n.mood]
                )}
              >
                <div className="text-sm">{n.text}</div>
                <div className="mt-0.5 flex gap-2 text-[11px] text-muted-foreground/70">
                  <span>{formatWhen(when)}</span>
                  {n.subtext && <span>· {n.subtext}</span>}
                </div>
              </div>
            );
          })
        )}
      </div>
    </Card>
  );
}

function statusLine(botStatus: string, regime: string): string {
  if (botStatus === "off") return "Resting. Wake me up when you're ready.";
  if (botStatus === "paused") return "Paused — watching the positions I'm already in, not opening new ones.";
  if (botStatus === "halted") return "Halted. Need you to decide what to do next.";
  if (botStatus === "error") return "Something went wrong. Check logs.";
  if (regime === "no_trade") return "Watching, but not trading — regime says sit.";
  return `Watching BTC. ${prettyRegime(regime)}.`;
}

function prettyRegime(r: string): string {
  const map: Record<string, string> = {
    ranging: "Market's inside a range — fading sweeps feels right",
    trending: "Trend is in control — only taking setups with the flow",
    breakout: "Things are breaking — waiting for confirmation only",
    high_volatility: "Way too loose right now — staying flat",
    low_liquidity: "Book is thin — not a good time",
    accumulation_distribution: "Smart money's positioning — playing carefully",
    no_trade: "Not trading",
  };
  return map[r] ?? r;
}

function MoodIndicator({ status }: { status: string }) {
  const map: Record<string, { dot: string; label: string }> = {
    active: { dot: "bg-primary animate-pulse", label: "Watching" },
    paused: { dot: "bg-amber-400", label: "Paused" },
    off: { dot: "bg-muted-foreground", label: "Resting" },
    halted: { dot: "bg-red-500", label: "Halted" },
    error: { dot: "bg-red-500", label: "Error" },
  };
  const { dot, label } = map[status] ?? map.off;
  return (
    <div className="flex items-center gap-2">
      <span className={cn("h-2.5 w-2.5 rounded-full", dot)} />
      <span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
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
