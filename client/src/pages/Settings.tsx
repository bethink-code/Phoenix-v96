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
  riskPercentPerTrade: string;
  maxConcurrentPositions: number;
  dailyDrawdownLimitPct: string;
  weeklyDrawdownLimitPct: string;
  minRiskRewardRatio: string;
  minLevelRank: number;
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
  const setPair = useMutation({
    mutationFn: async (pairId: string | null) => {
      await apiRequest("/api/tenant/pair", {
        method: "PATCH",
        body: JSON.stringify({ pairId }),
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/tenant"] }),
  });

  const active = envelope?.tenant.activePairId;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Trading pair</CardTitle>
        <CardDescription>
          Select the market this instance trades. Only admin-curated pairs are shown.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {pairs?.length ? pairs.map((p) => (
          <button
            key={p.id}
            onClick={() => setPair.mutate(p.id)}
            className={`flex w-full items-center justify-between rounded-md border p-3 text-left transition-colors ${
              active === p.id
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
            {active === p.id && <Badge className="bg-primary/20 text-primary">Active</Badge>}
          </button>
        )) : <p className="text-sm text-muted-foreground">No pairs available. Ask admin to seed the registry.</p>}
      </CardContent>
    </Card>
  );
}

// ------------------------------------------------------------

function RiskConfigCard() {
  const qc = useQueryClient();
  const { data } = useQuery<TenantEnvelope>({ queryKey: ["/api/tenant"] });
  const [form, setForm] = useState<TenantConfig | null>(null);

  const effective = form ?? data?.config ?? null;

  const save = useMutation({
    mutationFn: async () => {
      if (!form) return;
      await apiRequest("/api/tenant/config", {
        method: "PATCH",
        body: JSON.stringify({
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

  if (!effective) return null;
  const update = <K extends keyof TenantConfig>(k: K, v: TenantConfig[K]) =>
    setForm({ ...(form ?? data!.config!), [k]: v });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Risk parameters</CardTitle>
        <CardDescription>
          Changes take effect on the next bot tick. Risk limits are immutable at runtime — only changeable here.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2">
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
        <div className="md:col-span-2">
          <Button
            disabled={!form || save.isPending}
            onClick={() => {
              if (confirm("Save risk parameter changes? They take effect on the next tick.")) {
                save.mutate();
              }
            }}
          >
            {save.isPending ? "Saving…" : "Save changes"}
          </Button>
        </div>
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
