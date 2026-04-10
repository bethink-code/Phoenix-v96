import { db, pool } from "../db";
import { eq } from "drizzle-orm";
import {
  tenants,
  tenantConfigs,
  trades,
  botDecisions,
  marketPairs,
  type Tenant,
  type TenantConfig,
  type Trade,
} from "../../shared/schema";
import { storage } from "../storage";
import { sendUrgentAlert, pingHealthcheck } from "./alerts";
import { getRegimeProfile, entryPermitted } from "./regimeEngine";
import {
  temporalFilterOpen,
  DEFAULT_TEMPORAL_RULES,
  type TemporalRules,
} from "./temporalFilter";
import { assessTrade, dailyPnl, weeklyPnl } from "./riskManager";
import { getBinance } from "./exchange/binance";
import {
  identifyLevels,
  detectLatestSweep,
  generateProposal,
  detectRegime,
  type Candle,
} from "./strategy";

// PRD §4 decision loop. Runs per tenant on an interval.
//
// Phase 1 scope:
//   - In-process per-tenant tick (not a child process yet — that's §12.4
//     Phase 2, when we have more than one or two live tenants).
//   - Paper trading only. Never sends a real order regardless of the
//     PAPER_TRADING_MODE flag on the tenant.
//   - Writes every decision (enter / skip / halt) to bot_decisions.
//
// The loop runs on a configurable interval per timeframe. For 15m candles
// we tick every 60s — plenty of headroom to see a fresh closed bar without
// hammering the exchange.

const TICK_MS = 60_000;
const CANDLES_LOOKBACK = 300; // ~3 days of 15m candles
const DEFAULT_TIMEFRAME = "15m" as const;

interface TickContext {
  tenant: Tenant;
  config: TenantConfig;
  symbol: string;
  now: Date;
}

let running = false;
let timer: NodeJS.Timeout | null = null;

export function startBotRunner() {
  if (running) return;
  running = true;
  console.log("[bot] runner started");
  timer = setInterval(tickAllTenants, TICK_MS);
  // Fire once immediately on startup so the first decision lands fast
  tickAllTenants().catch((err) => console.error("[bot] initial tick failed", err));
}

export function stopBotRunner() {
  if (timer) clearInterval(timer);
  timer = null;
  running = false;
  console.log("[bot] runner stopped");
}

let lastSymbolRefreshAt = 0;

async function tickAllTenants() {
  try {
    // Refresh the cached Binance symbols list at most once an hour. Done
    // here on Railway because Vercel serverless can't reliably fetch
    // exchangeInfo (1MB+ response, 10s function timeout).
    if (Date.now() - lastSymbolRefreshAt > 60 * 60 * 1000) {
      try {
        const symbols = await getBinance().fetchSymbols();
        await storage.writeCachedSymbols("binance", symbols);
        lastSymbolRefreshAt = Date.now();
        console.log(`[bot] cached ${symbols.length} binance symbols`);
      } catch (err) {
        console.error("[bot] symbol refresh failed", err);
      }
    }

    const rows = await db
      .select()
      .from(tenants)
      .where(eq(tenants.botStatus, "active"));
    for (const t of rows) {
      try {
        await tickTenant(t);
      } catch (err) {
        console.error(`[bot] tick failed for tenant ${t.id}`, err);
      }
    }
    // Ping external dead-man's-switch on every successful loop iteration.
    // If this stops arriving, the watchdog alerts the operator.
    await pingHealthcheck();
  } catch (err) {
    console.error("[bot] tickAllTenants failed", err);
  }
}

