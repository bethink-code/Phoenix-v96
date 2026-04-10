import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";

type Tab = "users" | "invites" | "requests" | "audit" | "security";

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
          {(["users", "invites", "requests", "audit", "security"] as Tab[]).map((t) => (
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
