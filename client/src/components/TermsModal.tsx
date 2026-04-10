import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";

export default function TermsModal() {
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const accept = useMutation({
    mutationFn: async () => {
      await apiRequest("/api/user/accept-terms", { method: "POST" });
    },
    onSuccess: () => {
      window.location.reload();
    },
    onError: (e) => setError((e as Error).message || "failed"),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="w-full max-w-lg rounded-lg border border-border bg-card p-6 shadow-xl">
        <h2 className="text-xl font-semibold">Terms of use</h2>
        <div className="mt-4 space-y-3 text-sm text-muted-foreground">
          <p>
            <strong className="text-foreground">Phoenix v96 trades on your behalf.</strong>{" "}
            You are responsible for the capital committed to your exchange account. The platform
            enforces risk limits you configure, but it cannot guarantee profit.
          </p>
          <p>
            Paper trading mode is the default. You must explicitly disable it before the bot will
            place real orders, and testnet validation is expected first.
          </p>
          <p>
            The operator reviews all instances for safety. Your data is isolated and never
            accessible to other users.
          </p>
        </div>
        <label className="mt-4 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
          />
          I understand and accept these terms.
        </label>
        {error && <div className="mt-3 text-sm text-destructive">Error: {error}</div>}
        <div className="mt-4 flex justify-end">
          <Button disabled={!checked || accept.isPending} onClick={() => accept.mutate()}>
            {accept.isPending ? "Saving…" : "Continue"}
          </Button>
        </div>
      </div>
    </div>
  );
}
