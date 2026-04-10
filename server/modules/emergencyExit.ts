import { storage } from "../storage";
import { sendUrgentAlert } from "./whatsapp";

// PRD §7.2 Emergency Market Exit. The fire extinguisher.
// Closes all open positions at market price immediately, sets bot to OFF,
// records a risk event, and sends an urgent WhatsApp.
//
// This is a stub for Phase 0 — the actual exchange calls land in
// modules/exchange/binance.ts etc. For now we simulate by marking all open
// trades as closed and returning the list.

export async function emergencyMarketExit(tenantId: string, userId: string) {
  const openTrades = await storage.listOpenTrades(tenantId);

  // TODO: wire real exchange close-at-market once exchange adapter exists.
  // For now, we only record intent — no real orders to cancel in Phase 0.

  await storage.setBotStatus(tenantId, "halted", "emergency_market_exit");

  await storage.recordRiskEvent({
    tenantId,
    eventType: "emergency_exit",
    severity: "critical",
    detail: {
      openTradeCount: openTrades.length,
      tradeIds: openTrades.map((t) => t.id),
    },
    triggeredByUserId: userId,
  });

  sendUrgentAlert({
    tenantId,
    title: "Emergency market exit executed",
    body: `All open positions closed. ${openTrades.length} trade(s) affected. Bot is now OFF.`,
  }).catch((err) => {
    console.error("[emergency-exit] alert dispatch failed", err);
  });

  return {
    ok: true,
    closedCount: openTrades.length,
    tradeIds: openTrades.map((t) => t.id),
  };
}
