import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import ConfirmModal from "@/components/ConfirmModal";
import AgentFeed from "@/components/AgentFeed";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { Link } from "wouter";

interface Tenant {
  id: string;
  name: string;
  botStatus: "off" | "active" | "paused" | "halted" | "error";
  activeRegime: string;
  activePairId: string | null;
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

type ModalState =
  | { kind: "none" }
  | { kind: "regime"; toRegime: string }
  | { kind: "bot"; status: "active" | "paused" | "off" }
  | { kind: "emergency" };

export default function Dashboard() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data } = useQuery<TenantEnvelope>({ queryKey: ["/api/tenant"] });
  const { data: tradesData } = useQuery<TradeRow[]>({ queryKey: ["/api/tenant/trades"] });
  const stats = computeStats(tradesData);
  const [modal, setModal] = useState<ModalState>({ kind: "none" });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["/api/tenant"] });
    qc.invalidateQueries({ queryKey: ["/api/tenant/trades"] });
    qc.invalidateQueries({ queryKey: ["/api/tenant/decisions"] });
  };

  const setRegime = useMutation({
    mutationFn: async (toRegime: string) => {
      const r = await apiRequest("/api/tenant/regime", {
        method: "POST",
        body: JSON.stringify({ toRegime }),
      });
      return r.json();
    },
    onSuccess: () => {
      setModal({ kind: "none" });
      invalidateAll();
    },
  });

  const setBotStatus = useMutation({
    mutationFn: async (status: "active" | "paused" | "off") => {
      const r = await apiRequest("/api/tenant/bot-status", {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      return r.json();
    },
    onSuccess: () => {
      setModal({ kind: "none" });
      invalidateAll();
    },
    onError: (e) => {
      setModal({ kind: "none" });
      alert(`Cannot change status: ${(e as Error).message}`);
    },
  });

  const emergencyExit = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("/api/tenant/emergency-exit", { method: "POST" });
      return r.json();
    },
    onSuccess: () => {
      setModal({ kind: "none" });
      invalidateAll();
    },
  });

  const logout = () =>
    apiRequest("/auth/logout", { method: "POST" }).then(() => location.reload());

  const botStatus = data?.tenant.botStatus ?? "off";
  const currentRegime = data?.tenant.activeRegime ?? "no_trade";
  const regimeHuman = regimeLabel(currentRegime);
  const hasPair = Boolean(data?.tenant.activePairId);

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
        {/* Alter ego — voice + stats + actions, all in one card */}
        <AgentFeed
          botStatus={botStatus}
          activeRegime={currentRegime}
          stats={
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <Stat label="Status" value={botStatus.toUpperCase()} />
              <Stat label="Regime" value={regimeHuman} />
              <Stat label="Open" value={String(stats.openCount)} />
              <Stat label="Week P&L" value={fmtMoney(stats.weeklyPnl)} />
            </div>
          }
          actions={
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={botStatus === "active" || setBotStatus.isPending}
                onClick={() => setModal({ kind: "bot", status: "active" })}
              >
                Start
              </Button>
              <Button
                variant="outline"
                disabled={botStatus !== "active" || setBotStatus.isPending}
                onClick={() => setModal({ kind: "bot", status: "paused" })}
              >
                Pause
              </Button>
              <Button
                variant="outline"
                disabled={botStatus === "off" || setBotStatus.isPending}
                onClick={() => setModal({ kind: "bot", status: "off" })}
              >
                Stop
              </Button>
              <div className="ml-auto">
                <Button
                  variant="destructive"
                  disabled={stats.openCount === 0 || emergencyExit.isPending}
                  onClick={() => setModal({ kind: "emergency" })}
                >
                  Emergency exit · {stats.openCount} open
                </Button>
              </div>
            </div>
          }
        />

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
                const active = currentRegime === r.key;
                return (
                  <button
                    key={r.key}
                    disabled={setRegime.isPending || active}
                    onClick={() => setModal({ kind: "regime", toRegime: r.key })}
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

        {/* Risk parameters (PRD §5.3) */}
        <Card>
          <CardHeader>
            <CardTitle>Risk parameters</CardTitle>
            <CardDescription>Per-tenant, never shared. Edit in Settings.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 text-sm md:grid-cols-5">
            <Stat label="Risk % per trade" value={`${data?.config?.riskPercentPerTrade ?? "—"}%`} />
            <Stat label="Max positions" value={`${data?.config?.maxConcurrentPositions ?? "—"}`} />
            <Stat label="Daily drawdown" value={`${data?.config?.dailyDrawdownLimitPct ?? "—"}%`} />
            <Stat label="Weekly drawdown" value={`${data?.config?.weeklyDrawdownLimitPct ?? "—"}%`} />
            <Stat label="Min R:R" value={`${data?.config?.minRiskRewardRatio ?? "—"}`} />
          </CardContent>
        </Card>

        <TradeLogPanel />
      </main>

      {/* Modals ---------------------------------------------------------- */}
      <ConfirmModal
        open={modal.kind === "regime"}
        title={modal.kind === "regime" ? `Switch regime to ${regimeLabel(modal.toRegime)}?` : ""}
        description="Regime changes take effect on the next bot tick and determine which setup modes are permitted, the position size multiplier, and the minimum R:R required."
        consequences={
          modal.kind === "regime"
            ? buildRegimeConsequences(modal.toRegime)
            : []
        }
        confirmLabel={modal.kind === "regime" ? `Switch to ${regimeLabel(modal.toRegime)}` : ""}
        pending={setRegime.isPending}
        onCancel={() => setModal({ kind: "none" })}
        onConfirm={() => modal.kind === "regime" && setRegime.mutate(modal.toRegime)}
      />

      <ConfirmModal
        open={modal.kind === "bot"}
        title={modal.kind === "bot" ? botModalTitle(modal.status) : ""}
        description={modal.kind === "bot" ? botModalDescription(modal.status) : ""}
        consequences={
          modal.kind === "bot" ? botModalConsequences(modal.status, currentRegime, hasPair) : []
        }
        confirmLabel={modal.kind === "bot" ? botModalConfirmLabel(modal.status) : ""}
        confirmVariant={modal.kind === "bot" && modal.status === "off" ? "destructive" : "default"}
        pending={setBotStatus.isPending}
        onCancel={() => setModal({ kind: "none" })}
        onConfirm={() => modal.kind === "bot" && setBotStatus.mutate(modal.status)}
      />

      <ConfirmModal
        open={modal.kind === "emergency"}
        title="Close all positions at market NOW?"
        description="This is the fire extinguisher — use it when something is genuinely wrong and the priority is to be flat immediately, not to get a good price."
        consequences={[
          `Immediately closes all ${stats.openCount} open position${stats.openCount === 1 ? "" : "s"} at the current market price.`,
          "Bot is set to HALTED. No new entries until you explicitly restart with a fresh regime selection.",
          "A critical risk event is logged and (when WhatsApp is wired) an urgent alert is sent.",
        ]}
        confirmLabel="Close all positions NOW"
        confirmVariant="destructive"
        pending={emergencyExit.isPending}
        onCancel={() => setModal({ kind: "none" })}
        onConfirm={() => emergencyExit.mutate()}
      />
    </div>
  );
}

