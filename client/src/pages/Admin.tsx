import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";

type Tab = "users" | "invites" | "requests" | "pairs" | "audit" | "security";

export default function Admin() {
  const [tab, setTab] = useState<Tab>("users");
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-lg font-semibold">Admin Console</h1>
            <p className="text-xs text-muted-foreground">Phoenix v96 — cross-tenant oversight</p>
          </div>
          <Link href="/"><Button variant="outline" size="sm">← Dashboard</Button></Link>
        </div>
        <div className="mx-auto flex max-w-6xl gap-1 px-6">
          {(["users", "invites", "requests", "pairs", "audit", "security"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`-mb-px border-b-2 px-4 py-2 text-sm capitalize ${
                tab === t
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </header>
      <main className="mx-auto max-w-6xl p-6">
        {tab === "users" && <UsersTab />}
        {tab === "invites" && <InvitesTab />}
        {tab === "requests" && <RequestsTab />}
        {tab === "pairs" && <PairsTab />}
        {tab === "audit" && <AuditTab />}
        {tab === "security" && <SecurityTab />}
      </main>
    </div>
  );
}

function UsersTab() {
  const qc = useQueryClient();
  const { data } = useQuery<any[]>({ queryKey: ["/api/admin/users"] });
  const setAdmin = useMutation({
    mutationFn: async ({ id, isAdmin }: { id: string; isAdmin: boolean }) => {
      await apiRequest(`/api/admin/users/${id}/admin`, {
        method: "PATCH",
        body: JSON.stringify({ isAdmin }),
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/users"] }),
  });
  const setSuspended = useMutation({
    mutationFn: async ({ id, isSuspended }: { id: string; isSuspended: boolean }) => {
      await apiRequest(`/api/admin/users/${id}/suspended`, {
        method: "PATCH",
        body: JSON.stringify({ isSuspended }),
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/users"] }),
  });
  return (
    <Card>
      <CardHeader><CardTitle>Users</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {data?.map((u) => (
          <div key={u.id} className="flex items-center justify-between border-b border-border/50 py-2">
            <div>
              <div className="text-sm font-medium">{u.firstName} {u.lastName}</div>
              <div className="font-mono text-xs text-muted-foreground">{u.email}</div>
            </div>
            <div className="flex items-center gap-2">
              {u.isAdmin && <Badge className="bg-primary/20 text-primary">Admin</Badge>}
              {u.isSuspended && <Badge className="bg-destructive/20 text-destructive">Suspended</Badge>}
              <Button
                size="sm"
                variant="outline"
                onClick={() => setAdmin.mutate({ id: u.id, isAdmin: !u.isAdmin })}
              >
                {u.isAdmin ? "Revoke admin" : "Make admin"}
              </Button>
              <Button
                size="sm"
                variant={u.isSuspended ? "outline" : "destructive"}
                onClick={() => setSuspended.mutate({ id: u.id, isSuspended: !u.isSuspended })}
              >
                {u.isSuspended ? "Unsuspend" : "Suspend"}
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function InvitesTab() {
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const { data } = useQuery<any[]>({ queryKey: ["/api/admin/invites"] });
  const add = useMutation({
    mutationFn: async () => {
      await apiRequest("/api/admin/invites", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
    },
    onSuccess: () => {
      setEmail("");
      qc.invalidateQueries({ queryKey: ["/api/admin/invites"] });
    },
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest(`/api/admin/invites/${id}`, { method: "DELETE" });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/invites"] }),
  });
  return (
    <Card>
      <CardHeader><CardTitle>Invites</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <form
          onSubmit={(e) => { e.preventDefault(); add.mutate(); }}
          className="flex gap-2"
        >
          <Input
            type="email"
            placeholder="email@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Button type="submit">Add invite</Button>
        </form>
        <div className="space-y-1">
          {data?.map((i) => (
            <div key={i.id} className="flex items-center justify-between border-b border-border/50 py-2">
              <span className="font-mono text-sm">{i.email}</span>
              <Button size="sm" variant="ghost" onClick={() => remove.mutate(i.id)}>Remove</Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function RequestsTab() {
  const qc = useQueryClient();
  const { data } = useQuery<any[]>({ queryKey: ["/api/admin/access-requests"] });
  const decide = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "approved" | "declined" }) => {
      await apiRequest(`/api/admin/access-requests/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/access-requests"] }),
  });
  return (
    <Card>
      <CardHeader><CardTitle>Access requests</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {data?.map((r) => (
          <div key={r.id} className="flex items-center justify-between border-b border-border/50 py-2">
            <div>
              <div className="text-sm font-medium">{r.name} <Badge className="ml-2">{r.status}</Badge></div>
              <div className="font-mono text-xs text-muted-foreground">{r.email} · {r.cell}</div>
              {r.reason && <div className="mt-1 text-xs">{r.reason}</div>}
            </div>
            {r.status === "pending" && (
              <div className="flex gap-2">
                <Button size="sm" onClick={() => decide.mutate({ id: r.id, status: "approved" })}>Approve</Button>
                <Button size="sm" variant="outline" onClick={() => decide.mutate({ id: r.id, status: "declined" })}>Decline</Button>
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function AuditTab() {
  const { data } = useQuery<any[]>({ queryKey: ["/api/admin/audit-logs"] });
  return (
    <Card>
      <CardHeader><CardTitle>Audit log</CardTitle></CardHeader>
      <CardContent>
        <div className="space-y-1 font-mono text-xs">
          {data?.map((l) => (
            <div key={l.id} className="flex gap-3 border-b border-border/30 py-1">
              <span className="text-muted-foreground">{new Date(l.createdAt).toISOString()}</span>
              <span className="text-primary">{l.action}</span>
              <span>{l.outcome}</span>
              {l.resourceType && <span className="text-muted-foreground">{l.resourceType}:{l.resourceId}</span>}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function SecurityTab() {
  const { data } = useQuery<any>({ queryKey: ["/api/admin/security-overview"] });
  return (
    <Card>
      <CardHeader><CardTitle>Security overview</CardTitle></CardHeader>
      <CardContent className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Total users" value={data?.totalUsers ?? 0} />
        <Stat label="Admins" value={data?.admins ?? 0} />
        <Stat label="Suspended" value={data?.suspended ?? 0} />
        <Stat label="Pending requests" value={data?.pendingRequests ?? 0} />
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}

interface BinanceSymbol {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  minQty: string;
}

const ASSET_NAMES: Record<string, string> = {
  BTC: "Bitcoin",
  ETH: "Ethereum",
  SOL: "Solana",
  XRP: "XRP",
  ADA: "Cardano",
  DOGE: "Dogecoin",
  LINK: "Chainlink",
  AVAX: "Avalanche",
  MATIC: "Polygon",
  DOT: "Polkadot",
  USDT: "Tether",
  USDC: "USD Coin",
  BNB: "BNB",
  LTC: "Litecoin",
  TRX: "Tron",
};
const niceAsset = (a: string) => ASSET_NAMES[a] ?? a;

function PairsTab() {
  const qc = useQueryClient();
  const { data: pairs } = useQuery<any[]>({ queryKey: ["/api/admin/pairs"] });
  const [quoteFilter, setQuoteFilter] = useState("USDT");
  const { data: symbolsResponse, isLoading: symbolsLoading, error: symbolsError } = useQuery<{
    symbols: BinanceSymbol[];
    refreshedAt: string;
  }>({
    queryKey: [`/api/admin/exchanges/binance/symbols?quote=${quoteFilter}`],
    retry: false,
  });
  const symbols = symbolsResponse?.symbols;
  const [search, setSearch] = useState("");

  const existingSymbols = new Set(
    (pairs ?? []).map((p) => `${p.baseAsset}${p.quoteAsset}`)
  );

  // Server already filtered by quote currency
  const filtered = (symbols ?? [])
    .filter((s) =>
      search ? s.baseAsset.toUpperCase().includes(search.toUpperCase()) : true
    )
    .filter((s) => !existingSymbols.has(s.symbol))
    .slice(0, 30);

  const create = useMutation({
    mutationFn: async (sym: BinanceSymbol) => {
      await apiRequest("/api/admin/pairs", {
        method: "POST",
        body: JSON.stringify({
          baseAsset: sym.baseAsset,
          quoteAsset: sym.quoteAsset,
          displayName: `${niceAsset(sym.baseAsset)} / ${niceAsset(sym.quoteAsset)}`,
          supportedExchanges: ["binance"],
          minOrderSize: sym.minQty,
          liquidityRating: ["BTC", "ETH", "SOL"].includes(sym.baseAsset) ? "high" : "medium",
        }),
      });
    },
    onSuccess: () => {
      setSearch("");
      qc.invalidateQueries({ queryKey: ["/api/admin/pairs"] });
    },
  });

  const toggle = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      await apiRequest(`/api/admin/pairs/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled }),
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/pairs"] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/pairs/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `${res.status}`);
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/pairs"] }),
    onError: (e) => alert(`Cannot delete: ${(e as Error).message}`),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Add market pair</CardTitle>
          <CardDescription>
            Pick from Binance's live pair list. Pair metadata (base, quote, min order size) is fetched directly from the exchange so there's no manual typing.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="Search base asset (e.g. BTC, SOL)"
              value={search}
              onChange={(e) => setSearch(e.target.value.toUpperCase())}
              className="flex-1"
            />
            <select
              className="h-10 rounded-md border border-border bg-input px-3 text-sm"
              value={quoteFilter}
              onChange={(e) => setQuoteFilter(e.target.value)}
            >
              <option value="USDT">USDT</option>
              <option value="USDC">USDC</option>
              <option value="BTC">BTC</option>
              <option value="ETH">ETH</option>
            </select>
          </div>
          {symbolsError ? (
            <p className="text-sm text-destructive">
              Failed to fetch Binance pair list: {(symbolsError as Error).message}
            </p>
          ) : symbolsLoading ? (
            <p className="text-sm text-muted-foreground">Loading Binance pair list…</p>
          ) : !symbols || symbols.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Binance returned no symbols. Check the BINANCE_API_BASE_URL env var.
            </p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No matches in {symbols.length} symbols. Try a different search or quote currency.
            </p>
          ) : (
            <div className="grid gap-2 md:grid-cols-2">
              {filtered.map((s) => (
                <button
                  key={s.symbol}
                  type="button"
                  disabled={create.isPending}
                  onClick={() => create.mutate(s)}
                  className="flex items-center justify-between rounded-md border border-border p-3 text-left transition-colors hover:border-primary/50 hover:bg-accent"
                >
                  <div>
                    <div className="text-sm font-medium">
                      {niceAsset(s.baseAsset)} / {niceAsset(s.quoteAsset)}
                    </div>
                    <div className="font-mono text-xs text-muted-foreground">
                      {s.symbol} · min {Number(s.minQty).toFixed(8)}
                    </div>
                  </div>
                  <span className="text-xs text-primary">+ Add</span>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Registry</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {pairs?.length ? pairs.map((p) => (
            <div key={p.id} className="flex items-center justify-between border-b border-border/50 py-2">
              <div>
                <div className="text-sm font-medium">
                  {p.displayName}{" "}
                  <Badge className={p.enabled ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}>
                    {p.enabled ? "enabled" : "disabled"}
                  </Badge>
                  <Badge className="ml-1">{p.liquidityRating}</Badge>
                </div>
                <div className="font-mono text-xs text-muted-foreground">
                  {p.baseAsset}/{p.quoteAsset} · {(p.supportedExchanges as string[]).join(", ")} · min {p.minOrderSize}
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline"
                  onClick={() => toggle.mutate({ id: p.id, enabled: !p.enabled })}>
                  {p.enabled ? "Disable" : "Enable"}
                </Button>
                <Button size="sm" variant="destructive"
                  onClick={() => {
                    if (confirm(`Delete ${p.displayName}? This can't be undone.`)) {
                      remove.mutate(p.id);
                    }
                  }}>
                  Delete
                </Button>
              </div>
            </div>
          )) : <p className="text-sm text-muted-foreground">No pairs yet. Add BTC/USDT above to get started.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
