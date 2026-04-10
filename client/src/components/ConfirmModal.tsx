import { Button } from "@/components/ui/button";

// Reusable deliberate-action modal. PRD §3.2 + §5.6 — state changes
// must be explicit, with plain-language consequences, not accidental.

interface ConfirmModalProps {
  open: boolean;
  title: string;
  description: string;
  consequences?: string[];
  confirmLabel?: string;
  confirmVariant?: "default" | "destructive";
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  open,
  title,
  description,
  consequences,
  confirmLabel = "Confirm",
  confirmVariant = "default",
  pending,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="w-full max-w-lg rounded-lg border border-border bg-card p-6 shadow-xl">
        <h2 className="text-xl font-semibold">{title}</h2>
        <p className="mt-3 text-sm text-muted-foreground">{description}</p>
        {consequences && consequences.length > 0 && (
          <ul className="mt-4 space-y-1.5 border-l-2 border-primary/40 pl-4 text-sm">
            {consequences.map((c, i) => (
              <li key={i} className="text-foreground">{c}</li>
            ))}
          </ul>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={pending}>Cancel</Button>
          <Button variant={confirmVariant} onClick={onConfirm} disabled={pending}>
            {pending ? "Working…" : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
