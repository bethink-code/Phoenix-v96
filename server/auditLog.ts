import { db } from "./db";
import { auditLogs } from "../shared/schema";

export interface AuditEntry {
  userId?: string | null;
  tenantId?: string | null;
  action: string;
  resourceType?: string;
  resourceId?: string;
  outcome: "success" | "failure" | "denied";
  detail?: unknown;
  ipAddress?: string;
  userAgent?: string;
}

// Fire-and-forget audit logger. Never throws — audit failures must not
// break the request path, but they are logged to stderr for visibility.
export function audit(entry: AuditEntry): void {
  db.insert(auditLogs)
    .values({
      userId: entry.userId ?? null,
      tenantId: entry.tenantId ?? null,
      action: entry.action,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId,
      outcome: entry.outcome,
      detail: (entry.detail as object) ?? null,
      ipAddress: entry.ipAddress,
      userAgent: entry.userAgent,
    })
    .catch((err) => {
      console.error("[audit] failed to write log entry", err, entry.action);
    });
}
