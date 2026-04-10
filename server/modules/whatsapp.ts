// PRD §3.5 WhatsApp Business API notifications. Three tiers:
//   silence — normal operation, no message
//   digest  — one message per day
//   urgent  — immediate, bypasses batching
//
// Phase 0 stub. Real implementation wires Twilio's WhatsApp Business API
// wrapper and pre-approved templates.

export interface Alert {
  tenantId: string;
  title: string;
  body: string;
}

const twilioConfigured = Boolean(
  process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_WHATSAPP_FROM
);

export async function sendUrgentAlert(alert: Alert): Promise<void> {
  if (!twilioConfigured) {
    console.log(
      `[whatsapp:stub] urgent alert for tenant ${alert.tenantId}: ${alert.title} — ${alert.body}`
    );
    return;
  }
  // TODO: fetch tenant WhatsApp number, validate opt-in, call Twilio client.
  console.log(`[whatsapp] TODO send urgent to tenant ${alert.tenantId}`);
}

export async function sendDailyDigest(tenantId: string, summary: string) {
  if (!twilioConfigured) {
    console.log(`[whatsapp:stub] daily digest ${tenantId}: ${summary}`);
    return;
  }
  console.log(`[whatsapp] TODO send digest to tenant ${tenantId}`);
}
