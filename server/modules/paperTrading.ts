// PRD Rule 4: Testnet first. Paper trading mode is the hard safety gate
// between the bot and real money. Every execution path checks this before
// sending anything to a live exchange.

export function isPaperTradingMode(): boolean {
  // Global env flag — can be overridden per tenant via the tenants.paperTradingMode column.
  return process.env.PAPER_TRADING_MODE !== "false";
}

export function assertLiveTradingAllowed(tenantPaperMode: boolean) {
  if (isPaperTradingMode()) {
    throw new Error("global_paper_trading_mode_active");
  }
  if (tenantPaperMode) {
    throw new Error("tenant_paper_trading_mode_active");
  }
}
