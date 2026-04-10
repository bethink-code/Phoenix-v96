import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";

interface TenantConfig {
  paperStartingCapital: string;
  portfolioTier: string;
  riskPercentPerTrade: string;
  maxConcurrentPositions: number;
  dailyDrawdownLimitPct: string;
  weeklyDrawdownLimitPct: string;
  minRiskRewardRatio: string;
  minLevelRank: number;
}

const TIER_INFO: Record<string, { label: string; capitalRange: string; risk: string }> = {
  tiny: { label: "Tiny", capitalRange: "< $500", risk: "2% per trade · 1 position · 5%/10% drawdown" },
  small: { label: "Small", capitalRange: "$500–$5k", risk: "1.5% per trade · 2 positions · 4%/8% drawdown" },
  medium: { label: "Medium", capitalRange: "$5k–$50k", risk: "1% per trade · 2 positions · 3%/6% drawdown" },
  large: { label: "Large", capitalRange: "$50k+", risk: "0.5% per trade · 3 positions · 2%/4% drawdown" },
  auto: { label: "Auto", capitalRange: "follows capital", risk: "engine picks the tier and reapplies on capital changes" },
  manual: { label: "Manual", capitalRange: "you tuned it", risk: "the engine won't touch your settings" },
};

function tierFor(capital: number): string {
  if (capital < 500) return "tiny";
  if (capital < 5000) return "small";
  if (capital < 50000) return "medium";
  return "large";
}

interface TenantEnvelope {
  tenant: {
    id: string;
    botStatus: string;
    activeRegime: string;
    activePairId: string | null;
    paperTradingMode: boolean;
  };
  config: TenantConfig | null;
}

export default function Settings() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-lg font-semibold">Settings</h1>
            <p className="text-xs text-muted-foreground">Phoenix v96 — per-tenant configuration</p>
          </div>
          <Link href="/"><Button variant="outline" size="sm">← Dashboard</Button></Link>
        </div>
      </header>
      <main className="mx-auto max-w-4xl space-y-6 p-6">
        <BotControlCard />
        <PairSelectionCard />
        <RiskConfigCard />
        <ExchangeKeysCard />
      </main>
    </div>
  );
}

// ------------------------------------------------------------

