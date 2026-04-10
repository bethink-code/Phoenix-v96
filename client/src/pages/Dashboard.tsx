import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { Link } from "wouter";

interface Tenant {
  id: string;
  name: string;
  botStatus: "off" | "active" | "paused" | "halted" | "error";
  activeRegime: string;
  paperTradingMode: boolean;
}

interface TenantEnvelope {
  tenant: Tenant;
  config: {
    riskPercentPerTrade: string;
    maxConcurrentPositions: number;
    dailyDrawdownLimitPct: string;
    weeklyDrawdownLimitPct: string;
    minRiskRewardRatio: string;
  } | null;
}

const REGIMES = [
  { key: "no_trade", label: "NO TRADE", colour: "bg-regime-notrade" },
  { key: "ranging", label: "Ranging", colour: "bg-regime-ranging" },
  { key: "trending", label: "Trending", colour: "bg-regime-trending" },
  { key: "breakout", label: "Breakout", colour: "bg-regime-breakout" },
  { key: "high_volatility", label: "High Volatility", colour: "bg-regime-volatile" },
  { key: "low_liquidity", label: "Low Liquidity", colour: "bg-regime-notrade" },
  { key: "accumulation_distribution", label: "Accumulation / Distribution", colour: "bg-regime-ranging" },
];

interface TradeRow {
  id: string;
  status: string;
  realisedPnl: string | null;
  closedAt: string | null;
}

function computeStats(trades: TradeRow[] | undefined) {
  if (!trades) return { weeklyPnl: 0, openCount: 0 };
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  let weeklyPnl = 0;
  let openCount = 0;
  for (const t of trades) {
    if (t.status === "open") openCount++;
    if (t.closedAt && new Date(t.closedAt).getTime() >= weekAgo && t.realisedPnl != null) {
      weeklyPnl += Number(t.realisedPnl);
    }
  }
  return { weeklyPnl, openCount };
}

