import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

// Top-of-dashboard identity strip. Avatar + first name + status sentence
// + a mood indicator on the right. Optionally renders a stats row and an
// actions row underneath. Always visible — the tabs below switch content,
// but the identity never changes.

interface IdentityCardProps {
  botStatus: string;
  activeRegime: string;
  stats?: ReactNode;
  actions?: ReactNode;
}

export default function IdentityCard({
  botStatus,
  activeRegime,
  stats,
  actions,
}: IdentityCardProps) {
  const { user } = useAuth();
  const firstName = user?.firstName ?? user?.email?.split("@")[0] ?? "You";
  const avatar = user?.profileImageUrl;
  const initials = (firstName.charAt(0) + (user?.lastName?.charAt(0) ?? "")).toUpperCase();

  return (
    <Card className="overflow-hidden">
      <div className="flex items-start gap-5 p-6">
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
      {stats && <div className="border-t border-border/50 px-6 py-4">{stats}</div>}
      {actions && <div className="border-t border-border/50 px-6 py-4">{actions}</div>}
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
