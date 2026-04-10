import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/queryClient";

export default function Landing() {
  const [showRequest, setShowRequest] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", cell: "", reason: "" });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await apiRequest("/api/request-access", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setSubmitted(true);
    } catch {
      /* show error UI later */
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2">
          <CardTitle className="text-2xl">Phoenix v96</CardTitle>
          <CardDescription>
            Crypto liquidity-sweep trading bot. Invite-only access.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!showRequest ? (
            <>
              <Button
                className="w-full"
                onClick={() => (window.location.href = "/auth/google")}
              >
                Sign in with Google
              </Button>
              <button
                className="w-full text-sm text-muted-foreground underline-offset-4 hover:underline"
                onClick={() => setShowRequest(true)}
              >
                Don't have an invite? Request access →
              </button>
            </>
          ) : submitted ? (
            <div className="space-y-3 text-center">
              <p className="text-sm">Request received. We'll be in touch.</p>
              <Button variant="ghost" onClick={() => setShowRequest(false)}>
                ← Back
              </Button>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-3">
              <div className="space-y-1">
                <Label>Name</Label>
                <Input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Email</Label>
                <Input
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Cell (optional)</Label>
                <Input
                  value={form.cell}
                  onChange={(e) => setForm({ ...form, cell: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Why do you want access?</Label>
                <Input
                  value={form.reason}
                  onChange={(e) => setForm({ ...form, reason: e.target.value })}
                />
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" type="button" onClick={() => setShowRequest(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting} className="flex-1">
                  {submitting ? "Sending…" : "Request access"}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