async function tickTenant(tenant: Tenant) {
  // Every successful tick — whether it opens a trade or not — stamps the
  // tenant row so the UI can show a live heartbeat and any external caller
  // can tell the bot is still breathing.
  await storage.touchTenantTick(tenant.id);

  // Fetch tenant config
  const [config] = await db
    .select()
    .from(tenantConfigs)
    .where(eq(tenantConfigs.tenantId, tenant.id));
  if (!config) return;

  // Tenant must have a selected pair
  if (!tenant.activePairId) {
    return logDecision(tenant.id, "skip", tenant.activeRegime, {
      reason: "no_active_pair",
    });
  }
  const [pair] = await db
    .select()
    .from(marketPairs)
    .where(eq(marketPairs.id, tenant.activePairId));
  if (!pair || !pair.enabled) {
    return logDecision(tenant.id, "skip", tenant.activeRegime, {
      reason: "pair_unavailable",
    });
  }

  const symbol = `${pair.baseAsset}${pair.quoteAsset}`;
  const ctx: TickContext = { tenant, config, symbol, now: new Date() };

  // Temporal filter — is the bot allowed to look for entries right now?
  const rules = (config.temporalRules as TemporalRules | null) ?? DEFAULT_TEMPORAL_RULES;
  const gate = temporalFilterOpen(rules, ctx.now);
  if (!gate.open) {
    return logDecision(tenant.id, "skip", tenant.activeRegime, {
      reason: "temporal_filter_closed",
      gate: gate.reason,
    });
  }

  // Fetch candles from exchange. Wrap in failure-counting — PRD §3.4:
  // "Exchange API connectivity lost while positions are open" is an urgent
  // alert trigger. Three consecutive failures halts the tenant.
  const binance = getBinance();
  let candles;
  try {
    candles = await binance.fetchCandles({
      symbol,
      timeframe: DEFAULT_TIMEFRAME,
      limit: CANDLES_LOOKBACK,
    });
    // Success — reset failure counter if it was non-zero
    if (tenant.consecutiveExchangeFailures > 0) {
      await storage.resetExchangeFailures(tenant.id);
    }
  } catch (err) {
    const message = (err as Error).message ?? "unknown";
    const failures = await storage.incrementExchangeFailures(tenant.id);
    console.error(`[bot] exchange fetch failed (${failures}): ${message}`);
    await storage.recordRiskEvent({
      tenantId: tenant.id,
      eventType: "exchange_fetch_failed",
      severity: failures >= 3 ? "critical" : "warn",
      detail: { error: message, consecutiveFailures: failures, symbol },
    });
    if (failures >= 3) {
      await storage.setBotStatus(
        tenant.id,
        "halted",
        `exchange_connectivity_lost: ${message}`
      );
      sendUrgentAlert({
        tenantId: tenant.id,
        title: "Bot halted — exchange connectivity lost",
        body: `Three consecutive failures fetching ${symbol} from Binance. Last error: ${message}. Bot is now halted.`,
      }).catch(() => {});
    } else {
      sendUrgentAlert({
        tenantId: tenant.id,
        title: "Exchange fetch failed",
        body: `Failure ${failures}/3 for ${symbol}. Last error: ${message}.`,
      }).catch(() => {});
    }
    await logDecision(tenant.id, "skip", tenant.activeRegime, {
      reason: "exchange_fetch_failed",
      error: message,
      consecutiveFailures: failures,
    });
    return;
  }
  if (candles.length < 50) {
    return logDecision(tenant.id, "skip", tenant.activeRegime, {
      reason: "insufficient_candles",
      count: candles.length,
    });
  }

  // Detect the market regime from candles and store the suggestion. This
  // runs every tick regardless of current regime or autopilot state so the
  // UI can always show the bot's current read — even when the tenant is
  // sitting in NO TRADE waiting for the bot to pick something else.
  const suggestion = detectRegime(candles);
  await storage.writeRegimeSuggestion({
    tenantId: tenant.id,
    regime: suggestion.regime,
    confidence: suggestion.confidence,
    rationale: suggestion.rationale,
    signals: suggestion.signals,
  });

  // Resolve any open paper trades against new candles BEFORE evaluating a
  // new entry. If stop or target was hit, close the trade and log.
  await resolveOpenTrades(tenant.id, candles, symbol);

  // Autopilot: if the tenant lets the bot drive regime, and confidence is
  // high enough, and there are no open positions (don't swap regimes
  // mid-trade), apply the suggestion. This runs BEFORE the regime gate so
  // that a tenant stuck in NO TRADE can be promoted out of it by autopilot.
  if (
    tenant.autopilotRegime &&
    suggestion.confidence >= 0.6 &&
    suggestion.regime !== tenant.activeRegime
  ) {
    const openCount = (await storage.listOpenTrades(tenant.id)).length;
    if (openCount === 0) {
      const change = await storage.setTenantRegime(
        tenant.id,
        suggestion.regime,
        tenant.userId,
        "autopilot"
      );
      if (!change.noop) {
        await logDecision(tenant.id, "skip", suggestion.regime, {
          reason: "regime_autopilot_change",
          fromRegime: change.fromRegime,
          toRegime: suggestion.regime,
          confidence: suggestion.confidence,
          rationale: suggestion.rationale,
        });
        tenant.activeRegime = suggestion.regime;
      }
    }
  }

  // Regime gate — NO TRADE suppresses entries. After autopilot has had a
  // chance to promote out of NO TRADE above.
  if (!entryPermitted(tenant.activeRegime)) {
    return logDecision(tenant.id, "skip", tenant.activeRegime, {
      reason: "regime_suppressed",
    });
  }

  // Level identification + sweep detection + proposal
  const levels = identifyLevels(candles);
  const sweep = detectLatestSweep(candles, levels);
  const proposal = generateProposal(sweep, candles, levels, tenant.activeRegime);

  if (!proposal) {
    return logDecision(tenant.id, "skip", tenant.activeRegime, {
      reason: sweep ? "no_valid_proposal" : "no_sweep",
      levelCount: levels.length,
    });
  }

  // Risk manager — gate the proposal against drawdown, concurrency, R:R
  const allTrades = await db
    .select()
    .from(trades)
    .where(eq(trades.tenantId, tenant.id));
  const openTrades = allTrades.filter((t: Trade) => t.status === "open");

  // Dedupe: don't open a new trade against a level that already has an
  // open trade. Same sweep shouldn't produce multiple entries.
  const alreadyOnLevel = openTrades.some(
    (t) => (t.levelContext as { levelId?: string } | null)?.levelId === proposal.levelId
  );
  if (alreadyOnLevel) {
    return logDecision(tenant.id, "skip", tenant.activeRegime, {
      reason: "duplicate_level",
      levelId: proposal.levelId,
    });
  }
  const closedStats = allTrades.map((t: Trade) => ({
    realisedPnl: t.realisedPnl != null ? Number(t.realisedPnl) : null,
    closedAt: t.closedAt,
    isPaper: t.isPaper,
  }));

  // Capital for paper trading is configurable per tenant. Live trading
  // (Phase 2) will pull this from the exchange balance instead.
  const capital = Number(config.paperStartingCapital ?? 10_000);

  const decision = assessTrade({
    capital,
    riskPercentPerTrade: Number(config.riskPercentPerTrade),
    entryPrice: proposal.entryPrice,
    stopPrice: proposal.stopPrice,
    targetPrice: proposal.targetPrice,
    regime: tenant.activeRegime,
    minRiskRewardRatio: Number(config.minRiskRewardRatio),
    openPositionCount: openTrades.length,
    maxConcurrentPositions: config.maxConcurrentPositions,
    dailyPnlPct: (dailyPnl(closedStats) / capital) * 100,
    weeklyPnlPct: (weeklyPnl(closedStats) / capital) * 100,
    dailyDrawdownLimitPct: Number(config.dailyDrawdownLimitPct),
    weeklyDrawdownLimitPct: Number(config.weeklyDrawdownLimitPct),
    minLevelRank: config.minLevelRank,
    candidateLevelRank: sweep!.level.rank,
    pairMinOrderSize: Number(pair.minOrderSize),
  });

  if (!decision.approved) {
    return logDecision(tenant.id, "skip", tenant.activeRegime, {
      reason: "risk_rejected",
      detail: decision.reason,
      riskDetail: decision.detail,
      proposal,
    });
  }

  // Open a paper trade. Phase 1 is paper-only even when tenant.paperTradingMode is false —
  // we don't emit real orders until exchange signed endpoints are in and the
  // operator flips the global PAPER_TRADING_MODE flag.
  const [opened] = await db
    .insert(trades)
    .values({
      tenantId: tenant.id,
      pairId: tenant.activePairId,
      side: proposal.side,
      setupMode: proposal.setupMode,
      regimeAtEntry: tenant.activeRegime,
      entryPrice: String(proposal.entryPrice),
      stopPrice: String(proposal.stopPrice),
      targetPrice: String(proposal.targetPrice),
      size: String(decision.positionSize),
      riskAmount: String(decision.riskAmount),
      plannedRR: String(decision.plannedRR),
      status: "open",
      isPaper: true,
      levelContext: {
        levelId: proposal.levelId,
        levelRank: sweep!.level.rank,
        levelType: sweep!.level.type,
      },
    })
    .returning();

  await logDecision(tenant.id, "entry", tenant.activeRegime, {
    tradeId: opened.id,
    proposal,
    decision,
    reasoning: proposal.reasoning,
  });
}