function botModalTitle(s: "active" | "paused" | "off") {
  if (s === "active") return "Start the bot?";
  if (s === "paused") return "Pause the bot?";
  return "Stop the bot?";
}

function botModalDescription(s: "active" | "paused" | "off") {
  if (s === "active")
    return "The bot will begin evaluating the market on the next tick and can open paper positions when a valid setup is found.";
  if (s === "paused")
    return "The bot stops opening new positions immediately. Any existing positions are still managed to their natural stop/target exits.";
  return "The bot stops opening new positions. Existing positions are NOT auto-closed — use Emergency exit for that.";
}

function botModalConsequences(
  s: "active" | "paused" | "off",
  regime: string,
  hasPair: boolean
): string[] {
  const cons: string[] = [];
  if (s === "active") {
    if (regime === "no_trade") cons.push("⚠ You must first pick a regime other than NO TRADE. This action will fail.");
    if (!hasPair) cons.push("⚠ No trading pair is selected. Go to Settings → Trading pair first.");
    cons.push("Bot ticks every 60 seconds and runs the full pipeline (regime → temporal → candles → strategy → risk manager).");
    cons.push("Paper trading is enforced — no real orders will be sent.");
  } else if (s === "paused") {
    cons.push("No new entries. Existing stops and targets still execute if price hits them.");
    cons.push("You can resume by clicking Start again.");
  } else {
    cons.push("No new entries.");
    cons.push("Existing positions are NOT closed automatically.");
    cons.push("To close open positions immediately, use Emergency exit instead.");
  }
  return cons;
}

function botModalConfirmLabel(s: "active" | "paused" | "off") {
  if (s === "active") return "Start bot";
  if (s === "paused") return "Pause bot";
  return "Stop bot";
}

function buildRegimeConsequences(toRegime: string): string[] {
  const map: Record<string, string[]> = {
    no_trade: [
      "All entries will be suppressed.",
      "Existing positions continue to be managed to their exits.",
      "Bot will remain silent until you pick a tradeable regime.",
    ],
    ranging: [
      "Both Mode A (survive the sweep) and Mode B (confirmation) are permitted.",
      "Position sizing at 100% of base risk %.",
      "Minimum R:R: 2.0.",
    ],
    trending: [
      "Only Mode B (confirmation) setups permitted, in the trend direction.",
      "Minimum R:R raised to 2.5.",
      "Counter-trend setups are suppressed.",
    ],
    breakout: [
      "Only Mode B permitted. Position size halved.",
      "Minimum R:R raised to 3.0 — false signals are expected.",
    ],
    high_volatility: [
      "All entries suppressed. Manipulation environment.",
      "Existing positions get tighter emergency stops.",
    ],
    low_liquidity: [
      "All entries suppressed.",
      "Existing positions may be closed at session end.",
    ],
    accumulation_distribution: [
      "Both modes permitted with 75% position sizing.",
      "Minimum R:R raised to 2.5. Sweep failures expected to be higher.",
    ],
  };
  return map[toRegime] ?? [];
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}

function regimeLabel(key?: string) {
  return REGIMES.find((r) => r.key === key)?.label ?? "NO TRADE";
}
