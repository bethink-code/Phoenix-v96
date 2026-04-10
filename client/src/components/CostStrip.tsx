import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

// "What is this thing costing me?" — always-visible usage strip in the
// dashboard header. Ticks today, API calls, LLM spend month-to-date,
// infrastructure spend month-to-date. Updates every 30s.

interface Costs {
  ticksToday: number;
  ticksThisHour: number;
  apiCallsToday: number;
  llmCostMonth: number;
  infraCostMonth: number;
  firstSeenAt: string | null;
  lastTickAt: string | null;
  consecutiveExchangeFailures: number;
}

export default function CostStrip() {
  const { data } = useQuery<Costs>({
    queryKey: ["/api/tenant/costs"],
    refetchInterval: 15_000,
  });

  const ticks = data?.ticksToday ?? 0;
  const apis = data?.apiCallsToday ?? 0;
  const llm = data?.llmCostMonth ?? 0;
  const infra = data?.infraCostMonth ?? 0;
  const total = llm + infra;

  const heartbeat = computeHeartbeat(data?.lastTickAt ?? null);

  return (
    <div className="flex items-center gap-4 text-xs">
      <Pill
        dot={heartbeat.dot}
        label="heartbeat"
        value={heartbeat.label}
        tone={heartbeat.tone}
      />
      <Pill label="ticks today" value={ticks.toLocaleString()} sub={data ? `${data.ticksThisHour}/hr` : undefined} />
      <Pill label="exchange calls" value={apis.toLocaleString()} />
      <Pill label="LLM" value={fmtMoney(llm)} tone={llm > 0 ? "warm" : "neutral"} />
      <Pill label="infra" value={fmtMoney(infra)} />
      <div className="h-6 w-px bg-border/60" />
      <Pill label="month-to-date" value={fmtMoney(total)} tone={total > 0 ? "warm" : "neutral"} strong />
      {(data?.consecutiveExchangeFailures ?? 0) > 0 && (
        <>
          <div className="h-6 w-px bg-border/60" />
          <Pill
            label="exchange errors"
            value={`${data!.consecutiveExchangeFailures}/3`}
            tone="warm"
          />
        </>
      )}
    </div>
  );
}

function computeHeartbeat(lastTickAt: string | null): {
  label: string;
  dot: string;
  tone: "neutral" | "warm" | "bad";
} {
  if (!lastTickAt) {
    return { label: "never", dot: "bg-muted-foreground/40", tone: "neutral" };
  }
  const ageMs = Date.now() - new Date(lastTickAt).getTime();
  const seconds = Math.floor(ageMs / 1000);
  const label = seconds < 60 ? `${seconds}s ago` : `${Math.floor(seconds / 60)}m ago`;
  if (ageMs < 2 * 60_000) {
    return { label, dot: "bg-emerald-500 animate-pulse", tone: "neutral" };
  }
  if (ageMs < 5 * 60_000) {
    return { label, dot: "bg-amber-400", tone: "warm" };
  }
  return { label, dot: "bg-red-500", tone: "bad" };
}

function Pill({
  dot,
  label,
  value,
  sub,
  tone,
  strong,
}: {
  dot?: string;
  label: string;
  value: string;
  sub?: string;
  tone?: "neutral" | "warm" | "bad";
  strong?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      {dot && <span className={cn("h-1.5 w-1.5 rounded-full", dot)} />}
      <div className="leading-tight">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div
          className={cn(
            "font-mono",
            strong ? "text-sm font-semibold" : "text-xs",
            tone === "warm" ? "text-amber-300" :
            tone === "bad" ? "text-red-400" :
            "text-foreground"
          )}
        >
          {value}
          {sub && <span className="ml-1 text-[10px] text-muted-foreground">({sub})</span>}
        </div>
      </div>
    </div>
  );
}

function fmtMoney(n: number): string {
  if (n === 0) return "$0";
  if (n < 0.01) return "<$0.01";
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
