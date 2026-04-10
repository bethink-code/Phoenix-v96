import { db } from "../db";
import { eq } from "drizzle-orm";
import { tenants, marketPairs } from "../../shared/schema";
import { storage } from "../storage";
import { getBinance } from "./exchange/binance";
import { sendUrgentAlert } from "./whatsapp";

// PRD §7.2 Emergency Market Exit. The fire extinguisher.
// Closes all open positions immediately at the current mark price, sets the
// bot to halted, records a risk event, sends an urgent WhatsApp alert.
//
// Paper mode: we compute realised P&L against the live ticker price and
// close the trades in the DB. Live mode (Phase 2): will send real market
// orders via the signed exchange endpoint.

export async function emergencyMarketExit(tenantId: string, userId: string) {
  const openTrades = await storage.listOpenTrades(tenantId);

  // Resolve the tenant's active pair so we can fetch a mark price.
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
  let markPrice: number | null = null;
  if (tenant?.activePairId) {
    const [pair] = await db
      .select()
      .from(marketPairs)
      .where(eq(marketPairs.id, tenant.activePairId));
    if (pair) {
      const symbol = `${pair.baseAsset}${pair.quoteAsset}`;
      try {
        markPrice = await getBinance().fetchPrice(symbol);
      } catch (err) {
        console.error("[emergency-exit] failed to fetch mark price", err);
      }
    }
  }

  // Close each open trade at mark price. If we couldn't fetch a price, fall
  // back to the entry price (zero realised P&L) — better than leaving them
  // dangling.
  const results: Array<{ tradeId: string; exitPrice: number; realisedPnl: number }> = [];
  for (const t of openTrades) {
    const entry = Number(t.entryPrice);
    const size = Number(t.size);
    const exitPrice = markPrice ?? entry;
    const realisedPnl =
      t.side === "long" ? (exitPrice - entry) * size : (entry - exitPrice) * size;
    await storage.closeTrade({
      tradeId: t.id,
      exitPrice,
      realisedPnl,
      reason: "emergency",
    });
    results.push({ tradeId: t.id, exitPrice, realisedPnl });
  }

  await storage.setBotStatus(tenantId, "halted", "emergency_market_exit");

  await storage.recordRiskEvent({
    tenantId,
    eventType: "emergency_exit",
    severity: "critical",
    detail: {
      openTradeCount: openTrades.length,
      markPrice,
      results,
    },
    triggeredByUserId: userId,
  });

  sendUrgentAlert({
    tenantId,
    title: "Emergency market exit executed",
    body: `${openTrades.length} trade(s) closed at ${markPrice ?? "entry"}. Bot is now halted.`,
  }).catch((err) => {
    console.error("[emergency-exit] alert dispatch failed", err);
  });

  return {
    ok: true,
    closedCount: openTrades.length,
    markPrice,
    results,
  };
}