// Walks open trades forward through every candle that occurred since the
// trade was opened, checks stop/target hits, and closes on first hit.
// Pessimistic same-bar resolution: if a bar touches both stop and target,
// assume stop was hit first (matches backtest engine).
//
// As a second pass it also checks the live ticker price, so trades can be
// resolved before the next candle closes. This is the intra-bar safety
// net — without it, a 15m TF bot can stay past stop for up to 15 minutes.
async function resolveOpenTrades(tenantId: string, candles: Candle[], symbol: string) {
  const open = await storage.listOpenTrades(tenantId);
  if (open.length === 0) return;

  // Fetch the live mark price once for the ticker check
  let livePrice: number | null = null;
  try {
    livePrice = await getBinance().fetchPrice(symbol);
  } catch (err) {
    console.error("[bot] ticker fetch for exit check failed", err);
  }

  for (const t of open) {
    const entry = Number(t.entryPrice);
    const stop = Number(t.stopPrice);
    const target = Number(t.targetPrice);
    const size = Number(t.size);
    const openedAt = new Date(t.openedAt).getTime();

    // Look at bars since the trade opened (exclusive of the entry bar).
    const window = candles.filter((c) => c.openTime >= openedAt);
    let hit: { exitPrice: number; reason: "target" | "stop" } | null = null;
    for (const bar of window) {
      if (t.side === "long") {
        if (bar.low <= stop) {
          hit = { exitPrice: stop, reason: "stop" };
          break;
        }
        if (bar.high >= target) {
          hit = { exitPrice: target, reason: "target" };
          break;
        }
      } else {
        if (bar.high >= stop) {
          hit = { exitPrice: stop, reason: "stop" };
          break;
        }
        if (bar.low <= target) {
          hit = { exitPrice: target, reason: "target" };
          break;
        }
      }
    }

    // Intra-bar safety net: if no closed bar triggered an exit, check the
    // current ticker price against stop / target. Stop wins ties.
    if (!hit && livePrice != null) {
      if (t.side === "long") {
        if (livePrice <= stop) hit = { exitPrice: stop, reason: "stop" };
        else if (livePrice >= target) hit = { exitPrice: target, reason: "target" };
      } else {
        if (livePrice >= stop) hit = { exitPrice: stop, reason: "stop" };
        else if (livePrice <= target) hit = { exitPrice: target, reason: "target" };
      }
    }

    if (!hit) continue;

    const realisedPnl =
      t.side === "long"
        ? (hit.exitPrice - entry) * size
        : (entry - hit.exitPrice) * size;

    await storage.closeTrade({
      tradeId: t.id,
      exitPrice: hit.exitPrice,
      realisedPnl,
      reason: hit.reason,
    });

    await logDecision(tenantId, "exit", t.regimeAtEntry, {
      tradeId: t.id,
      reason: hit.reason,
      exitPrice: hit.exitPrice,
      realisedPnl,
    });
  }
}

async function logDecision(
  tenantId: string,
  decisionType: "entry" | "exit" | "skip" | "halt",
  regime: Tenant["activeRegime"],
  detail: Record<string, unknown>
) {
  try {
    await db.insert(botDecisions).values({
      tenantId,
      decisionType,
      regime,
      inputs: {},
      outputs: detail,
      reasoning: typeof detail.reason === "string" ? detail.reason : decisionType,
    });
  } catch (err) {
    console.error("[bot] logDecision failed", err);
  }
}

// Graceful shutdown
process.on("SIGINT", () => {
  stopBotRunner();
  pool.end().finally(() => process.exit(0));
});
process.on("SIGTERM", () => {
  stopBotRunner();
  pool.end().finally(() => process.exit(0));
});