function BotControlCard() {
  const qc = useQueryClient();
  const { data } = useQuery<TenantEnvelope>({ queryKey: ["/api/tenant"] });
  const setStatus = useMutation({
    mutationFn: async (status: "off" | "active" | "paused") => {
      await apiRequest("/api/tenant/bot-status", {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/tenant"] }),
    onError: (e) => alert(`Cannot change status: ${(e as Error).message}`),
  });

  const status = data?.tenant.botStatus ?? "off";
  return (
    <Card>
      <CardHeader>
        <CardTitle>Bot control</CardTitle>
        <CardDescription>
          Switch the bot on only after you've set a regime. OFF honours existing position exits.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-3 flex items-center gap-2">
          <Badge className={status === "active" ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}>
            {status.toUpperCase()}
          </Badge>
          <Badge className="bg-amber-500/10 text-amber-300">Paper trading enforced (Phase 1)</Badge>
        </div>
        <div className="flex gap-2">
          <Button
            disabled={status === "active" || setStatus.isPending}
            onClick={() => {
              if (confirm("Start the bot? It will begin evaluating setups on the next tick.")) {
                setStatus.mutate("active");
              }
            }}
          >
            Start
          </Button>
          <Button
            variant="outline"
            disabled={status === "paused" || setStatus.isPending}
            onClick={() => setStatus.mutate("paused")}
          >
            Pause
          </Button>
          <Button
            variant="destructive"
            disabled={status === "off" || setStatus.isPending}
            onClick={() => setStatus.mutate("off")}
          >
            Stop
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ------------------------------------------------------------

function PairSelectionCard() {
  const qc = useQueryClient();
  const { data: envelope } = useQuery<TenantEnvelope>({ queryKey: ["/api/tenant"] });
  const { data: pairs } = useQuery<any[]>({ queryKey: ["/api/markets"] });
  const [pending, setPending] = useState<string | null>(null);
  const [justSavedAt, setJustSavedAt] = useState<number | null>(null);

  const setPair = useMutation({
    mutationFn: async (pairId: string | null) => {
      await apiRequest("/api/tenant/pair", {
        method: "PATCH",
        body: JSON.stringify({ pairId }),
      });
    },
    onSuccess: () => {
      setPending(null);
      setJustSavedAt(Date.now());
      qc.invalidateQueries({ queryKey: ["/api/tenant"] });
      setTimeout(() => setJustSavedAt(null), 2500);
    },
  });

  const active = envelope?.tenant.activePairId;
  const selected = pending ?? active ?? null;
  const dirty = pending !== null && pending !== active;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Trading pair</CardTitle>
        <CardDescription>
          Select the market this instance trades, then click Save. Only admin-curated pairs are shown.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {pairs?.length ? pairs.map((p) => {
          const isActive = active === p.id;
          const isSelected = selected === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setPending(p.id)}
              className={`flex w-full items-center justify-between rounded-md border p-3 text-left transition-colors ${
                isSelected
                  ? "border-primary bg-primary/10"
                  : "border-border hover:bg-accent"
              }`}
            >
              <div>
                <div className="text-sm font-medium">{p.displayName}</div>
                <div className="font-mono text-xs text-muted-foreground">
                  {p.baseAsset}/{p.quoteAsset} · liquidity: {p.liquidityRating}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isActive && <Badge className="bg-primary/20 text-primary">Active</Badge>}
                {isSelected && !isActive && <Badge className="bg-amber-500/10 text-amber-300">Selected</Badge>}
              </div>
            </button>
          );
        }) : <p className="text-sm text-muted-foreground">No pairs available. Ask admin to seed the registry.</p>}

        {(dirty || justSavedAt) && (
          <div className="flex items-center gap-3 border-t border-border/50 pt-3">
            <Button
              disabled={!dirty || setPair.isPending}
              onClick={() => pending && setPair.mutate(pending)}
            >
              {setPair.isPending ? "Saving…" : "Save pair"}
            </Button>
            {dirty && (
              <Button variant="ghost" onClick={() => setPending(null)}>Cancel</Button>
            )}
            {justSavedAt && !dirty && (
              <span className="text-sm text-primary">✓ Saved</span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ------------------------------------------------------------

function RiskConfigCard() {
  const qc = useQueryClient();
  const { data } = useQuery<TenantEnvelope>({ queryKey: ["/api/tenant"] });
  const [form, setForm] = useState<TenantConfig | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const effective = form ?? data?.config ?? null;

  const save = useMutation({
    mutationFn: async () => {
      if (!form) return;
      await apiRequest("/api/tenant/config", {
        method: "PATCH",
        body: JSON.stringify({
          paperStartingCapital: form.paperStartingCapital,
          riskPercentPerTrade: form.riskPercentPerTrade,
          maxConcurrentPositions: Number(form.maxConcurrentPositions),
          dailyDrawdownLimitPct: form.dailyDrawdownLimitPct,
          weeklyDrawdownLimitPct: form.weeklyDrawdownLimitPct,
          minRiskRewardRatio: form.minRiskRewardRatio,
          minLevelRank: Number(form.minLevelRank),
        }),
      });
    },
    onSuccess: () => {
      setForm(null);
      qc.invalidateQueries({ queryKey: ["/api/tenant"] });
    },
  });

  const applyTier = useMutation({
    mutationFn: async (tier: string) => {
      await apiRequest("/api/tenant/portfolio-tier", {
        method: "PATCH",
        body: JSON.stringify({ tier }),
      });
    },
    onSuccess: () => {
      setForm(null);
      qc.invalidateQueries({ queryKey: ["/api/tenant"] });
    },
  });

  if (!effective) return null;
  const update = <K extends keyof TenantConfig>(k: K, v: TenantConfig[K]) =>
    setForm({ ...(form ?? data!.config!), [k]: v });

  const currentTier = effective.portfolioTier ?? "auto";
  const computedTier = tierFor(Number(effective.paperStartingCapital ?? 0));
  const displayTier = currentTier === "auto" ? computedTier : currentTier;
  const tierMeta = TIER_INFO[displayTier] ?? TIER_INFO.medium;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Risk parameters</CardTitle>
        <CardDescription>
          Tell me how much you've got and I'll set up the rest. You can override individual fields later.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* The simple-mode controls */}
        <div className="grid gap-3 md:grid-cols-2">
          <Field
            label="Paper starting capital (USDT)"
            value={effective.paperStartingCapital}
            onChange={(v) => update("paperStartingCapital", v)}
          />
          <div>
            <Label>Tier</Label>
            <div className="mt-1 flex items-center gap-2">
              <Badge className="bg-primary/20 text-primary">{tierMeta.label}</Badge>
              <span className="text-xs text-muted-foreground">{tierMeta.capitalRange}</span>
              {currentTier === "manual" && (
                <Badge className="bg-amber-500/10 text-amber-300">manual override</Badge>
              )}
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">{tierMeta.risk}</p>
          </div>
        </div>

        {/* Tier action buttons */}
        <div className="flex flex-wrap gap-2 border-t border-border/40 pt-4">
          <Button
            size="sm"
            variant={currentTier === "auto" ? "default" : "outline"}
            disabled={applyTier.isPending}
            onClick={() => applyTier.mutate("auto")}
          >
            Auto (follow capital)
          </Button>
          {(["tiny", "small", "medium", "large"] as const).map((t) => (
            <Button
              key={t}
              size="sm"
              variant="outline"
              disabled={applyTier.isPending}
              onClick={() => applyTier.mutate(t)}
            >
              Use {TIER_INFO[t].label}
            </Button>
          ))}
        </div>

        {/* Advanced toggle */}
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          {showAdvanced ? "▾ Hide" : "▸ Show"} advanced parameters (will switch to manual)
        </button>

        {showAdvanced && (
          <div className="grid gap-3 border-t border-border/40 pt-4 md:grid-cols-2">
            <Field label="Risk % per trade" value={effective.riskPercentPerTrade} onChange={(v) => update("riskPercentPerTrade", v)} />
            <Field label="Max concurrent positions" type="number" value={String(effective.maxConcurrentPositions)}
              onChange={(v) => update("maxConcurrentPositions", Number(v) as any)} />
            <Field label="Daily drawdown limit %" value={effective.dailyDrawdownLimitPct}
              onChange={(v) => update("dailyDrawdownLimitPct", v)} />
            <Field label="Weekly drawdown limit %" value={effective.weeklyDrawdownLimitPct}
              onChange={(v) => update("weeklyDrawdownLimitPct", v)} />
            <Field label="Min R:R ratio" value={effective.minRiskRewardRatio}
              onChange={(v) => update("minRiskRewardRatio", v)} />
            <Field label="Min level rank (1-5)" type="number" value={String(effective.minLevelRank)}
              onChange={(v) => update("minLevelRank", Number(v) as any)} />
          </div>
        )}

        {form && (
          <div className="border-t border-border/40 pt-4">
            <Button
              disabled={save.isPending}
              onClick={() => save.mutate()}
            >
              {save.isPending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  value,
  onChange,
  type,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input type={type ?? "text"} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

// ------------------------------------------------------------

function ExchangeKeysCard() {
  const qc = useQueryClient();
  const { data: keys } = useQuery<any[]>({ queryKey: ["/api/tenant/exchange-keys"] });
  const [form, setForm] = useState({ exchange: "binance", apiKey: "", apiSecret: "" });

  const save = useMutation({
    mutationFn: async () => {
      await apiRequest("/api/tenant/exchange-keys", {
        method: "POST",
        body: JSON.stringify(form),
      });
    },
    onSuccess: () => {
      setForm({ exchange: "binance", apiKey: "", apiSecret: "" });
      qc.invalidateQueries({ queryKey: ["/api/tenant/exchange-keys"] });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Exchange keys</CardTitle>
        <CardDescription>
          Encrypted at rest with AES-256-GCM. Never shown again after save.
          Use read + trade permissions only — <strong>never</strong> enable withdrawals.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          {keys?.length ? keys.map((k) => (
            <div key={k.id} className="flex items-center justify-between border-b border-border/50 py-2 text-sm">
              <div>
                <span className="font-medium">{k.exchange}</span>
                <span className="ml-2 font-mono text-xs text-muted-foreground">
                  added {new Date(k.createdAt).toLocaleDateString()}
                </span>
              </div>
              <Badge className={k.permissionsValidatedAt ? "bg-primary/20 text-primary" : "bg-amber-500/10 text-amber-300"}>
                {k.permissionsValidatedAt ? "validated" : "unverified"}
              </Badge>
            </div>
          )) : <p className="text-sm text-muted-foreground">No exchange keys saved yet.</p>}
        </div>

        <form
          onSubmit={(e) => { e.preventDefault(); save.mutate(); }}
          className="space-y-3 border-t border-border/50 pt-4"
        >
          <div className="space-y-1">
            <Label>Exchange</Label>
            <select
              className="flex h-10 w-full rounded-md border border-border bg-input px-3 py-2 text-sm"
              value={form.exchange}
              onChange={(e) => setForm({ ...form, exchange: e.target.value })}
            >
              <option value="binance">Binance</option>
              <option value="bybit">Bybit</option>
            </select>
          </div>
          <Field label="API key" value={form.apiKey} onChange={(v) => setForm({ ...form, apiKey: v })} />
          <Field label="API secret" value={form.apiSecret} onChange={(v) => setForm({ ...form, apiSecret: v })} />
          <Button type="submit" disabled={save.isPending || !form.apiKey || !form.apiSecret}>
            {save.isPending ? "Encrypting…" : "Save key"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