function fmtMoney(n: number) {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function Dashboard() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data } = useQuery<TenantEnvelope>({ queryKey: ["/api/tenant"] });
  const { data: tradesData } = useQuery<TradeRow[]>({ queryKey: ["/api/tenant/trades"] });
  const stats = computeStats(tradesData);

  const setRegime = useMutation({
    mutationFn: async (toRegime: string) => {
      const r = await apiRequest("/api/tenant/regime", {
        method: "POST",
        body: JSON.stringify({ toRegime }),
      });
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/tenant"] });
      qc.invalidateQueries({ queryKey: ["/api/tenant/decisions"] });
    },
  });

  const emergencyExit = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("/api/tenant/emergency-exit", { method: "POST" });
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/tenant"] });
      qc.invalidateQueries({ queryKey: ["/api/tenant/trades"] });
      qc.invalidateQueries({ queryKey: ["/api/tenant/decisions"] });
    },
  });

  const logout = () =>
    apiRequest("/auth/logout", { method: "POST" }).then(() => location.reload());

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-lg font-semibold">Phoenix v96</h1>
            <p className="text-xs text-muted-foreground">
              {data?.tenant.name ?? "Primary instance"} ·{" "}
              <span className="font-mono">{user?.email}</span>
            </p>
          </div>
          <div className="flex items-center gap-3">
            {data?.tenant.paperTradingMode && (
              <Badge className="border-amber-500/50 bg-amber-500/10 text-amber-300">
                PAPER TRADING
              </Badge>
            )}
            <Link href="/settings">
              <Button variant="outline" size="sm">Settings</Button>
            </Link>
            {user?.isAdmin && (
              <Link href="/admin">
                <Button variant="outline" size="sm">Admin</Button>
              </Link>
            )}
            <Button variant="ghost" size="sm" onClick={logout}>Sign out</Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 p-6">
        {/* Weekly narrative (PRD §3.1 — weekly view as default) */}
        <Card>
          <CardHeader>
            <CardTitle>This week</CardTitle>
            <CardDescription>
              Bot operating normally. Next review: Sunday.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Stat label="Bot status" value={data?.tenant.botStatus.toUpperCase() ?? "OFF"} />
            <Stat label="Active regime" value={regimeLabel(data?.tenant.activeRegime)} />
            <Stat label="Open positions" value={String(stats.openCount)} />
            <Stat label="Weekly P&L" value={fmtMoney(stats.weeklyPnl)} />
          </CardContent>
        </Card>

        {/* Regime control (PRD §5.6 — most prominent interactive element) */}
        <Card>
          <CardHeader>
            <CardTitle>Regime</CardTitle>
            <CardDescription>
              The trader's market read is the edge. Set it deliberately — once per session.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-4">
              {REGIMES.map((r) => {
                const active = data?.tenant.activeRegime === r.key;
                return (
                  <button
                    key={r.key}
                    disabled={setRegime.isPending || active}
                    onClick={() => {
                      if (confirm(`Change regime to ${r.label}?`)) setRegime.mutate(r.key);
                    }}
                    className={cn(
                      "rounded-lg border border-border p-4 text-left transition-colors",
                      active
                        ? "border-primary bg-primary/10"
                        : "hover:border-primary/50 hover:bg-accent"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <div className={cn("h-2 w-2 rounded-full", r.colour)} />
                      <span className="text-sm font-medium">{r.label}</span>
                    </div>
                    {active && (
                      <div className="mt-1 text-xs text-primary">Active</div>
                    )}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Risk + Emergency (PRD §5.3 + §7.2) */}
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Risk parameters</CardTitle>
              <CardDescription>Per-tenant, never shared.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label="Risk % per trade" value={`${data?.config?.riskPercentPerTrade ?? "—"}%`} />
              <Row label="Max concurrent positions" value={`${data?.config?.maxConcurrentPositions ?? "—"}`} />
              <Row label="Daily drawdown limit" value={`${data?.config?.dailyDrawdownLimitPct ?? "—"}%`} />
              <Row label="Weekly drawdown limit" value={`${data?.config?.weeklyDrawdownLimitPct ?? "—"}%`} />
              <Row label="Min R:R" value={`${data?.config?.minRiskRewardRatio ?? "—"}`} />
            </CardContent>
          </Card>

          <Card className="border-destructive/40">
            <CardHeader>
              <CardTitle className="text-destructive">Emergency market exit</CardTitle>
              <CardDescription>
                Closes all open positions at market price. Two-tap, always available.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                variant="destructive"
                disabled={emergencyExit.isPending}
                onClick={() => {
                  if (confirm("Close all positions at market NOW?")) emergencyExit.mutate();
                }}
              >
                Close all positions
              </Button>
            </CardContent>
          </Card>
        </div>

        <TradeLogPanel />
        <DecisionsPanel />
      </main>
    </div>
  );
}

function TradeLogPanel() {
  const { data } = useQuery<any[]>({ queryKey: ["/api/tenant/trades"] });
  const open = (data ?? []).filter((t) => t.status === "open");
  const closed = (data ?? []).filter((t) => t.status !== "open");

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Open positions</CardTitle>
          <CardDescription>
            {open.length === 0 ? "No open positions. The bot is idle or waiting for a setup." : `${open.length} live position${open.length > 1 ? "s" : ""}.`}
          </CardDescription>
        </CardHeader>
        {open.length > 0 && (
          <CardContent>
            <TradeTable rows={open} showPnl={false} />
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Trade history</CardTitle>
          <CardDescription>Closed trades with realised P&amp;L and close reason (PRD §5.8).</CardDescription>
        </CardHeader>
        <CardContent>
          {closed.length ? (
            <TradeTable rows={closed} showPnl={true} />
          ) : (
            <p className="text-sm text-muted-foreground">No closed trades yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function TradeTable({ rows, showPnl }: { rows: any[]; showPnl: boolean }) {
  return (
    <div className="space-y-1 font-mono text-xs">
      <div className="grid grid-cols-12 gap-2 border-b border-border pb-1 text-muted-foreground">
        <span className="col-span-2">{showPnl ? "Closed" : "Opened"}</span>
        <span>Side</span>
        <span>Mode</span>
        <span>Regime</span>
        <span className="text-right">Entry</span>
        <span className="text-right">Stop</span>
        <span className="text-right">Target</span>
        <span className="text-right">{showPnl ? "Exit" : "Size"}</span>
        <span className="text-right">R:R</span>
        <span>{showPnl ? "Reason" : "Status"}</span>
        <span className="text-right">{showPnl ? "P&L" : ""}</span>
      </div>
      {rows.map((t) => {
        const pnl = t.realisedPnl != null ? Number(t.realisedPnl) : null;
        return (
          <div
            key={t.id}
            className={`grid grid-cols-12 gap-2 border-b border-border/30 py-1 ${
              showPnl ? "opacity-70" : ""
            }`}
          >
            <span className="col-span-2 text-muted-foreground">
              {new Date(showPnl && t.closedAt ? t.closedAt : t.openedAt).toLocaleString()}
            </span>
            <span className={t.side === "long" ? "text-emerald-400" : "text-red-400"}>{t.side}</span>
            <span>{t.setupMode}</span>
            <span>{t.regimeAtEntry}</span>
            <span className="text-right">{Number(t.entryPrice).toFixed(2)}</span>
            <span className="text-right">{Number(t.stopPrice).toFixed(2)}</span>
            <span className="text-right">{Number(t.targetPrice).toFixed(2)}</span>
            <span className="text-right">
              {showPnl
                ? t.exitPrice != null ? Number(t.exitPrice).toFixed(2) : "—"
                : Number(t.size).toFixed(4)}
            </span>
            <span className="text-right">{Number(t.plannedRR).toFixed(2)}</span>
            <span>{showPnl ? t.closeReason : t.status}</span>
            <span className={`text-right ${pnl != null && pnl >= 0 ? "text-emerald-400" : pnl != null ? "text-red-400" : ""}`}>
              {pnl != null ? fmtMoney(pnl) : ""}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function DecisionsPanel() {
  const { data } = useQuery<any[]>({ queryKey: ["/api/tenant/decisions"] });
  if (!data?.length) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent bot decisions</CardTitle>
        <CardDescription>
          Every tick the bot evaluates the market. Skips are recorded with reasoning so you can see why nothing fired.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-1 font-mono text-xs">
          {data.slice(0, 30).map((d) => (
            <div key={d.id} className="flex gap-3 border-b border-border/30 py-1">
              <span className="text-muted-foreground">{new Date(d.createdAt).toLocaleTimeString()}</span>
              <span className={
                d.decisionType === "entry" ? "text-primary" :
                d.decisionType === "halt" ? "text-destructive" :
                "text-muted-foreground"
              }>{d.decisionType}</span>
              <span>{d.regime}</span>
              <span className="truncate">{d.reasoning}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border/50 py-1.5 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}

function regimeLabel(key?: string) {
  return REGIMES.find((r) => r.key === key)?.label ?? "NO TRADE";
}
