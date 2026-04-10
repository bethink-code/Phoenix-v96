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

export default function Dashboard() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data } = useQuery<TenantEnvelope>({ queryKey: ["/api/tenant"] });

  const setRegime = useMutation({
    mutationFn: async (toRegime: string) => {
      const r = await apiRequest("/api/tenant/regime", {
        method: "POST",
        body: JSON.stringify({ toRegime }),
      });
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/tenant"] }),
  });

  const emergencyExit = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("/api/tenant/emergency-exit", { method: "POST" });
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/tenant"] }),
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
            <Stat label="Open positions" value="0" />
            <Stat label="Weekly P&L" value="$0.00" />
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
      </main>
    </div>
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
