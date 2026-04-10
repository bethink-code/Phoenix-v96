// PRD §3.3 tiered alerts. Phase 1 channel: Telegram Bot API (direct HTTPS
// POST, no library). PRD §3.5's Bethink WhatsApp Business account remains
// the long-term target; this module can grow a second dispatcher later.
//
// Silence is the default. This module only sends when something needs
// human awareness — drawdown breach, emergency exit, exchange connectivity
// lost, bot halted unexpectedly, API key invalid.

export type AlertTier = "urgent" | "digest";

export interface Alert {
  tenantId: string;
  tier: AlertTier;
  title: string;
  body: string;
}

const telegramConfigured = Boolean(
  process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID
);

export async function sendUrgentAlert(alert: Omit<Alert, "tier">): Promise<void> {
  return send({ ...alert, tier: "urgent" });
}

export async function sendDigest(alert: Omit<Alert, "tier">): Promise<void> {
  return send({ ...alert, tier: "digest" });
}

async function send(alert: Alert): Promise<void> {
  if (!telegramConfigured) {
    console.log(
      `[alerts:stub] ${alert.tier} ${alert.tenantId}: ${alert.title} — ${alert.body}`
    );
    return;
  }

  const icon = alert.tier === "urgent" ? "🚨" : "📝";
  const text = `${icon} *${escape(alert.title)}*\n${escape(alert.body)}`;

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: process.env.TELEGRAM_CHAT_ID,
          text,
          parse_mode: "Markdown",
          disable_notification: alert.tier === "digest",
        }),
      }
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[alerts] telegram ${res.status}: ${body}`);
    }
  } catch (err) {
    console.error("[alerts] telegram request failed", err);
  }
}

// Dead-man's-switch external ping. Healthchecks.io or equivalent. If this
// stops arriving, THEY alert the operator — the only way to detect a hard
// server crash.
export async function pingHealthcheck(): Promise<void> {
  const url = process.env.HEALTHCHECK_URL;
  if (!url) return;
  try {
    await fetch(url, { method: "POST" });
  } catch (err) {
    // Don't let a monitoring hiccup break the bot tick
    console.error("[healthcheck] ping failed", err);
  }
}

// Telegram markdown escape — only the characters that break parse_mode.
function escape(s: string): string {
  return s.replace(/([_*`[\]])/g, "\\$1");
}

// Back-compat alias — emergencyExit.ts still imports sendDailyDigest
export const sendDailyDigest = (tenantId: string, summary: string) =>
  sendDigest({ tenantId, title: "Daily digest", body: summary });
