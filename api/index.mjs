var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// server/api.ts
import express from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";

// server/auth.ts
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";

// server/db.ts
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";

// shared/schema.ts
var schema_exports = {};
__export(schema_exports, {
  accessRequestStatusEnum: () => accessRequestStatusEnum,
  accessRequests: () => accessRequests,
  auditLogs: () => auditLogs,
  autoresearchIterations: () => autoresearchIterations,
  autoresearchSessions: () => autoresearchSessions,
  binanceFundingRates: () => binanceFundingRates,
  binanceLiquidations: () => binanceLiquidations,
  binanceLongShortRatio: () => binanceLongShortRatio,
  binanceOi: () => binanceOi,
  botDecisions: () => botDecisions,
  botStatusEnum: () => botStatusEnum,
  cachedSymbols: () => cachedSymbols,
  exchangeKeys: () => exchangeKeys,
  experimentRuns: () => experimentRuns,
  experiments: () => experiments,
  hyblockCaptures: () => hyblockCaptures,
  hyblockLiqLevels: () => hyblockLiqLevels,
  hyblockOhlc: () => hyblockOhlc,
  hyblockcaptureEnum: () => hyblockcaptureEnum,
  insertAccessRequestSchema: () => insertAccessRequestSchema,
  insertInviteSchema: () => insertInviteSchema,
  insertMarketPairSchema: () => insertMarketPairSchema,
  insertUserSchema: () => insertUserSchema,
  invitedUsers: () => invitedUsers,
  llmUsage: () => llmUsage,
  marketPairs: () => marketPairs,
  regimeChangeSchema: () => regimeChangeSchema,
  regimeChanges: () => regimeChanges,
  regimeEnum: () => regimeEnum,
  riskEvents: () => riskEvents,
  sessions: () => sessions,
  setupModeEnum: () => setupModeEnum,
  tenantConfigs: () => tenantConfigs,
  tenants: () => tenants,
  tenantsRelations: () => tenantsRelations,
  tradeSideEnum: () => tradeSideEnum,
  tradeStatusEnum: () => tradeStatusEnum,
  trades: () => trades,
  users: () => users,
  usersRelations: () => usersRelations,
  zennyDeathReasonEnum: () => zennyDeathReasonEnum,
  zennyLevelSourceEnum: () => zennyLevelSourceEnum,
  zennyLevels: () => zennyLevels,
  zennyPaperAccount: () => zennyPaperAccount,
  zennyPaperPositions: () => zennyPaperPositions,
  zennyPaperTickLog: () => zennyPaperTickLog,
  zennyPoolStatusEnum: () => zennyPoolStatusEnum,
  zennyPoolTypeEnum: () => zennyPoolTypeEnum,
  zennyPools: () => zennyPools,
  zennyTimeframeEnum: () => zennyTimeframeEnum
});
import {
  pgTable,
  text,
  varchar,
  timestamp,
  boolean,
  integer,
  numeric,
  jsonb,
  uuid,
  index,
  pgEnum
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
var regimeEnum = pgEnum("regime", [
  "no_trade",
  "ranging",
  "trending",
  "breakout",
  "high_volatility",
  "low_liquidity",
  "accumulation_distribution"
]);
var botStatusEnum = pgEnum("bot_status", [
  "off",
  "active",
  "paused",
  "halted",
  "error"
]);
var tradeSideEnum = pgEnum("trade_side", ["long", "short"]);
var tradeStatusEnum = pgEnum("trade_status", [
  "pending",
  "open",
  "partially_closed",
  "closed",
  "cancelled",
  "rejected"
]);
var setupModeEnum = pgEnum("setup_mode", ["mode_a", "mode_b"]);
var accessRequestStatusEnum = pgEnum("access_request_status", [
  "pending",
  "approved",
  "declined"
]);
var sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull()
  },
  (t) => [index("sessions_expire_idx").on(t.expire)]
);
var users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  firstName: varchar("first_name", { length: 100 }),
  lastName: varchar("last_name", { length: 100 }),
  profileImageUrl: text("profile_image_url"),
  isAdmin: boolean("is_admin").notNull().default(false),
  isSuspended: boolean("is_suspended").notNull().default(false),
  termsAcceptedAt: timestamp("terms_accepted_at"),
  whatsappNumber: varchar("whatsapp_number", { length: 32 }),
  whatsappOptIn: boolean("whatsapp_opt_in").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  lastLoginAt: timestamp("last_login_at")
});
var invitedUsers = pgTable("invited_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  invitedByUserId: uuid("invited_by_user_id").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow()
});
var accessRequests = pgTable("access_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 200 }).notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  cell: varchar("cell", { length: 32 }),
  reason: text("reason"),
  status: accessRequestStatusEnum("status").notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  decidedAt: timestamp("decided_at"),
  decidedByUserId: uuid("decided_by_user_id").references(() => users.id)
});
var auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id),
    tenantId: uuid("tenant_id"),
    action: varchar("action", { length: 100 }).notNull(),
    resourceType: varchar("resource_type", { length: 100 }),
    resourceId: varchar("resource_id", { length: 255 }),
    outcome: varchar("outcome", { length: 32 }).notNull(),
    detail: jsonb("detail"),
    ipAddress: varchar("ip_address", { length: 64 }),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at").notNull().defaultNow()
  },
  (t) => [
    index("audit_logs_user_idx").on(t.userId),
    index("audit_logs_tenant_idx").on(t.tenantId),
    index("audit_logs_created_idx").on(t.createdAt)
  ]
);
var tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  name: varchar("name", { length: 200 }).notNull(),
  botStatus: botStatusEnum("bot_status").notNull().default("off"),
  activeRegime: regimeEnum("active_regime").notNull().default("no_trade"),
  activeRegimeSource: varchar("active_regime_source", { length: 16 }).notNull().default("manual"),
  // 'manual' | 'autopilot'
  activePairId: uuid("active_pair_id"),
  paperTradingMode: boolean("paper_trading_mode").notNull().default(true),
  // Autopilot: when true, the bot writes its own regime suggestion into
  // active_regime on every tick (when confidence is high enough and no
  // open positions). Manual clicks still win for that tick.
  autopilotRegime: boolean("autopilot_regime").notNull().default(true),
  suggestedRegime: regimeEnum("suggested_regime"),
  suggestedRegimeConfidence: numeric("suggested_regime_confidence", { precision: 4, scale: 3 }),
  suggestedRegimeAt: timestamp("suggested_regime_at"),
  suggestedRegimeRationale: jsonb("suggested_regime_rationale"),
  suggestedRegimeSignals: jsonb("suggested_regime_signals"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  lastHaltedAt: timestamp("last_halted_at"),
  lastHaltReason: text("last_halt_reason"),
  lastTickAt: timestamp("last_tick_at"),
  consecutiveExchangeFailures: integer("consecutive_exchange_failures").notNull().default(0)
});
var tenantConfigs = pgTable("tenant_configs", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().unique().references(() => tenants.id, { onDelete: "cascade" }),
  paperStartingCapital: numeric("paper_starting_capital", { precision: 20, scale: 2 }).notNull().default("10000.00"),
  // Portfolio-aware risk preset. 'auto' lets the engine pick a tier based
  // on capital and reapply on capital changes. 'manual' means the user has
  // hand-tuned the parameters and the engine should leave them alone.
  portfolioTier: varchar("portfolio_tier", { length: 16 }).notNull().default("auto"),
  riskPercentPerTrade: numeric("risk_percent_per_trade", { precision: 5, scale: 3 }).notNull().default("1.000"),
  maxConcurrentPositions: integer("max_concurrent_positions").notNull().default(2),
  dailyDrawdownLimitPct: numeric("daily_drawdown_limit_pct", { precision: 5, scale: 2 }).notNull().default("3.00"),
  weeklyDrawdownLimitPct: numeric("weekly_drawdown_limit_pct", { precision: 5, scale: 2 }).notNull().default("6.00"),
  minRiskRewardRatio: numeric("min_risk_reward_ratio", { precision: 4, scale: 2 }).notNull().default("2.00"),
  minLevelRank: integer("min_level_rank").notNull().default(2),
  // Strategy-internal params that USED to be hardcoded constants in
  // levels.ts/sweeps.ts/entries.ts. Stored as a jsonb blob so the
  // schema doesn't need a column-per-param. Falls back to the engine
  // defaults when keys are missing — see botRunner for the merge.
  // Shape mirrors ProposedParams in autoresearch/prompt.ts:
  //   { swingLookback, equalTolerancePct, mergeTolerancePct,
  //     minTouches, minWickProtrusionPct, targetDistanceMultiplier }
  // Written by the autoresearch "install this config" button (which
  // writes all 9 params atomically — the 3 risk params go to their
  // existing columns above, the 6 strategy-internal ones go here).
  strategyParams: jsonb("strategy_params").notNull().default({}),
  // Candle timeframe the bot evaluates entries against. Defaults to 15m so
  // existing tenants are unchanged. Operator-controlled via Settings.
  // Strategy logic itself is timeframe-agnostic — only the candle fetch
  // changes. Valid values match Binance's supported intervals.
  tradingTimeframe: varchar("trading_timeframe", { length: 8 }).notNull().default("15m"),
  temporalRules: jsonb("temporal_rules"),
  // session/day-of-week rules
  regimeProfiles: jsonb("regime_profiles"),
  // per-regime overrides
  updatedAt: timestamp("updated_at").notNull().defaultNow()
});
var exchangeKeys = pgTable("exchange_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  exchange: varchar("exchange", { length: 32 }).notNull(),
  // binance, bybit
  apiKeyCiphertext: text("api_key_ciphertext").notNull(),
  apiKeyIv: varchar("api_key_iv", { length: 64 }).notNull(),
  apiKeyAuthTag: varchar("api_key_auth_tag", { length: 64 }).notNull(),
  apiSecretCiphertext: text("api_secret_ciphertext").notNull(),
  apiSecretIv: varchar("api_secret_iv", { length: 64 }).notNull(),
  apiSecretAuthTag: varchar("api_secret_auth_tag", { length: 64 }).notNull(),
  permissionsValidatedAt: timestamp("permissions_validated_at"),
  lastValidationError: text("last_validation_error"),
  createdAt: timestamp("created_at").notNull().defaultNow()
});
var marketPairs = pgTable("market_pairs", {
  id: uuid("id").primaryKey().defaultRandom(),
  baseAsset: varchar("base_asset", { length: 16 }).notNull(),
  quoteAsset: varchar("quote_asset", { length: 16 }).notNull(),
  displayName: varchar("display_name", { length: 100 }).notNull(),
  supportedExchanges: jsonb("supported_exchanges").notNull(),
  // string[]
  enabled: boolean("enabled").notNull().default(true),
  minOrderSize: numeric("min_order_size", { precision: 20, scale: 8 }).notNull(),
  defaultRiskPct: numeric("default_risk_pct", { precision: 5, scale: 3 }).notNull().default("1.000"),
  defaultMaxPositions: integer("default_max_positions").notNull().default(2),
  defaultMinRR: numeric("default_min_rr", { precision: 4, scale: 2 }).notNull().default("2.00"),
  liquidityRating: varchar("liquidity_rating", { length: 16 }).notNull().default("medium"),
  // low/medium/high
  adminNotes: text("admin_notes"),
  tenantVisibleNotes: text("tenant_visible_notes"),
  addedByUserId: uuid("added_by_user_id").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
});
var trades = pgTable(
  "trades",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    pairId: uuid("pair_id").references(() => marketPairs.id),
    side: tradeSideEnum("side").notNull(),
    setupMode: setupModeEnum("setup_mode").notNull(),
    regimeAtEntry: regimeEnum("regime_at_entry").notNull(),
    entryPrice: numeric("entry_price", { precision: 20, scale: 8 }).notNull(),
    stopPrice: numeric("stop_price", { precision: 20, scale: 8 }).notNull(),
    targetPrice: numeric("target_price", { precision: 20, scale: 8 }).notNull(),
    size: numeric("size", { precision: 20, scale: 8 }).notNull(),
    riskAmount: numeric("risk_amount", { precision: 20, scale: 8 }).notNull(),
    plannedRR: numeric("planned_rr", { precision: 6, scale: 2 }).notNull(),
    status: tradeStatusEnum("status").notNull().default("pending"),
    isPaper: boolean("is_paper").notNull(),
    exitPrice: numeric("exit_price", { precision: 20, scale: 8 }),
    realisedPnl: numeric("realised_pnl", { precision: 20, scale: 8 }),
    openedAt: timestamp("opened_at").notNull().defaultNow(),
    closedAt: timestamp("closed_at"),
    closeReason: varchar("close_reason", { length: 64 }),
    levelContext: jsonb("level_context")
  },
  (t) => [
    index("trades_tenant_idx").on(t.tenantId),
    index("trades_opened_idx").on(t.openedAt)
  ]
);
var botDecisions = pgTable(
  "bot_decisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    decisionType: varchar("decision_type", { length: 64 }).notNull(),
    // entry, exit, skip, halt, ...
    regime: regimeEnum("regime").notNull(),
    tradeId: uuid("trade_id").references(() => trades.id),
    inputs: jsonb("inputs").notNull(),
    outputs: jsonb("outputs").notNull(),
    reasoning: text("reasoning"),
    createdAt: timestamp("created_at").notNull().defaultNow()
  },
  (t) => [
    index("bot_decisions_tenant_idx").on(t.tenantId),
    index("bot_decisions_created_idx").on(t.createdAt)
  ]
);
var riskEvents = pgTable(
  "risk_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    eventType: varchar("event_type", { length: 64 }).notNull(),
    severity: varchar("severity", { length: 16 }).notNull(),
    // info/warn/critical
    detail: jsonb("detail").notNull(),
    triggeredByUserId: uuid("triggered_by_user_id").references(() => users.id),
    createdAt: timestamp("created_at").notNull().defaultNow()
  },
  (t) => [index("risk_events_tenant_idx").on(t.tenantId)]
);
var experiments = pgTable(
  "experiments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    name: varchar("name", { length: 200 }).notNull(),
    kind: varchar("kind", { length: 32 }).notNull(),
    // diagnostic | param_sweep | comparison
    config: jsonb("config").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id),
    createdAt: timestamp("created_at").notNull().defaultNow()
  },
  (t) => [index("experiments_tenant_idx").on(t.tenantId)]
);
var experimentRuns = pgTable("experiment_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  experimentId: uuid("experiment_id").references(() => experiments.id),
  week: varchar("week", { length: 10 }),
  // ISO week, optional
  baselineConfig: jsonb("baseline_config").notNull(),
  proposedConfig: jsonb("proposed_config").notNull(),
  metrics: jsonb("metrics").notNull(),
  recommendation: jsonb("recommendation"),
  // Recommendation shape from shared/experiments
  verdict: varchar("verdict", { length: 16 }).notNull().default("pending"),
  // pending | approved | rejected | deferred | applied | no_action
  reviewedByUserId: uuid("reviewed_by_user_id").references(() => users.id),
  reviewedAt: timestamp("reviewed_at"),
  appliedAt: timestamp("applied_at"),
  createdAt: timestamp("created_at").notNull().defaultNow()
});
var autoresearchSessions = pgTable(
  "autoresearch_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    // Operator-supplied goal in plain English ("Find a config where CRV
    // trades >= 1/day with positive net PnL"). Fed to the LLM in the
    // system prompt.
    goal: text("goal").notNull(),
    pairId: uuid("pair_id").notNull().references(() => marketPairs.id),
    timeframe: varchar("timeframe", { length: 8 }).notNull(),
    lookbackBars: integer("lookback_bars").notNull(),
    regime: regimeEnum("regime").notNull(),
    model: varchar("model", { length: 64 }).notNull(),
    // gpt-4o, gpt-4o-mini, etc.
    // Two modes:
    //   tune     — agent hill-climbs to maximize score against the existing
    //              strategy + scoring function. Find a winning config.
    //   discover — agent samples the search space diversely. No hill-climb,
    //              no winner. Output is a survey: trades, win rate, P&L,
    //              drawdown across the param space. Used to understand what
    //              the strategy DOES before deciding what rules to keep
    //              or change.
    mode: varchar("mode", { length: 16 }).notNull().default("tune"),
    maxIterations: integer("max_iterations").notNull(),
    // The system prompt actually used for this session. Stored verbatim
    // so the operator can audit what the agent was instructed to do.
    // Sourced from the start request (which the client populates from
    // the GET /api/autoresearch/default-system-prompt endpoint, with
    // the operator's edits applied). Source of truth at runtime — the
    // orchestrator reads this column, not any module-level constant.
    systemPrompt: text("system_prompt").notNull().default(""),
    // Optional starting params for the baseline iteration. When the
    // operator clicks "Continue from this iteration" on a previous
    // session's row, we copy that iteration's params here so the new
    // session begins where the previous one's interesting result was —
    // not from DEFAULT_PARAMS. The agent then refines from that point.
    // Empty object means "use DEFAULT_PARAMS as baseline" (the
    // historical behaviour).
    seedParams: jsonb("seed_params").notNull().default({}),
    // When this session is a continuation of a previous one, points to
    // the parent session id. The orchestrator preloads the parent's
    // iterations into the agent's history context so the LLM sees what
    // was already tried and picks up where the parent left off — no
    // reseeding, no new instructions, just more iterations on the same
    // problem. Null for sessions started fresh from the Start form.
    parentSessionId: uuid("parent_session_id"),
    status: varchar("status", { length: 16 }).notNull().default("running"),
    // running | done | aborted | error | idle
    iterationsRun: integer("iterations_run").notNull().default(0),
    bestIterationId: uuid("best_iteration_id"),
    // FK set after first kept iter
    bestScore: numeric("best_score", { precision: 10, scale: 6 }),
    totalCostUsd: numeric("total_cost_usd", { precision: 10, scale: 6 }).notNull().default("0"),
    errorMessage: text("error_message"),
    createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id),
    startedAt: timestamp("started_at").notNull().defaultNow(),
    stoppedAt: timestamp("stopped_at")
  },
  (t) => [index("autoresearch_sessions_tenant_idx").on(t.tenantId)]
);
var autoresearchIterations = pgTable(
  "autoresearch_iterations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id").notNull().references(() => autoresearchSessions.id, { onDelete: "cascade" }),
    idx: integer("idx").notNull(),
    // 0..N-1 within the session
    // Full param snapshot the LLM proposed for this iteration. JSONB so we
    // can store whatever shape the orchestrator uses without locking it
    // into a column schema.
    params: jsonb("params").notNull(),
    // Backtest summary — only the headline numbers, NOT the full trade log.
    // Operators reading the archive want params + score, not per-trade detail.
    score: numeric("score", { precision: 10, scale: 6 }).notNull(),
    trades: integer("trades").notNull(),
    winRate: numeric("win_rate", { precision: 5, scale: 4 }).notNull(),
    netPnl: numeric("net_pnl", { precision: 14, scale: 2 }).notNull(),
    maxDrawdownPct: numeric("max_drawdown_pct", { precision: 5, scale: 2 }).notNull(),
    barsEvaluated: integer("bars_evaluated").notNull(),
    entriesTaken: integer("entries_taken").notNull(),
    // Top-N rejection breakdown as JSON, so the operator can see what
    // blocked this iteration without us storing every per-bar reason.
    rejectionTop: jsonb("rejection_top"),
    // 'keep' if score improved over previous best, 'discard' if not,
    // 'crash' if the backtest threw, 'baseline' for the first iteration.
    status: varchar("status", { length: 16 }).notNull(),
    // First-person narration the UI shows in the live feed. Generated by
    // narrate.ts so the format stays consistent.
    narration: text("narration").notNull(),
    // The LLM's stated reasoning for picking these params. Optional —
    // sometimes the model just outputs JSON.
    rationale: text("rationale"),
    // Cost accounting per iteration so the session total is verifiable.
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    costUsd: numeric("cost_usd", { precision: 10, scale: 6 }).notNull().default("0"),
    createdAt: timestamp("created_at").notNull().defaultNow()
  },
  (t) => [index("autoresearch_iterations_session_idx").on(t.sessionId)]
);
var cachedSymbols = pgTable("cached_symbols", {
  exchange: varchar("exchange", { length: 32 }).primaryKey(),
  symbols: jsonb("symbols").notNull(),
  // SymbolInfo[]
  refreshedAt: timestamp("refreshed_at").notNull().defaultNow()
});
var llmUsage = pgTable(
  "llm_usage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    model: varchar("model", { length: 64 }).notNull(),
    inputTokens: integer("input_tokens").notNull(),
    outputTokens: integer("output_tokens").notNull(),
    costUsd: numeric("cost_usd", { precision: 10, scale: 6 }).notNull(),
    purpose: varchar("purpose", { length: 64 }).notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow()
  },
  (t) => [
    index("llm_usage_tenant_idx").on(t.tenantId),
    index("llm_usage_created_idx").on(t.createdAt)
  ]
);
var regimeChanges = pgTable(
  "regime_changes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    fromRegime: regimeEnum("from_regime").notNull(),
    toRegime: regimeEnum("to_regime").notNull(),
    changedByUserId: uuid("changed_by_user_id").notNull().references(() => users.id),
    createdAt: timestamp("created_at").notNull().defaultNow()
  },
  (t) => [index("regime_changes_tenant_idx").on(t.tenantId)]
);
var usersRelations = relations(users, ({ many }) => ({
  tenants: many(tenants)
}));
var tenantsRelations = relations(tenants, ({ one, many }) => ({
  user: one(users, { fields: [tenants.userId], references: [users.id] }),
  config: one(tenantConfigs, { fields: [tenants.id], references: [tenantConfigs.tenantId] }),
  trades: many(trades),
  exchangeKeys: many(exchangeKeys)
}));
var insertUserSchema = createInsertSchema(users);
var insertAccessRequestSchema = createInsertSchema(accessRequests, {
  name: z.string().min(2).max(200),
  email: z.string().email(),
  cell: z.string().min(6).max(32).optional(),
  reason: z.string().max(2e3).optional()
}).pick({ name: true, email: true, cell: true, reason: true });
var insertInviteSchema = createInsertSchema(invitedUsers, {
  email: z.string().email()
}).pick({ email: true });
var insertMarketPairSchema = createInsertSchema(marketPairs, {
  baseAsset: z.string().min(1).max(16),
  quoteAsset: z.string().min(1).max(16),
  displayName: z.string().min(1).max(100),
  supportedExchanges: z.array(z.string()),
  minOrderSize: z.string()
});
var regimeChangeSchema = z.object({
  toRegime: z.enum([
    "no_trade",
    "ranging",
    "trending",
    "breakout",
    "high_volatility",
    "low_liquidity",
    "accumulation_distribution"
  ])
});
var zennyTimeframeEnum = pgEnum("zenny_timeframe", [
  "15m",
  "1H",
  "4H",
  "12H",
  "D"
]);
var zennyPoolTypeEnum = pgEnum("zenny_pool_type", [
  "RESISTANCE",
  "SUPPORT"
]);
var zennyPoolStatusEnum = pgEnum("zenny_pool_status", [
  "active",
  "dead",
  "flipped"
]);
var zennyDeathReasonEnum = pgEnum("zenny_death_reason", [
  "engulfing",
  "sustained_break",
  "score_exhaustion"
]);
var zennyLevelSourceEnum = pgEnum("zenny_level_source", [
  "extrema",
  "tick",
  "both"
]);
var zennyLevels = pgTable(
  "zenny_levels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    symbol: varchar("symbol", { length: 32 }).notNull(),
    timeframe: zennyTimeframeEnum("timeframe").notNull(),
    price: numeric("price", { precision: 20, scale: 8 }).notNull(),
    side: zennyPoolTypeEnum("side").notNull(),
    // RESISTANCE for swing high, SUPPORT for swing low
    swingCandleTime: timestamp("swing_candle_time").notNull(),
    touchCountInWindow: integer("touch_count_in_window").notNull().default(0),
    source: zennyLevelSourceEnum("source").notNull().default("extrema"),
    poolId: uuid("pool_id"),
    // nullable FK populated when graduated
    expiredAt: timestamp("expired_at"),
    createdAt: timestamp("created_at").notNull().defaultNow()
  },
  (t) => [
    index("zenny_levels_tenant_symbol_tf_idx").on(t.tenantId, t.symbol, t.timeframe),
    index("zenny_levels_swing_time_idx").on(t.swingCandleTime)
  ]
);
var zennyPools = pgTable(
  "zenny_pools",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    symbol: varchar("symbol", { length: 32 }).notNull(),
    timeframe: zennyTimeframeEnum("timeframe").notNull(),
    type: zennyPoolTypeEnum("type").notNull(),
    wickHigh: numeric("wick_high", { precision: 20, scale: 8 }).notNull(),
    wickLow: numeric("wick_low", { precision: 20, scale: 8 }).notNull(),
    centreLine: numeric("centre_line", { precision: 20, scale: 8 }).notNull(),
    birthCandleTime: timestamp("birth_candle_time").notNull(),
    deathCandleTime: timestamp("death_candle_time"),
    deathReason: zennyDeathReasonEnum("death_reason"),
    status: zennyPoolStatusEnum("status").notNull().default("active"),
    sEffective: numeric("s_effective", { precision: 6, scale: 2 }).notNull().default("0"),
    scoreBreakdown: jsonb("score_breakdown").notNull().default(sql`'{}'::jsonb`),
    polarityFlippedFromPoolId: uuid("polarity_flipped_from_pool_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow()
  },
  (t) => [
    index("zenny_pools_tenant_symbol_tf_idx").on(t.tenantId, t.symbol, t.timeframe),
    index("zenny_pools_status_idx").on(t.status),
    index("zenny_pools_birth_time_idx").on(t.birthCandleTime)
  ]
);
var hyblockcaptureEnum = pgEnum("hyblock_capture_source", [
  "redux_harvest",
  "manual_entry"
]);
var hyblockCaptures = pgTable(
  "hyblock_captures",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    exchange: varchar("exchange", { length: 32 }).notNull(),
    coin: varchar("coin", { length: 16 }).notNull(),
    lookback: varchar("lookback", { length: 32 }).notNull(),
    startDate: timestamp("start_date").notNull(),
    endDate: timestamp("end_date").notNull(),
    barCount: integer("bar_count").notNull(),
    source: hyblockcaptureEnum("source").notNull().default("redux_harvest"),
    payload: jsonb("payload").notNull(),
    capturedAt: timestamp("captured_at").notNull().defaultNow()
  },
  (t) => [
    index("hyblock_captures_coin_lookback_idx").on(t.coin, t.lookback),
    index("hyblock_captures_exchange_coin_idx").on(t.exchange, t.coin)
  ]
);
var hyblockOhlc = pgTable(
  "hyblock_ohlc",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    captureId: uuid("capture_id").notNull().references(() => hyblockCaptures.id, { onDelete: "cascade" }),
    exchange: varchar("exchange", { length: 32 }).notNull(),
    coin: varchar("coin", { length: 16 }).notNull(),
    barTime: timestamp("bar_time").notNull(),
    open: numeric("open", { precision: 20, scale: 8 }).notNull(),
    high: numeric("high", { precision: 20, scale: 8 }).notNull(),
    low: numeric("low", { precision: 20, scale: 8 }).notNull(),
    close: numeric("close", { precision: 20, scale: 8 }).notNull(),
    buyVolume: numeric("buy_volume", { precision: 24, scale: 2 }).notNull(),
    sellVolume: numeric("sell_volume", { precision: 24, scale: 2 }).notNull()
  },
  (t) => [
    index("hyblock_ohlc_coin_time_idx").on(t.coin, t.barTime)
  ]
);
var hyblockLiqLevels = pgTable(
  "hyblock_liq_levels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    captureId: uuid("capture_id").notNull().references(() => hyblockCaptures.id, { onDelete: "cascade" }),
    exchange: varchar("exchange", { length: 32 }).notNull(),
    coin: varchar("coin", { length: 16 }).notNull(),
    barTime: timestamp("bar_time").notNull(),
    side: tradeSideEnum("side").notNull(),
    tier: integer("tier").notNull(),
    price: numeric("price", { precision: 20, scale: 8 }).notNull()
  },
  (t) => [
    index("hyblock_liq_coin_time_side_idx").on(t.coin, t.barTime, t.side)
  ]
);
var binanceOi = pgTable(
  "binance_oi",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    symbol: varchar("symbol", { length: 32 }).notNull(),
    timestamp: timestamp("timestamp").notNull(),
    openInterest: numeric("open_interest", { precision: 24, scale: 8 }).notNull(),
    openInterestValue: numeric("open_interest_value", { precision: 24, scale: 2 }).notNull(),
    interval: varchar("interval", { length: 8 }).notNull()
  },
  (t) => [
    index("binance_oi_symbol_ts_idx").on(t.symbol, t.timestamp)
  ]
);
var binanceFundingRates = pgTable(
  "binance_funding_rates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    symbol: varchar("symbol", { length: 32 }).notNull(),
    fundingTime: timestamp("funding_time").notNull(),
    fundingRate: numeric("funding_rate", { precision: 20, scale: 10 }).notNull(),
    markPrice: numeric("mark_price", { precision: 20, scale: 8 }).notNull()
  },
  (t) => [
    index("binance_funding_symbol_ts_idx").on(t.symbol, t.fundingTime)
  ]
);
var binanceLongShortRatio = pgTable(
  "binance_long_short_ratio",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    symbol: varchar("symbol", { length: 32 }).notNull(),
    timestamp: timestamp("timestamp").notNull(),
    longShortRatio: numeric("long_short_ratio", { precision: 12, scale: 6 }).notNull(),
    longAccount: numeric("long_account", { precision: 8, scale: 4 }).notNull(),
    shortAccount: numeric("short_account", { precision: 8, scale: 4 }).notNull(),
    interval: varchar("interval", { length: 8 }).notNull()
  },
  (t) => [
    index("binance_ls_symbol_ts_idx").on(t.symbol, t.timestamp)
  ]
);
var binanceLiquidations = pgTable(
  "binance_liquidations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    symbol: varchar("symbol", { length: 32 }).notNull(),
    eventTime: timestamp("event_time").notNull(),
    positionSide: tradeSideEnum("position_side").notNull(),
    price: numeric("price", { precision: 20, scale: 8 }).notNull(),
    averagePrice: numeric("average_price", { precision: 20, scale: 8 }).notNull(),
    quantity: numeric("quantity", { precision: 24, scale: 8 }).notNull(),
    usdValue: numeric("usd_value", { precision: 24, scale: 2 }).notNull(),
    recordedAt: timestamp("recorded_at").notNull().defaultNow()
  },
  (t) => [
    index("binance_liq_symbol_time_idx").on(t.symbol, t.eventTime),
    index("binance_liq_symbol_price_idx").on(t.symbol, t.price)
  ]
);
var zennyPaperPositions = pgTable(
  "zenny_paper_positions",
  {
    id: text("id").primaryKey(),
    symbol: varchar("symbol", { length: 32 }).notNull(),
    timeframe: varchar("timeframe", { length: 8 }).notNull(),
    // Two-phase split: 'reach' or 'take'. Default 'take' for back-compat
    // with rows created before the column existed.
    phase: varchar("phase", { length: 8 }).notNull().default("take"),
    side: varchar("side", { length: 8 }).notNull(),
    // long | short
    // TradePlan geometry (immutable after PLANNED)
    entryPrice: numeric("entry_price", { precision: 20, scale: 8 }).notNull(),
    stopPrice: numeric("stop_price", { precision: 20, scale: 8 }).notNull(),
    targetPrice: numeric("target_price", { precision: 20, scale: 8 }).notNull(),
    riskPct: numeric("risk_pct", { precision: 8, scale: 4 }).notNull(),
    sizeMultiplier: numeric("size_multiplier", { precision: 8, scale: 4 }).notNull(),
    // Sizing — set on PLANNED → LIVE
    size: numeric("size", { precision: 24, scale: 8 }),
    notional: numeric("notional", { precision: 24, scale: 8 }),
    // Bar timestamps (ms since epoch)
    emittedAtBarTs: numeric("emitted_at_bar_ts", { precision: 20, scale: 0 }).notNull(),
    submittedAtBarTs: numeric("submitted_at_bar_ts", { precision: 20, scale: 0 }),
    filledAtBarTs: numeric("filled_at_bar_ts", { precision: 20, scale: 0 }),
    closedAtBarTs: numeric("closed_at_bar_ts", { precision: 20, scale: 0 }),
    // Realised execution prices
    fillPrice: numeric("fill_price", { precision: 20, scale: 8 }),
    closePrice: numeric("close_price", { precision: 20, scale: 8 }),
    realisedPnl: numeric("realised_pnl", { precision: 24, scale: 8 }),
    // State + audit
    status: varchar("status", { length: 16 }).notNull(),
    exitReason: varchar("exit_reason", { length: 32 }),
    rejectionReason: text("rejection_reason"),
    lastEvaluatedAt: numeric("last_evaluated_at", { precision: 20, scale: 0 }).notNull(),
    // Provenance from the decision module (for review later)
    playbook: varchar("playbook", { length: 16 }),
    anchorPoolId: text("anchor_pool_id"),
    rationale: jsonb("rationale"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow()
  },
  (t) => [
    index("zenny_paper_pos_symbol_tf_status_idx").on(t.symbol, t.timeframe, t.status),
    index("zenny_paper_pos_status_idx").on(t.status)
  ]
);
var zennyPaperAccount = pgTable("zenny_paper_account", {
  id: text("id").primaryKey(),
  startingEquity: numeric("starting_equity", { precision: 24, scale: 8 }).notNull(),
  currentEquity: numeric("current_equity", { precision: 24, scale: 8 }).notNull(),
  peakEquity: numeric("peak_equity", { precision: 24, scale: 8 }).notNull(),
  killStatus: varchar("kill_status", { length: 16 }).notNull().default("OK"),
  drawdownPct: numeric("drawdown_pct", { precision: 8, scale: 4 }).notNull().default("0"),
  killTrippedAt: timestamp("kill_tripped_at"),
  manualUnhaltAt: timestamp("manual_unhalt_at"),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
});
var zennyPaperTickLog = pgTable(
  "zenny_paper_tick_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tickAt: timestamp("tick_at").notNull().defaultNow(),
    symbol: varchar("symbol", { length: 32 }).notNull(),
    timeframe: varchar("timeframe", { length: 8 }).notNull(),
    summary: jsonb("summary").notNull(),
    // { hadOpenPosition, transition?, newPosition?, errors? }
    error: text("error")
  },
  (t) => [
    index("zenny_paper_tick_at_idx").on(t.tickAt)
  ]
);

// server/db.ts
var { Pool } = pg;
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL not set. Run via `doppler run`.");
}
var connectionString = process.env.DATABASE_URL.replace(
  /[&?]channel_binding=require/,
  ""
);
var pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
  max: 10
});
var db = drizzle(pool, { schema: schema_exports });

// server/storage.ts
import { eq, and, desc, gte, sql as sql2, inArray } from "drizzle-orm";

// server/cryptoUtil.ts
import crypto from "crypto";
var ALGO = "aes-256-gcm";
function getKey() {
  const hex = process.env.EXCHANGE_KEY_ENCRYPTION_KEY;
  if (!hex) throw new Error("EXCHANGE_KEY_ENCRYPTION_KEY not set");
  const buf = Buffer.from(hex, "hex");
  if (buf.length !== 32) {
    throw new Error(
      `EXCHANGE_KEY_ENCRYPTION_KEY must be 32 bytes hex (got ${buf.length})`
    );
  }
  return buf;
}
function encryptSecret(plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    ciphertext: ct.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64")
  };
}

// server/storage.ts
var storage = {
  // ---------- Users ----------
  async getUserById(id) {
    const [row] = await db.select().from(users).where(eq(users.id, id));
    return row;
  },
  async getUserByEmail(email) {
    const [row] = await db.select().from(users).where(eq(users.email, email));
    return row;
  },
  async upsertUserFromGoogle(profile) {
    const existing = await this.getUserByEmail(profile.email);
    if (existing) {
      const [updated] = await db.update(users).set({
        firstName: profile.firstName ?? existing.firstName,
        lastName: profile.lastName ?? existing.lastName,
        profileImageUrl: profile.profileImageUrl ?? existing.profileImageUrl,
        lastLoginAt: /* @__PURE__ */ new Date()
      }).where(eq(users.id, existing.id)).returning();
      return updated;
    }
    const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase();
    const isAdmin2 = adminEmail && profile.email.toLowerCase() === adminEmail;
    const [created] = await db.insert(users).values({
      email: profile.email,
      firstName: profile.firstName,
      lastName: profile.lastName,
      profileImageUrl: profile.profileImageUrl,
      isAdmin: Boolean(isAdmin2),
      lastLoginAt: /* @__PURE__ */ new Date()
    }).returning();
    return created;
  },
  async acceptTerms(userId) {
    await db.update(users).set({ termsAcceptedAt: /* @__PURE__ */ new Date() }).where(eq(users.id, userId));
  },
  async listUsers() {
    return db.select().from(users).orderBy(desc(users.createdAt));
  },
  async setAdmin(userId, isAdmin2) {
    await db.update(users).set({ isAdmin: isAdmin2 }).where(eq(users.id, userId));
  },
  async setSuspended(userId, isSuspended) {
    await db.update(users).set({ isSuspended }).where(eq(users.id, userId));
  },
  // ---------- Invites ----------
  async isEmailInvited(email) {
    const [row] = await db.select().from(invitedUsers).where(eq(invitedUsers.email, email.toLowerCase()));
    return Boolean(row);
  },
  async listInvites() {
    return db.select().from(invitedUsers).orderBy(desc(invitedUsers.createdAt));
  },
  async addInvite(email, invitedByUserId) {
    const [row] = await db.insert(invitedUsers).values({ email: email.toLowerCase(), invitedByUserId }).onConflictDoNothing().returning();
    return row;
  },
  async removeInvite(id) {
    await db.delete(invitedUsers).where(eq(invitedUsers.id, id));
  },
  // ---------- Access requests ----------
  async createAccessRequest(input) {
    const [row] = await db.insert(accessRequests).values({
      name: input.name,
      email: input.email.toLowerCase(),
      cell: input.cell,
      reason: input.reason
    }).returning();
    return row;
  },
  async listAccessRequests() {
    return db.select().from(accessRequests).orderBy(desc(accessRequests.createdAt));
  },
  async decideAccessRequest(id, status, adminId) {
    await db.update(accessRequests).set({ status, decidedAt: /* @__PURE__ */ new Date(), decidedByUserId: adminId }).where(eq(accessRequests.id, id));
  },
  // ---------- Audit ----------
  async listAuditLogs(limit = 200) {
    return db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(limit);
  },
  async securityOverview() {
    const [totalUsers] = await db.select({ n: sql2`count(*)::int` }).from(users);
    const [admins] = await db.select({ n: sql2`count(*)::int` }).from(users).where(eq(users.isAdmin, true));
    const [suspended] = await db.select({ n: sql2`count(*)::int` }).from(users).where(eq(users.isSuspended, true));
    const [pendingRequests] = await db.select({ n: sql2`count(*)::int` }).from(accessRequests).where(eq(accessRequests.status, "pending"));
    return {
      totalUsers: totalUsers.n,
      admins: admins.n,
      suspended: suspended.n,
      pendingRequests: pendingRequests.n
    };
  },
  // ---------- Tenants ----------
  async getOrCreateTenantForUser(userId) {
    const [existing] = await db.select().from(tenants).where(eq(tenants.userId, userId));
    if (existing) return existing;
    const [created] = await db.insert(tenants).values({ userId, name: "Primary instance" }).returning();
    await db.insert(tenantConfigs).values({ tenantId: created.id });
    return created;
  },
  async getTenantConfig(tenantId) {
    const [row] = await db.select().from(tenantConfigs).where(eq(tenantConfigs.tenantId, tenantId));
    return row;
  },
  async setTenantRegime(tenantId, toRegime, userId, source = "manual") {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
    if (!tenant) throw new Error("tenant not found");
    const fromRegime = tenant.activeRegime;
    if (fromRegime === toRegime && tenant.activeRegimeSource === source) {
      return { fromRegime, toRegime, noop: true };
    }
    await db.update(tenants).set({ activeRegime: toRegime, activeRegimeSource: source }).where(eq(tenants.id, tenantId));
    await db.insert(regimeChanges).values({
      tenantId,
      fromRegime,
      toRegime,
      changedByUserId: userId
    });
    return { fromRegime, toRegime, noop: false };
  },
  async setAutopilot(tenantId, autopilot) {
    await db.update(tenants).set({ autopilotRegime: autopilot }).where(eq(tenants.id, tenantId));
  },
  async writeRegimeSuggestion(input) {
    await db.update(tenants).set({
      suggestedRegime: input.regime,
      suggestedRegimeConfidence: String(input.confidence),
      suggestedRegimeAt: /* @__PURE__ */ new Date(),
      suggestedRegimeRationale: input.rationale,
      suggestedRegimeSignals: input.signals
    }).where(eq(tenants.id, input.tenantId));
  },
  async setBotStatus(tenantId, status, reason) {
    const isHalt = status === "halted" || status === "error";
    await db.update(tenants).set({
      botStatus: status,
      lastHaltedAt: isHalt ? /* @__PURE__ */ new Date() : void 0,
      lastHaltReason: reason,
      ...isHalt ? { activeRegime: "no_trade" } : {}
    }).where(eq(tenants.id, tenantId));
  },
  async listRegimeChanges(tenantId, limit = 50) {
    return db.select().from(regimeChanges).where(eq(regimeChanges.tenantId, tenantId)).orderBy(desc(regimeChanges.createdAt)).limit(limit);
  },
  // ---------- Market pairs ----------
  async listEnabledPairs() {
    return db.select().from(marketPairs).where(eq(marketPairs.enabled, true));
  },
  async listAllPairs() {
    return db.select().from(marketPairs).orderBy(desc(marketPairs.createdAt));
  },
  async getMarketPair(id) {
    const [row] = await db.select().from(marketPairs).where(eq(marketPairs.id, id));
    return row ?? null;
  },
  async createPair(input) {
    const [row] = await db.insert(marketPairs).values(input).returning();
    return row;
  },
  async updatePair(id, patch) {
    await db.update(marketPairs).set({ ...patch, updatedAt: /* @__PURE__ */ new Date() }).where(eq(marketPairs.id, id));
  },
  async deletePair(id) {
    const [inUse] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.activePairId, id)).limit(1);
    if (inUse) {
      return { deleted: false, reason: "in_use_by_tenant" };
    }
    await db.delete(marketPairs).where(eq(marketPairs.id, id));
    return { deleted: true };
  },
  // ---------- Trades ----------
  async listTrades(tenantId, limit = 100) {
    return db.select().from(trades).where(eq(trades.tenantId, tenantId)).orderBy(desc(trades.openedAt)).limit(limit);
  },
  async listOpenTrades(tenantId) {
    return db.select().from(trades).where(and(eq(trades.tenantId, tenantId), eq(trades.status, "open")));
  },
  async closeTrade(input) {
    await db.update(trades).set({
      status: "closed",
      exitPrice: String(input.exitPrice),
      realisedPnl: String(input.realisedPnl),
      closedAt: /* @__PURE__ */ new Date(),
      closeReason: input.reason
    }).where(eq(trades.id, input.tradeId));
  },
  async recordRiskEvent(input) {
    await db.insert(riskEvents).values({
      tenantId: input.tenantId,
      eventType: input.eventType,
      severity: input.severity,
      detail: input.detail,
      triggeredByUserId: input.triggeredByUserId
    });
  },
  async touchTenantTick(tenantId) {
    await db.update(tenants).set({ lastTickAt: /* @__PURE__ */ new Date() }).where(eq(tenants.id, tenantId));
  },
  async incrementExchangeFailures(tenantId) {
    const [row] = await db.update(tenants).set({
      consecutiveExchangeFailures: sql2`${tenants.consecutiveExchangeFailures} + 1`
    }).where(eq(tenants.id, tenantId)).returning({ n: tenants.consecutiveExchangeFailures });
    return row.n;
  },
  async resetExchangeFailures(tenantId) {
    await db.update(tenants).set({ consecutiveExchangeFailures: 0 }).where(eq(tenants.id, tenantId));
  },
  async listBotDecisions(tenantId, limit = 50) {
    return db.select().from(botDecisions).where(eq(botDecisions.tenantId, tenantId)).orderBy(desc(botDecisions.createdAt)).limit(limit);
  },
  async updateTenantConfig(tenantId, patch) {
    await db.update(tenantConfigs).set({ ...patch, updatedAt: /* @__PURE__ */ new Date() }).where(eq(tenantConfigs.tenantId, tenantId));
  },
  async applyPortfolioTier(tenantId, tier, defaults) {
    await db.update(tenantConfigs).set({
      ...defaults,
      portfolioTier: tier,
      updatedAt: /* @__PURE__ */ new Date()
    }).where(eq(tenantConfigs.tenantId, tenantId));
  },
  async setActivePair(tenantId, pairId) {
    await db.update(tenants).set({ activePairId: pairId }).where(eq(tenants.id, tenantId));
  },
  async saveExchangeKey(input) {
    const keyBlob = encryptSecret(input.apiKey);
    const secretBlob = encryptSecret(input.apiSecret);
    await db.delete(exchangeKeys).where(
      and(
        eq(exchangeKeys.tenantId, input.tenantId),
        eq(exchangeKeys.exchange, input.exchange)
      )
    );
    await db.insert(exchangeKeys).values({
      tenantId: input.tenantId,
      exchange: input.exchange,
      apiKeyCiphertext: keyBlob.ciphertext,
      apiKeyIv: keyBlob.iv,
      apiKeyAuthTag: keyBlob.authTag,
      apiSecretCiphertext: secretBlob.ciphertext,
      apiSecretIv: secretBlob.iv,
      apiSecretAuthTag: secretBlob.authTag
    });
  },
  // "What is this thing costing me?" — activity + spend summary for the
  // header strip. ticks come from bot_decisions (one row per tick), API
  // calls are estimated at 2 per tick (klines + ticker), LLM spend comes
  // from llm_usage for the current calendar month, infra spend is a
  // placeholder until Vercel's observability API is wired.
  async getTenantCosts(tenantId) {
    const startOfDay = /* @__PURE__ */ new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const startOfHour = /* @__PURE__ */ new Date();
    startOfHour.setMinutes(0, 0, 0);
    const startOfMonth = /* @__PURE__ */ new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const [today] = await db.select({ n: sql2`count(*)::int` }).from(botDecisions).where(
      and(
        eq(botDecisions.tenantId, tenantId),
        gte(botDecisions.createdAt, startOfDay)
      )
    );
    const [hour] = await db.select({ n: sql2`count(*)::int` }).from(botDecisions).where(
      and(
        eq(botDecisions.tenantId, tenantId),
        gte(botDecisions.createdAt, startOfHour)
      )
    );
    const [llmMonth] = await db.select({ cost: sql2`coalesce(sum(cost_usd), 0)::float` }).from(llmUsage).where(
      and(
        eq(llmUsage.tenantId, tenantId),
        gte(llmUsage.createdAt, startOfMonth)
      )
    );
    const [firstDecision] = await db.select({ at: botDecisions.createdAt }).from(botDecisions).where(eq(botDecisions.tenantId, tenantId)).orderBy(botDecisions.createdAt).limit(1);
    const [tenant] = await db.select({
      lastTickAt: tenants.lastTickAt,
      failures: tenants.consecutiveExchangeFailures
    }).from(tenants).where(eq(tenants.id, tenantId));
    return {
      ticksToday: today.n,
      ticksThisHour: hour.n,
      apiCallsToday: today.n * 2,
      // 1 klines + 1 ticker per tick
      llmCostMonth: llmMonth.cost,
      infraCostMonth: 0,
      // Vercel Hobby = free; wire observability API later
      firstSeenAt: firstDecision?.at ?? null,
      lastTickAt: tenant?.lastTickAt ?? null,
      consecutiveExchangeFailures: tenant?.failures ?? 0
    };
  },
  async getCachedSymbols(exchange) {
    const [row] = await db.select().from(cachedSymbols).where(eq(cachedSymbols.exchange, exchange));
    return row;
  },
  async writeCachedSymbols(exchange, symbols) {
    await db.insert(cachedSymbols).values({ exchange, symbols, refreshedAt: /* @__PURE__ */ new Date() }).onConflictDoUpdate({
      target: cachedSymbols.exchange,
      set: { symbols, refreshedAt: /* @__PURE__ */ new Date() }
    });
  },
  // ---------- Autoresearch sessions ----------
  async listAutoresearchSessions(tenantId) {
    return db.select().from(autoresearchSessions).where(eq(autoresearchSessions.tenantId, tenantId)).orderBy(desc(autoresearchSessions.startedAt));
  },
  async getAutoresearchSession(id) {
    const [row] = await db.select().from(autoresearchSessions).where(eq(autoresearchSessions.id, id));
    return row ?? null;
  },
  async listAutoresearchIterations(sessionId) {
    return db.select().from(autoresearchIterations).where(eq(autoresearchIterations.sessionId, sessionId)).orderBy(autoresearchIterations.idx);
  },
  async getAutoresearchIteration(id) {
    const [row] = await db.select().from(autoresearchIterations).where(eq(autoresearchIterations.id, id));
    return row ?? null;
  },
  // Currently-active session for a tenant: the most recent session
  // whose status is NOT a terminal one. Returns running + paused +
  // legacy 'aborted' sessions — anything the operator can continue
  // or resume. Terminal statuses (stopped, error, legacy 'done') are
  // excluded; those live in History.
  async findRunningAutoresearchSession(tenantId) {
    const [row] = await db.select().from(autoresearchSessions).where(
      and(
        eq(autoresearchSessions.tenantId, tenantId),
        // Non-terminal statuses. "done" is LEGACY terminal, not
        // included — it's pre-refactor equivalent to "stopped".
        inArray(autoresearchSessions.status, ["running", "paused", "aborted"])
      )
    ).orderBy(desc(autoresearchSessions.startedAt)).limit(1);
    return row ?? null;
  },
  // ---------- Experiments (PRD §11) ----------
  async listExperiments(tenantId) {
    return db.select().from(experiments).where(eq(experiments.tenantId, tenantId)).orderBy(desc(experiments.createdAt));
  },
  async getExperiment(id) {
    const [row] = await db.select().from(experiments).where(eq(experiments.id, id));
    return row ?? null;
  },
  async createExperiment(input) {
    const [row] = await db.insert(experiments).values(input).returning();
    return row;
  },
  async setExperimentEnabled(id, enabled) {
    await db.update(experiments).set({ enabled }).where(eq(experiments.id, id));
  },
  async deleteExperiment(id) {
    await db.update(experimentRuns).set({ experimentId: null }).where(eq(experimentRuns.experimentId, id));
    await db.delete(experiments).where(eq(experiments.id, id));
  },
  async insertExperimentRun(input) {
    const [row] = await db.insert(experimentRuns).values(input).returning();
    return row;
  },
  async listExperimentRunsForTenant(tenantId, limit = 50) {
    return db.select().from(experimentRuns).where(eq(experimentRuns.tenantId, tenantId)).orderBy(desc(experimentRuns.createdAt)).limit(limit);
  },
  async listExperimentRunsForExperiment(experimentId, limit = 20) {
    return db.select().from(experimentRuns).where(eq(experimentRuns.experimentId, experimentId)).orderBy(desc(experimentRuns.createdAt)).limit(limit);
  },
  async listPendingRecommendations(tenantId) {
    return db.select().from(experimentRuns).where(
      and(eq(experimentRuns.tenantId, tenantId), eq(experimentRuns.verdict, "pending"))
    ).orderBy(desc(experimentRuns.createdAt));
  },
  async getExperimentRun(id) {
    const [row] = await db.select().from(experimentRuns).where(eq(experimentRuns.id, id));
    return row ?? null;
  },
  async setRunVerdict(id, verdict, reviewedByUserId) {
    const patch = { verdict };
    if (reviewedByUserId) {
      patch.reviewedByUserId = reviewedByUserId;
      patch.reviewedAt = /* @__PURE__ */ new Date();
    }
    if (verdict === "applied") patch.appliedAt = /* @__PURE__ */ new Date();
    await db.update(experimentRuns).set(patch).where(eq(experimentRuns.id, id));
  },
  async listExchangeKeyMetadata(tenantId) {
    return db.select({
      id: exchangeKeys.id,
      exchange: exchangeKeys.exchange,
      permissionsValidatedAt: exchangeKeys.permissionsValidatedAt,
      createdAt: exchangeKeys.createdAt
    }).from(exchangeKeys).where(eq(exchangeKeys.tenantId, tenantId));
  }
};

// server/auditLog.ts
function audit(entry) {
  db.insert(auditLogs).values({
    userId: entry.userId ?? null,
    tenantId: entry.tenantId ?? null,
    action: entry.action,
    resourceType: entry.resourceType,
    resourceId: entry.resourceId,
    outcome: entry.outcome,
    detail: entry.detail ?? null,
    ipAddress: entry.ipAddress,
    userAgent: entry.userAgent
  }).catch((err) => {
    console.error("[audit] failed to write log entry", err, entry.action);
  });
}

// server/auth.ts
var PgStore = connectPgSimple(session);
function setupAuth(app2) {
  const required = [
    "SESSION_SECRET",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "APP_URL"
  ];
  for (const k of required) {
    if (!process.env[k]) throw new Error(`${k} not set`);
  }
  const isProd2 = process.env.NODE_ENV === "production";
  app2.set("trust proxy", 1);
  app2.use(
    session({
      store: new PgStore({
        pool,
        tableName: "sessions",
        createTableIfMissing: false
      }),
      secret: process.env.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: {
        httpOnly: true,
        secure: isProd2,
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1e3
      }
    })
  );
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: `${process.env.APP_URL}/auth/callback`
      },
      async (_access, _refresh, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value?.toLowerCase();
          if (!email) return done(null, false, { message: "no_email" });
          const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase();
          const isSeedAdmin = email === adminEmail;
          if (!isSeedAdmin) {
            const invited = await storage.isEmailInvited(email);
            if (!invited) {
              audit({
                action: "login_denied",
                resourceType: "user",
                resourceId: email,
                outcome: "denied",
                detail: { reason: "not_invited" }
              });
              return done(null, false, { message: "not_invited" });
            }
          }
          const user = await storage.upsertUserFromGoogle({
            email,
            firstName: profile.name?.givenName,
            lastName: profile.name?.familyName,
            profileImageUrl: profile.photos?.[0]?.value
          });
          if (user.isSuspended) {
            audit({
              userId: user.id,
              action: "login_denied",
              outcome: "denied",
              detail: { reason: "suspended" }
            });
            return done(null, false, { message: "suspended" });
          }
          audit({
            userId: user.id,
            action: "login",
            outcome: "success"
          });
          return done(null, user);
        } catch (err) {
          return done(err);
        }
      }
    )
  );
  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id, done) => {
    try {
      const user = await storage.getUserById(id);
      done(null, user ?? false);
    } catch (err) {
      done(err);
    }
  });
  app2.use(passport.initialize());
  app2.use(passport.session());
  app2.get(
    "/auth/google",
    passport.authenticate("google", { scope: ["profile", "email"] })
  );
  const clientBase = isProd2 ? "/" : "http://localhost:5173/";
  app2.get(
    "/auth/callback",
    passport.authenticate("google", {
      failureRedirect: `${clientBase}?error=auth_failed`
    }),
    (_req, res) => res.redirect(clientBase)
  );
  app2.post("/auth/logout", (req, res, next) => {
    const uid = req.user?.id;
    req.logout((err) => {
      if (err) return next(err);
      req.session.destroy(() => {
        res.clearCookie("connect.sid", {
          path: "/",
          httpOnly: true,
          secure: isProd2,
          sameSite: "lax"
        });
        audit({ userId: uid, action: "logout", outcome: "success" });
        res.json({ ok: true });
      });
    });
  });
}
function isAuthenticated(req, res, next) {
  if (req.isAuthenticated?.() && req.user) return next();
  return res.status(401).json({ error: "unauthorized" });
}
function isAdmin(req, res, next) {
  const user = req.user;
  if (user?.isAdmin) return next();
  return res.status(403).json({ error: "forbidden" });
}

// server/routes.ts
import { z as z2 } from "zod";

// server/modules/exchange/binance.ts
var TIMEFRAME_MAP = {
  "15m": "15m",
  "1h": "1h",
  "4h": "4h",
  "12h": "12h",
  "1d": "1d"
};
var BinanceAdapter = class {
  name = "binance";
  baseUrl;
  constructor(baseUrl = process.env.BINANCE_API_BASE_URL ?? "https://testnet.binance.vision") {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }
  async fetchCandles(args) {
    const params = new URLSearchParams({
      symbol: args.symbol,
      interval: TIMEFRAME_MAP[args.timeframe],
      limit: String(Math.min(1e3, args.limit))
    });
    if (args.endTime) params.set("endTime", String(args.endTime));
    const url = `${this.baseUrl}/api/v3/klines?${params}`;
    const res = await fetch(url);
    if (!res.ok) {
      const text2 = await res.text().catch(() => "");
      throw new Error(`binance klines ${res.status}: ${text2}`);
    }
    const rows = await res.json();
    return rows.map((r) => ({
      openTime: Number(r[0]),
      open: Number(r[1]),
      high: Number(r[2]),
      low: Number(r[3]),
      close: Number(r[4]),
      volume: Number(r[5]),
      closeTime: Number(r[6])
    }));
  }
  async fetchPrice(symbol) {
    const res = await fetch(`${this.baseUrl}/api/v3/ticker/price?symbol=${symbol}`);
    if (!res.ok) throw new Error(`binance ticker ${res.status}`);
    const body = await res.json();
    return Number(body.price);
  }
  // Tradable pair listing for the admin registry. Cached for an hour so
  // the admin UI can hit /api/admin/.../symbols freely without hammering
  // the exchange.
  symbolsCache = null;
  symbolsCacheAt = 0;
  async fetchSymbols() {
    const now = Date.now();
    if (this.symbolsCache && now - this.symbolsCacheAt < 60 * 60 * 1e3) {
      return this.symbolsCache;
    }
    const res = await fetch(`${this.baseUrl}/api/v3/exchangeInfo`);
    if (!res.ok) throw new Error(`binance exchangeInfo ${res.status}`);
    const body = await res.json();
    const out = body.symbols.filter((s) => s.status === "TRADING").map((s) => ({
      symbol: s.symbol,
      baseAsset: s.baseAsset,
      quoteAsset: s.quoteAsset,
      minQty: s.filters.find((f) => f.filterType === "LOT_SIZE")?.minQty ?? "0.00000001"
    }));
    this.symbolsCache = out;
    this.symbolsCacheAt = now;
    return out;
  }
};
var singleton = null;
function getBinance() {
  if (!singleton) singleton = new BinanceAdapter();
  return singleton;
}

// server/routes.ts
function getUser(req) {
  return req.user;
}
function getIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string") return xff.split(",")[0].trim();
  if (Array.isArray(xff) && xff.length) return xff[0];
  return req.ip || "unknown";
}
function pid(req, key) {
  const v = req.params[key];
  return Array.isArray(v) ? v[0] : v;
}
function registerRoutes(app2) {
  app2.get("/api/auth/user", isAuthenticated, async (req, res) => {
    const u = getUser(req);
    const full = await storage.getUserById(u.id);
    res.json(full ?? null);
  });
  app2.post("/api/user/accept-terms", isAuthenticated, async (req, res) => {
    const u = getUser(req);
    await storage.acceptTerms(u.id);
    audit({
      userId: u.id,
      action: "accept_terms",
      outcome: "success",
      ipAddress: getIp(req)
    });
    res.json({ ok: true });
  });
  app2.post("/api/request-access", async (req, res) => {
    const parsed = insertAccessRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "invalid", issues: parsed.error.issues });
    }
    const row = await storage.createAccessRequest(parsed.data);
    audit({
      action: "request_access",
      resourceType: "access_request",
      resourceId: row.id,
      outcome: "success",
      detail: { email: parsed.data.email },
      ipAddress: getIp(req)
    });
    res.json({ ok: true });
  });
  app2.get("/api/admin/users", isAuthenticated, isAdmin, async (_req, res) => {
    res.json(await storage.listUsers());
  });
  app2.patch(
    "/api/admin/users/:id/admin",
    isAuthenticated,
    isAdmin,
    async (req, res) => {
      const { isAdmin: flag } = z2.object({ isAdmin: z2.boolean() }).parse(req.body);
      await storage.setAdmin(pid(req, "id"), flag);
      audit({
        userId: getUser(req).id,
        action: "set_admin",
        resourceType: "user",
        resourceId: pid(req, "id"),
        outcome: "success",
        detail: { isAdmin: flag },
        ipAddress: getIp(req)
      });
      res.json({ ok: true });
    }
  );
  app2.patch(
    "/api/admin/users/:id/suspended",
    isAuthenticated,
    isAdmin,
    async (req, res) => {
      const { isSuspended } = z2.object({ isSuspended: z2.boolean() }).parse(req.body);
      await storage.setSuspended(pid(req, "id"), isSuspended);
      audit({
        userId: getUser(req).id,
        action: "set_suspended",
        resourceType: "user",
        resourceId: pid(req, "id"),
        outcome: "success",
        detail: { isSuspended },
        ipAddress: getIp(req)
      });
      res.json({ ok: true });
    }
  );
  app2.get(
    "/api/admin/invites",
    isAuthenticated,
    isAdmin,
    async (_req, res) => {
      res.json(await storage.listInvites());
    }
  );
  app2.post(
    "/api/admin/invites",
    isAuthenticated,
    isAdmin,
    async (req, res) => {
      const parsed = insertInviteSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "invalid" });
      const row = await storage.addInvite(parsed.data.email, getUser(req).id);
      audit({
        userId: getUser(req).id,
        action: "add_invite",
        resourceType: "invite",
        resourceId: row?.id,
        outcome: "success",
        detail: { email: parsed.data.email },
        ipAddress: getIp(req)
      });
      res.json(row);
    }
  );
  app2.delete(
    "/api/admin/invites/:id",
    isAuthenticated,
    isAdmin,
    async (req, res) => {
      await storage.removeInvite(pid(req, "id"));
      audit({
        userId: getUser(req).id,
        action: "remove_invite",
        resourceType: "invite",
        resourceId: pid(req, "id"),
        outcome: "success",
        ipAddress: getIp(req)
      });
      res.json({ ok: true });
    }
  );
  app2.get(
    "/api/admin/access-requests",
    isAuthenticated,
    isAdmin,
    async (_req, res) => {
      res.json(await storage.listAccessRequests());
    }
  );
  app2.patch(
    "/api/admin/access-requests/:id",
    isAuthenticated,
    isAdmin,
    async (req, res) => {
      const { status } = z2.object({ status: z2.enum(["approved", "declined"]) }).parse(req.body);
      await storage.decideAccessRequest(pid(req, "id"), status, getUser(req).id);
      audit({
        userId: getUser(req).id,
        action: "decide_access_request",
        resourceType: "access_request",
        resourceId: pid(req, "id"),
        outcome: "success",
        detail: { status },
        ipAddress: getIp(req)
      });
      res.json({ ok: true });
    }
  );
  app2.get(
    "/api/admin/audit-logs",
    isAuthenticated,
    isAdmin,
    async (_req, res) => {
      res.json(await storage.listAuditLogs(500));
    }
  );
  app2.get(
    "/api/admin/security-overview",
    isAuthenticated,
    isAdmin,
    async (_req, res) => {
      res.json(await storage.securityOverview());
    }
  );
  app2.get("/api/admin/pairs", isAuthenticated, isAdmin, async (_req, res) => {
    res.json(await storage.listAllPairs());
  });
  app2.post("/api/admin/pairs", isAuthenticated, isAdmin, async (req, res) => {
    const parsed = insertMarketPairSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "invalid" });
    const row = await storage.createPair({
      ...parsed.data,
      addedByUserId: getUser(req).id
    });
    audit({
      userId: getUser(req).id,
      action: "create_pair",
      resourceType: "market_pair",
      resourceId: row.id,
      outcome: "success",
      detail: parsed.data,
      ipAddress: getIp(req)
    });
    res.json(row);
  });
  app2.patch(
    "/api/admin/pairs/:id",
    isAuthenticated,
    isAdmin,
    async (req, res) => {
      await storage.updatePair(pid(req, "id"), req.body);
      audit({
        userId: getUser(req).id,
        action: "update_pair",
        resourceType: "market_pair",
        resourceId: pid(req, "id"),
        outcome: "success",
        ipAddress: getIp(req)
      });
      res.json({ ok: true });
    }
  );
  app2.get(
    "/api/admin/exchanges/binance/symbols",
    isAuthenticated,
    isAdmin,
    async (req, res) => {
      const quote = typeof req.query.quote === "string" ? req.query.quote.toUpperCase() : null;
      const filter = (rows) => quote ? rows.filter((s) => s.quoteAsset === quote) : rows;
      const cached = await storage.getCachedSymbols("binance");
      if (cached) {
        return res.json({
          symbols: filter(cached.symbols),
          refreshedAt: cached.refreshedAt
        });
      }
      try {
        const symbols = await getBinance().fetchSymbols();
        await storage.writeCachedSymbols("binance", symbols);
        res.json({ symbols: filter(symbols), refreshedAt: /* @__PURE__ */ new Date() });
      } catch (err) {
        res.status(502).json({ error: err.message });
      }
    }
  );
  app2.delete(
    "/api/admin/pairs/:id",
    isAuthenticated,
    isAdmin,
    async (req, res) => {
      const id = pid(req, "id");
      const result = await storage.deletePair(id);
      if (!result.deleted) {
        return res.status(409).json({ error: result.reason ?? "cannot_delete" });
      }
      audit({
        userId: getUser(req).id,
        action: "delete_pair",
        resourceType: "market_pair",
        resourceId: id,
        outcome: "success",
        ipAddress: getIp(req)
      });
      res.json({ ok: true });
    }
  );
}

// server/modules/zenny/infrastructure/cache/candleCache.ts
var CACHE_TTL_MS = 3e4;
var CandleCache = class {
  store = /* @__PURE__ */ new Map();
  key(symbol, timeframe) {
    return `${symbol.toUpperCase()}|${timeframe}`;
  }
  // Read up to `count` most-recent candles for the symbol+timeframe.
  // Returns null if nothing cached yet (caller falls back to network).
  read(symbol, timeframe, count, nowMs = Date.now()) {
    const entry = this.store.get(this.key(symbol, timeframe));
    if (!entry) return null;
    if (entry.candles.length === 0) return null;
    if (entry.candles.length < count) return null;
    if (nowMs - entry.lastUpdatedMs > CACHE_TTL_MS) return null;
    return entry.candles.slice(-count);
  }
  // Write candles. New candles are merged into the cache, dedup by openTime,
  // keeping latest data. Sorted on the way in.
  write(symbol, timeframe, newCandles) {
    const k = this.key(symbol, timeframe);
    const existing = this.store.get(k);
    const merged = mergeCandles(existing?.candles ?? [], newCandles);
    this.store.set(k, {
      candles: merged,
      lastUpdatedMs: Date.now()
    });
  }
  // Clear cache for a symbol+timeframe (used in tests, recovery)
  clear(symbol, timeframe) {
    this.store.delete(this.key(symbol, timeframe));
  }
  // Return age of cached data
  ageMs(symbol, timeframe) {
    const entry = this.store.get(this.key(symbol, timeframe));
    if (!entry) return null;
    return Date.now() - entry.lastUpdatedMs;
  }
};
function mergeCandles(existing, incoming) {
  if (incoming.length === 0) return existing;
  const byOpenTime = /* @__PURE__ */ new Map();
  for (const c of existing) byOpenTime.set(c.openTime, c);
  for (const c of incoming) byOpenTime.set(c.openTime, c);
  return Array.from(byOpenTime.values()).sort((a, b) => a.openTime - b.openTime);
}

// server/modules/zenny/infrastructure/rateLimiter/advance.ts
function advance(input) {
  const elapsed = Math.max(0, input.nowMs - input.state.lastRefillMs);
  const refilled = Math.min(
    input.state.capacity,
    input.state.tokens + elapsed * input.state.refillPerMs
  );
  return {
    ...input.state,
    tokens: refilled,
    lastRefillMs: input.nowMs
  };
}

// server/modules/zenny/infrastructure/rateLimiter/tryConsume.ts
function tryConsume(input) {
  const refreshed = advance({ state: input.state, nowMs: input.nowMs });
  if (refreshed.tokens >= input.cost) {
    return {
      granted: true,
      state: { ...refreshed, tokens: refreshed.tokens - input.cost },
      shortfall: 0,
      msUntilAvailable: 0
    };
  }
  const shortfall = input.cost - refreshed.tokens;
  const msUntilAvailable = refreshed.refillPerMs > 0 ? Math.ceil(shortfall / refreshed.refillPerMs) : Infinity;
  return {
    granted: false,
    state: refreshed,
    shortfall,
    msUntilAvailable
  };
}

// server/modules/zenny/infrastructure/circuitBreaker/advanceBreaker.ts
function advanceBreaker(state, nowMs) {
  if (state.status === "open" && state.openedAtMs !== null) {
    const elapsed = nowMs - state.openedAtMs;
    if (elapsed >= state.openDurationMs) {
      return {
        ...state,
        status: "half_open",
        halfOpenAttemptsRemaining: state.halfOpenAttemptBudget
      };
    }
  }
  return state;
}

// server/modules/zenny/infrastructure/circuitBreaker/canRequest.ts
function canRequest(state) {
  if (state.status === "closed") return true;
  if (state.status === "open") return false;
  return state.halfOpenAttemptsRemaining > 0;
}

// server/modules/zenny/infrastructure/circuitBreaker/recordFailure.ts
function recordFailure(state, nowMs) {
  const failures = state.consecutiveFailures + 1;
  if (state.status === "half_open") {
    return {
      ...state,
      status: "open",
      consecutiveFailures: failures,
      openedAtMs: nowMs,
      halfOpenAttemptsRemaining: 0
    };
  }
  if (failures >= state.failureThreshold) {
    return {
      ...state,
      status: "open",
      consecutiveFailures: failures,
      openedAtMs: nowMs
    };
  }
  return { ...state, consecutiveFailures: failures };
}

// server/modules/zenny/infrastructure/circuitBreaker/recordSuccess.ts
function recordSuccess(state) {
  return {
    ...state,
    status: "closed",
    consecutiveFailures: 0,
    openedAtMs: null,
    halfOpenAttemptsRemaining: 0
  };
}

// server/modules/zenny/infrastructure/backoff/exponentialBackoff.ts
var DEFAULT_BACKOFF_CONFIG = {
  initialDelayMs: 1e3,
  maxDelayMs: 3e4,
  multiplier: 2,
  maxAttempts: 5
};
function calculateBackoffDelay(attempt, config = DEFAULT_BACKOFF_CONFIG) {
  if (attempt < 1) return 0;
  const raw = config.initialDelayMs * Math.pow(config.multiplier, attempt - 1);
  return Math.min(raw, config.maxDelayMs);
}
function shouldRetry(attempt, config = DEFAULT_BACKOFF_CONFIG) {
  if (config.maxAttempts === 0) return true;
  return attempt < config.maxAttempts;
}

// server/modules/zenny/infrastructure/binance/rest/restErrors.ts
var RestRequestError = class extends Error {
  constructor(message, endpoint, status, cause) {
    super(message);
    this.endpoint = endpoint;
    this.status = status;
    this.cause = cause;
    this.name = "RestRequestError";
  }
};
var CircuitOpenError = class extends RestRequestError {
  constructor(endpoint) {
    super(`Circuit breaker open for ${endpoint}`, endpoint, null);
    this.name = "CircuitOpenError";
  }
};

// server/modules/zenny/infrastructure/binance/rest/makeRestRequest.ts
async function makeRestRequest(input, deps) {
  const backoffConfig = input.backoffConfig ?? DEFAULT_BACKOFF_CONFIG;
  let attempt = 0;
  let lastError;
  while (true) {
    attempt += 1;
    deps.breaker.state = advanceBreaker(deps.breaker.state, deps.nowMs());
    if (!canRequest(deps.breaker.state)) {
      throw new CircuitOpenError(input.endpoint);
    }
    const reservation = tryConsume({
      state: deps.rateLimiter.state,
      cost: input.weightCost,
      nowMs: deps.nowMs()
    });
    if (!reservation.granted) {
      await deps.sleep(reservation.msUntilAvailable);
      deps.rateLimiter.state = reservation.state;
      attempt -= 1;
      continue;
    }
    deps.rateLimiter.state = reservation.state;
    const startMs = deps.nowMs();
    let success = false;
    let responseCode = null;
    let errorMessage = null;
    try {
      const response = await deps.fetchFn(input.url, {
        method: input.method ?? "GET",
        headers: input.headers,
        body: input.body
      });
      responseCode = response.status;
      if (!response.ok) {
        const text2 = await response.text().catch(() => "");
        if (response.status === 429 || response.status === 418) {
          deps.breaker.state = recordFailure(deps.breaker.state, deps.nowMs());
          throw new RestRequestError(
            `Rate limited: ${response.status} ${text2}`,
            input.endpoint,
            response.status
          );
        }
        if (response.status >= 500) {
          deps.breaker.state = recordFailure(deps.breaker.state, deps.nowMs());
          throw new RestRequestError(
            `Server error: ${response.status} ${text2}`,
            input.endpoint,
            response.status
          );
        }
        throw new RestRequestError(
          `Client error: ${response.status} ${text2}`,
          input.endpoint,
          response.status
        );
      }
      const data = await response.json();
      deps.breaker.state = recordSuccess(deps.breaker.state);
      success = true;
      return data;
    } catch (e) {
      lastError = e;
      errorMessage = e instanceof Error ? e.message : String(e);
      if (e instanceof RestRequestError && e.status !== null && e.status >= 400 && e.status < 500 && e.status !== 429 && e.status !== 418) {
        throw e;
      }
      if (!shouldRetry(attempt, backoffConfig)) {
        throw new RestRequestError(
          `Exhausted ${attempt} attempts: ${errorMessage}`,
          input.endpoint,
          responseCode,
          e
        );
      }
      const delay = calculateBackoffDelay(attempt, backoffConfig);
      await deps.sleep(delay);
    } finally {
      const durationMs = deps.nowMs() - startMs;
      if (deps.onApiCall) {
        deps.onApiCall({
          endpoint: input.endpoint,
          method: input.method ?? "GET",
          weightCost: input.weightCost,
          startMs,
          durationMs,
          success,
          responseCode,
          errorMessage
        });
      }
    }
  }
}

// server/modules/zenny/infrastructure/binance/rest/fetchKlinesRest.ts
var BINANCE_FUTURES_BASE = "https://fapi.binance.com";
var TIMEFRAME_TO_BINANCE = {
  "15m": "15m",
  "1H": "1h",
  "4H": "4h",
  "12H": "12h",
  D: "1d",
  W: "1w",
  M: "1M"
};
async function fetchKlinesRest(input, deps) {
  const interval = TIMEFRAME_TO_BINANCE[input.timeframe];
  const params = new URLSearchParams({
    symbol: input.symbol.toUpperCase(),
    interval,
    limit: String(Math.min(input.limit, 1500))
  });
  if (input.endTimeMs !== void 0) {
    params.set("endTime", String(input.endTimeMs));
  }
  const url = `${BINANCE_FUTURES_BASE}/fapi/v1/klines?${params.toString()}`;
  const weightCost = input.limit <= 100 ? 1 : input.limit <= 500 ? 2 : input.limit <= 1e3 ? 5 : 10;
  const rows = await makeRestRequest(
    {
      url,
      method: "GET",
      weightCost,
      endpoint: "GET /fapi/v1/klines"
    },
    deps
  );
  return rows.map(
    (r) => ({
      openTime: r[0],
      open: parseFloat(r[1]),
      high: parseFloat(r[2]),
      low: parseFloat(r[3]),
      close: parseFloat(r[4]),
      volume: parseFloat(r[5]),
      closeTime: r[6]
    })
  );
}

// server/modules/zenny/infrastructure/binance/rest/fetchDepthRest.ts
var BINANCE_FUTURES_BASE2 = "https://fapi.binance.com";
function weightForLimit(limit) {
  if (limit <= 50) return 2;
  if (limit <= 100) return 5;
  if (limit <= 500) return 10;
  return 20;
}
async function fetchDepthRest(input, deps) {
  const limit = input.limit ?? 1e3;
  const params = new URLSearchParams({
    symbol: input.symbol.toUpperCase(),
    limit: String(limit)
  });
  const url = `${BINANCE_FUTURES_BASE2}/fapi/v1/depth?${params.toString()}`;
  const resp = await makeRestRequest(
    {
      url,
      method: "GET",
      weightCost: weightForLimit(limit),
      endpoint: "GET /fapi/v1/depth"
    },
    deps
  );
  return {
    symbol: input.symbol.toUpperCase(),
    lastUpdateId: resp.lastUpdateId,
    fetchedAtMs: deps.nowMs(),
    bids: resp.bids.map(([p, q]) => [parseFloat(p), parseFloat(q)]),
    asks: resp.asks.map(([p, q]) => [parseFloat(p), parseFloat(q)])
  };
}

// server/modules/zenny/infrastructure/rateLimiter/createTokenBucket.ts
function createTokenBucket(input) {
  return {
    capacity: input.capacity,
    tokens: input.initialTokens ?? input.capacity,
    refillPerMs: input.refillPerMinute / 6e4,
    lastRefillMs: input.nowMs
  };
}

// server/modules/zenny/infrastructure/circuitBreaker/createBreaker.ts
function createBreaker(input) {
  return {
    status: "closed",
    consecutiveFailures: 0,
    failureThreshold: input.failureThreshold,
    openedAtMs: null,
    openDurationMs: input.openDurationMs,
    halfOpenAttemptsRemaining: 0,
    halfOpenAttemptBudget: input.halfOpenAttemptBudget
  };
}

// server/modules/zenny/infrastructure/providers/binanceProvider.ts
var BinanceProvider = class {
  name = "binance";
  cache;
  rateLimiter;
  breaker;
  restDeps;
  apiCallLog = [];
  constructor(config) {
    this.cache = new CandleCache();
    this.rateLimiter = {
      state: createTokenBucket({
        capacity: Math.floor(
          config.binanceWeightBudgetPerMinute * config.weightBudgetUtilizationCap
        ),
        refillPerMinute: Math.floor(
          config.binanceWeightBudgetPerMinute * config.weightBudgetUtilizationCap
        ),
        nowMs: Date.now()
      })
    };
    this.breaker = {
      state: createBreaker({
        failureThreshold: config.circuitBreakerFailureThreshold,
        openDurationMs: config.circuitBreakerOpenDurationMs,
        halfOpenAttemptBudget: config.circuitBreakerHalfOpenAttempts
      })
    };
    this.restDeps = {
      fetchFn: globalThis.fetch.bind(globalThis),
      nowMs: () => Date.now(),
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
      rateLimiter: this.rateLimiter,
      breaker: this.breaker,
      onApiCall: (rec) => {
        this.apiCallLog.push(rec);
        if (this.apiCallLog.length > 1e3) {
          this.apiCallLog.splice(0, this.apiCallLog.length - 1e3);
        }
      }
    };
  }
  async getOrderBookDepth(query) {
    return fetchDepthRest(
      { symbol: query.symbol, limit: query.limit ?? 1e3 },
      this.restDeps
    );
  }
  async getCandles(query) {
    if (query.endTimeMs === void 0) {
      const cached = this.cache.read(
        query.symbol,
        query.timeframe,
        query.count,
        this.restDeps.nowMs()
      );
      if (cached !== null) return cached;
    }
    const fresh = await fetchKlinesRest(
      {
        symbol: query.symbol,
        timeframe: query.timeframe,
        limit: query.count,
        endTimeMs: query.endTimeMs
      },
      this.restDeps
    );
    this.cache.write(query.symbol, query.timeframe, fresh);
    return fresh;
  }
  // Diagnostics for Panel 6
  getApiCallLog() {
    return this.apiCallLog;
  }
  getRateLimiterState() {
    return this.rateLimiter.state;
  }
  getBreakerState() {
    return this.breaker.state;
  }
};

// server/modules/zenny/infrastructure/types.ts
var DEFAULT_INFRASTRUCTURE_CONFIG = {
  binanceWeightBudgetPerMinute: 2400,
  weightBudgetUtilizationCap: 0.8,
  weightBudgetAlertThreshold: 0.7,
  circuitBreakerFailureThreshold: 5,
  circuitBreakerOpenDurationMs: 3e4,
  circuitBreakerHalfOpenAttempts: 1,
  backoffInitialDelayMs: 1e3,
  backoffMaxDelayMs: 3e4,
  backoffMultiplier: 2,
  backoffMaxAttempts: 5,
  wsHeartbeatIntervalMs: 2e4,
  wsMaxStreamsPerConnection: 1024,
  wsConnectionMaxLifetimeMs: 828e5,
  wsReconnectInitialDelayMs: 1e3,
  candleCacheTtlLiveMs: 6e4,
  depthSnapshotRefreshMs: 3e5,
  fundingCacheTtlMs: 288e5,
  exchangeInfoCacheTtlMs: 36e5,
  // Binance Futures REST weights (https://binance-docs.github.io/apidocs/futures/en/)
  endpointWeights: {
    "GET /fapi/v1/klines": 2,
    // limit <= 100 = 1, > 100 = 2
    "GET /fapi/v1/depth": 10,
    // limit 500 = 10
    "GET /fapi/v1/fundingRate": 1,
    "GET /fapi/v1/exchangeInfo": 1
  },
  watchedSymbols: ["BTCUSDT"],
  activeProvider: "binance"
};

// shared/zennyTypes.ts
var DEFAULT_TIMEFRAME_STACK = [
  "15m",
  "1H",
  "4H",
  "D",
  "W",
  "M"
];
var TF_BAR_DURATION_MS = {
  "15m": 15 * 60 * 1e3,
  "1H": 60 * 60 * 1e3,
  "4H": 4 * 60 * 60 * 1e3,
  "12H": 12 * 60 * 60 * 1e3,
  D: 24 * 60 * 60 * 1e3,
  W: 7 * 24 * 60 * 60 * 1e3,
  M: 30 * 24 * 60 * 60 * 1e3
};

// server/modules/zenny/analysis/data/getCandles.ts
async function getCandles(provider, query) {
  return provider.getCandles(query);
}

// server/modules/zenny/analysis/level/findBodyPivots.ts
function bodyHigh(c) {
  return c.open > c.close ? c.open : c.close;
}
function bodyLow(c) {
  return c.open < c.close ? c.open : c.close;
}
function findBodyPivots(input) {
  const { candles } = input;
  const n = input.n ?? 2;
  const pivots = [];
  if (candles.length < n * 2 + 1) return pivots;
  for (let i = n; i < candles.length - n; i++) {
    const c = candles[i];
    let isHigh = true;
    let isLow = true;
    for (let j = i - n; j <= i + n; j++) {
      if (j === i) continue;
      const o = candles[j];
      if (j < i) {
        if (o.high > c.high) isHigh = false;
        if (o.low < c.low) isLow = false;
      } else {
        if (o.high >= c.high) isHigh = false;
        if (o.low <= c.low) isLow = false;
      }
      if (!isHigh && !isLow) break;
    }
    if (isHigh) {
      let aggregateBodyHigh = bodyHigh(c);
      let aggregateHigh = c.high;
      for (let j = i - 1; j >= Math.max(0, i - n); j--) {
        if (candles[j].high !== c.high) break;
        aggregateBodyHigh = Math.max(aggregateBodyHigh, bodyHigh(candles[j]));
        aggregateHigh = Math.max(aggregateHigh, candles[j].high);
      }
      pivots.push({
        index: i,
        side: "RESISTANCE",
        price: aggregateBodyHigh,
        wickPrice: aggregateHigh,
        candleOpenTime: c.openTime
      });
    } else if (isLow) {
      let aggregateBodyLow = bodyLow(c);
      let aggregateLow = c.low;
      for (let j = i - 1; j >= Math.max(0, i - n); j--) {
        if (candles[j].low !== c.low) break;
        aggregateBodyLow = Math.min(aggregateBodyLow, bodyLow(candles[j]));
        aggregateLow = Math.min(aggregateLow, candles[j].low);
      }
      pivots.push({
        index: i,
        side: "SUPPORT",
        price: aggregateBodyLow,
        wickPrice: aggregateLow,
        candleOpenTime: c.openTime
      });
    }
  }
  return pivots;
}

// server/modules/zenny/analysis/level/isLevelBroken.ts
function isLevelBroken(candles, pivot) {
  for (let i = pivot.index + 1; i < candles.length; i++) {
    const close = candles[i].close;
    if (pivot.side === "RESISTANCE" && close > pivot.price) {
      return {
        broken: true,
        breakCandleIndex: i,
        breakCandleOpenTime: candles[i].openTime
      };
    }
    if (pivot.side === "SUPPORT" && close < pivot.price) {
      return {
        broken: true,
        breakCandleIndex: i,
        breakCandleOpenTime: candles[i].openTime
      };
    }
  }
  return { broken: false, breakCandleIndex: null, breakCandleOpenTime: null };
}

// server/modules/zenny/analysis/level/findBodyClusters.ts
function bodyHigh2(c) {
  return c.open > c.close ? c.open : c.close;
}
function bodyLow2(c) {
  return c.open < c.close ? c.open : c.close;
}
function findBodyClusters(input) {
  const candles = input.candles;
  const tolerancePct = input.tolerancePct ?? 4e-3;
  const minTouches = input.minTouches ?? 3;
  if (candles.length === 0) return [];
  return [
    ...clusterOneSide(candles, "RESISTANCE", tolerancePct, minTouches),
    ...clusterOneSide(candles, "SUPPORT", tolerancePct, minTouches)
  ];
}
function clusterOneSide(candles, side, tolerancePct, minTouches) {
  const extreme = side === "RESISTANCE" ? bodyHigh2 : bodyLow2;
  const points = candles.map(
    (c, i) => ({ price: extreme(c), index: i })
  );
  points.sort((a, b) => a.price - b.price);
  const candidates = [];
  for (let start = 0; start < points.length; start++) {
    const indexes = /* @__PURE__ */ new Set();
    for (let end = start; end < points.length; end++) {
      const window = points.slice(start, end + 1);
      if (!withinToleranceWindow(window, tolerancePct)) break;
      indexes.add(points[end].index);
      if (indexes.size < minTouches) continue;
      candidates.push({
        start,
        end,
        prices: window.map((p) => p.price),
        indexes: [...indexes],
        spanPct: spanPct(window)
      });
    }
  }
  candidates.sort((a, b) => {
    const touchDelta = b.indexes.length - a.indexes.length;
    if (touchDelta !== 0) return touchDelta;
    const spanDelta = a.spanPct - b.spanPct;
    if (spanDelta !== 0) return spanDelta;
    return lastIndex(b) - lastIndex(a);
  });
  const accepted = [];
  for (const candidate of candidates) {
    if (accepted.some(
      (existing) => priceWindowsOverlap(candidate, existing, points, tolerancePct)
    )) {
      continue;
    }
    accepted.push(candidate);
  }
  return accepted.sort((a, b) => firstIndex(a) - firstIndex(b)).map((candidate) => toBodyCluster(candidate, candles, side));
}
function withinToleranceWindow(points, tolerancePct) {
  if (points.length === 0) return false;
  return spanPct(points) <= tolerancePct;
}
function spanPct(points) {
  if (points.length <= 1) return 0;
  const low = points[0].price;
  const high = points[points.length - 1].price;
  const mid = (low + high) / 2;
  return mid > 0 ? (high - low) / mid : 0;
}
function priceWindowsOverlap(a, b, points, tolerancePct) {
  const aLow = points[a.start].price;
  const aHigh = points[a.end].price;
  const bLow = points[b.start].price;
  const bHigh = points[b.end].price;
  if (aHigh < bLow) {
    const mid = (aHigh + bLow) / 2;
    return mid > 0 && (bLow - aHigh) / mid <= tolerancePct;
  }
  if (bHigh < aLow) {
    const mid = (bHigh + aLow) / 2;
    return mid > 0 && (aLow - bHigh) / mid <= tolerancePct;
  }
  return true;
}
function toBodyCluster(candidate, candles, side) {
  const sortedPrices = [...candidate.prices].sort((a, b) => a - b);
  const median2 = sortedPrices[Math.floor(sortedPrices.length / 2)];
  const sortedIndexes = [...candidate.indexes].sort((a, b) => a - b);
  const first = sortedIndexes[0];
  const last = sortedIndexes[sortedIndexes.length - 1];
  return {
    price: median2,
    side,
    touchCount: sortedIndexes.length,
    firstTouchIndex: first,
    lastTouchIndex: last,
    firstTouchOpenTime: candles[first].openTime,
    lastTouchOpenTime: candles[last].openTime
  };
}
function firstIndex(candidate) {
  return Math.min(...candidate.indexes);
}
function lastIndex(candidate) {
  return Math.max(...candidate.indexes);
}

// server/modules/zenny/analysis/level/levelStrength.ts
var TF_BASE = {
  "15m": 0,
  "1H": 1,
  "4H": 2,
  "12H": 2,
  D: 3,
  W: 4,
  M: 5
};
function levelStrength(input) {
  const base = TF_BASE[input.sourceTimeframe] ?? 0;
  const recencyBoost = input.recency >= 0.7 ? 1 : 0;
  const primaryBoost = input.isPrimaryTimeframe ? 1 : 0;
  const score = base + recencyBoost + primaryBoost;
  if (score <= 0) return "trivial";
  if (score === 1) return "weak";
  if (score <= 3) return "medium";
  if (score <= 5) return "strong";
  return "very_strong";
}

// server/modules/zenny/analysis/pool/pullPass.ts
var DEFAULT_PULL_PASS_CONFIG = {
  enabled: true,
  distanceFloor: 0.1,
  decayRate: 0.95,
  minPullFloor: 5
};
function runPullPass(input, config = DEFAULT_PULL_PASS_CONFIG) {
  const results = /* @__PURE__ */ new Map();
  if (!config.enabled) return results;
  if (input.primaryCandles.length === 0) return results;
  const currentPrice = input.primaryCandles[input.primaryCandles.length - 1].close;
  if (currentPrice <= 0) return results;
  const raws = /* @__PURE__ */ new Map();
  const dists = /* @__PURE__ */ new Map();
  const decayCounters = /* @__PURE__ */ new Map();
  const standIns = /* @__PURE__ */ new Map();
  for (const pool2 of input.pools) {
    if (pool2.status !== "active") continue;
    const distancePct = Math.abs(currentPrice - pool2.centreLine) / currentPrice * 100;
    const sEffective = sEffectiveStandIn(pool2.strength);
    const raw = sEffective / (distancePct + config.distanceFloor);
    raws.set(pool2.id, raw);
    dists.set(pool2.id, distancePct);
    standIns.set(pool2.id, sEffective);
    decayCounters.set(
      pool2.id,
      computeCandlesMovingAway(pool2, input.primaryCandles)
    );
  }
  if (raws.size === 0) return results;
  let maxRaw = 0;
  for (const v of raws.values()) {
    if (v > maxRaw) maxRaw = v;
  }
  if (maxRaw <= 0) return results;
  for (const [poolId, raw] of raws) {
    const normalized = raw / maxRaw * 100;
    const cma = decayCounters.get(poolId) ?? 0;
    const decayed = Math.max(
      config.minPullFloor,
      normalized * Math.pow(config.decayRate, cma)
    );
    results.set(poolId, {
      raw,
      normalized,
      decayed,
      distancePct: dists.get(poolId) ?? 0,
      candlesMovingAway: cma,
      sEffectiveStandIn: standIns.get(poolId) ?? 0
    });
  }
  return results;
}
function sEffectiveStandIn(strength) {
  switch (strength) {
    case "trivial":
      return 20;
    case "weak":
      return 40;
    case "medium":
      return 60;
    case "strong":
      return 80;
    case "very_strong":
      return 95;
    default:
      return 50;
  }
}
function computeCandlesMovingAway(pool2, candles) {
  if (candles.length === 0) return 0;
  const startIdxRaw = pool2.birthCandleIndexOnPrimary;
  const startIdx = startIdxRaw < 0 ? 0 : Math.min(startIdxRaw, candles.length - 1);
  if (startIdx >= candles.length - 1) return 0;
  let counter = 0;
  let prevDistance = Math.abs(candles[startIdx].close - pool2.centreLine);
  for (let i = startIdx + 1; i < candles.length; i++) {
    const d = Math.abs(candles[i].close - pool2.centreLine);
    if (d > prevDistance) counter++;
    else if (d < prevDistance) counter = 0;
    prevDistance = d;
  }
  return counter;
}

// server/modules/zenny/analysis/arms/extractArms.ts
var ARM_MINIMUM_PULL = 15;
function extractArms(input) {
  if (!Number.isFinite(input.currentPrice) || input.currentPrice <= 0) {
    return { upper: null, lower: null, dominantSide: "neither" };
  }
  let upperBest = null;
  let upperBestPull = -Infinity;
  let lowerBest = null;
  let lowerBestPull = -Infinity;
  for (const pool2 of input.pools) {
    if (pool2.status !== "active") continue;
    if (pool2.pull == null) continue;
    if (pool2.pull.decayed < ARM_MINIMUM_PULL) continue;
    const aboveCurrent = pool2.centreLine > input.currentPrice;
    if (aboveCurrent) {
      if (pool2.pull.decayed > upperBestPull) {
        upperBest = pool2;
        upperBestPull = pool2.pull.decayed;
      }
    } else {
      if (pool2.pull.decayed > lowerBestPull) {
        lowerBest = pool2;
        lowerBestPull = pool2.pull.decayed;
      }
    }
  }
  const upperArm = upperBest ? {
    side: "upper",
    pool: upperBest,
    pullDecayed: upperBestPull,
    role: "subordinate"
    // overwritten below
  } : null;
  const lowerArm = lowerBest ? {
    side: "lower",
    pool: lowerBest,
    pullDecayed: lowerBestPull,
    role: "subordinate"
  } : null;
  let dominantSide = "neither";
  if (upperArm && lowerArm) {
    if (upperArm.pullDecayed > lowerArm.pullDecayed) {
      upperArm.role = "dominant";
      lowerArm.role = "subordinate";
      dominantSide = "upper";
    } else if (lowerArm.pullDecayed > upperArm.pullDecayed) {
      lowerArm.role = "dominant";
      upperArm.role = "subordinate";
      dominantSide = "lower";
    } else {
      upperArm.role = "equal";
      lowerArm.role = "equal";
      dominantSide = "neither";
    }
  } else if (upperArm) {
    upperArm.role = "dominant";
    dominantSide = "upper";
  } else if (lowerArm) {
    lowerArm.role = "dominant";
    dominantSide = "lower";
  }
  return { upper: upperArm, lower: lowerArm, dominantSide };
}

// server/modules/zenny/analysis/liquidity/findLiquidityPools.ts
function findLiquidityPools(input) {
  return findDepletedWickPools(input);
}
function findDepletedWickPools(input) {
  const candles = input.candles;
  const depletionCandles = input.depletionCandles ?? candles;
  if (candles.length < 2) return [];
  const ranges = candles.map((c) => c.high - c.low).filter((r) => r > 0);
  if (ranges.length === 0) return [];
  const medianRange = median(ranges);
  const candidates = [];
  for (let sourceIndex = candles.length - 2; sourceIndex >= 0; sourceIndex--) {
    const candle = candles[sourceIndex];
    const range = candle.high - candle.low;
    if (range <= 0) continue;
    const highBody = bodyHigh3(candle);
    const lowBody = bodyLow3(candle);
    const upperProbe = candle.high - highBody;
    const lowerProbe = lowBody - candle.low;
    const minProbe = Math.max(medianRange * 0.2, candle.close * 8e-4);
    if (upperProbe >= minProbe && upperProbe / range >= 0.28 && isLocalRangeEdge(candles, sourceIndex, "RESISTANCE", 8, 2, 8e-4)) {
      const remaining = remainingResistanceZone({
        zoneLow: highBody,
        zoneHigh: candle.high,
        sourceIndex,
        sourceOpenTime: candle.openTime,
        depletionCandles,
        sameTimeframe: depletionCandles === candles
      });
      if (remaining !== null) {
        candidates.push({
          idSeed: `${input.symbol}-${input.timeframe}-wick-res-${sourceIndex}`,
          kind: "pivot_probe",
          side: "RESISTANCE",
          targetPrice: remaining.zoneLow,
          zoneHigh: remaining.zoneHigh,
          zoneLow: remaining.zoneLow,
          sourceIndex,
          sourceOpenTime: candle.openTime,
          touchCount: 1
        });
      }
    }
    if (lowerProbe >= minProbe && lowerProbe / range >= 0.28 && isLocalRangeEdge(candles, sourceIndex, "SUPPORT", 8, 2, 8e-4)) {
      const remaining = remainingSupportZone({
        zoneHigh: lowBody,
        zoneLow: candle.low,
        sourceIndex,
        sourceOpenTime: candle.openTime,
        depletionCandles,
        sameTimeframe: depletionCandles === candles
      });
      if (remaining !== null) {
        candidates.push({
          idSeed: `${input.symbol}-${input.timeframe}-wick-sup-${sourceIndex}`,
          kind: "pivot_probe",
          side: "SUPPORT",
          targetPrice: remaining.zoneHigh,
          zoneHigh: remaining.zoneHigh,
          zoneLow: remaining.zoneLow,
          sourceIndex,
          sourceOpenTime: candle.openTime,
          touchCount: 1
        });
      }
    }
  }
  return dedupeCandidates(
    keepBestByPrice(candidates, 8e-4).sort(
      (a, b) => a.sourceIndex - b.sourceIndex
    )
  );
}
function remainingResistanceZone(zone) {
  let remainingLow = zone.zoneLow;
  const candlesToRight = zone.sameTimeframe ? zone.depletionCandles.slice(zone.sourceIndex + 1) : zone.depletionCandles.filter(
    (candle) => candle.openTime > zone.sourceOpenTime
  );
  for (const candle of candlesToRight) {
    const high = candle.high;
    if (high >= zone.zoneHigh) return null;
    if (high > remainingLow) remainingLow = high;
  }
  return remainingLow < zone.zoneHigh ? { zoneLow: remainingLow, zoneHigh: zone.zoneHigh } : null;
}
function remainingSupportZone(zone) {
  let remainingHigh = zone.zoneHigh;
  const candlesToRight = zone.sameTimeframe ? zone.depletionCandles.slice(zone.sourceIndex + 1) : zone.depletionCandles.filter(
    (candle) => candle.openTime > zone.sourceOpenTime
  );
  for (const candle of candlesToRight) {
    const low = candle.low;
    if (low <= zone.zoneLow) return null;
    if (low < remainingHigh) remainingHigh = low;
  }
  return zone.zoneLow < remainingHigh ? { zoneLow: zone.zoneLow, zoneHigh: remainingHigh } : null;
}
function isLocalRangeEdge(candles, index2, side, lookback, lookahead, tolerancePct = 0) {
  const candle = candles[index2];
  if (!candle) return false;
  const from = Math.max(0, index2 - lookback);
  const to = Math.min(candles.length - 1, index2 + lookahead);
  for (let i = from; i <= to; i++) {
    if (i === index2) continue;
    if (side === "RESISTANCE" && candles[i].high > candle.high && Math.abs(candles[i].high - candle.high) / candle.high > tolerancePct) {
      return false;
    }
    if (side === "SUPPORT" && candles[i].low < candle.low && Math.abs(candles[i].low - candle.low) / candle.low > tolerancePct) {
      return false;
    }
  }
  return true;
}
function bodyHigh3(c) {
  return c.open > c.close ? c.open : c.close;
}
function bodyLow3(c) {
  return c.open < c.close ? c.open : c.close;
}
function keepBestByPrice(candidates, tolerancePct) {
  const sorted = [...candidates].sort((a, b) => {
    const touches = b.touchCount - a.touchCount;
    if (touches !== 0) return touches;
    return b.sourceIndex - a.sourceIndex;
  });
  const accepted = [];
  for (const candidate of sorted) {
    const overlaps = accepted.some((existing) => {
      if (existing.side !== candidate.side) return false;
      const mid = (existing.targetPrice + candidate.targetPrice) / 2;
      return mid > 0 && Math.abs(existing.targetPrice - candidate.targetPrice) / mid <= tolerancePct;
    });
    if (!overlaps) accepted.push(candidate);
  }
  return accepted.sort((a, b) => a.sourceIndex - b.sourceIndex);
}
function dedupeCandidates(candidates) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const candidate of candidates) {
    const key = `${candidate.kind}-${candidate.side}-${Math.round(candidate.targetPrice * 100)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(candidate);
  }
  return out;
}
function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

// shared/zennyBraidDefaults.ts
var DEFAULT_BRAID_TIMEFRAME = "1H";
var DEFAULT_BRAID_COUNT_BY_TIMEFRAME = {
  "15m": 500,
  "1H": 300,
  "4H": 250,
  "12H": 240,
  D: 220,
  W: 180,
  M: 120
};
var DEFAULT_BRAID_COUNT = DEFAULT_BRAID_COUNT_BY_TIMEFRAME[DEFAULT_BRAID_TIMEFRAME];
var DEFAULT_PASS_CONFIG_BY_TIMEFRAME = {
  "15m": makeLiquidityPoolPassConfig({
    halfLifeCandles: 120,
    touchTolerancePct: 18e-4,
    reversalPct: 8e-3,
    lastLegTolerancePct: 35e-4
  }),
  "1H": makeLiquidityPoolPassConfig({
    halfLifeCandles: 75,
    touchTolerancePct: 25e-4,
    reversalPct: 0.015,
    lastLegTolerancePct: 6e-3
  }),
  "4H": makeLiquidityPoolPassConfig({
    halfLifeCandles: 60,
    touchTolerancePct: 35e-4,
    reversalPct: 0.025,
    lastLegTolerancePct: 85e-4
  }),
  "12H": makeLiquidityPoolPassConfig({
    halfLifeCandles: 50,
    touchTolerancePct: 42e-4,
    reversalPct: 0.035,
    lastLegTolerancePct: 0.01
  }),
  D: makeLiquidityPoolPassConfig({
    halfLifeCandles: 45,
    touchTolerancePct: 5e-3,
    reversalPct: 0.05,
    lastLegTolerancePct: 0.012
  }),
  W: makeLiquidityPoolPassConfig({
    halfLifeCandles: 30,
    touchTolerancePct: 8e-3,
    reversalPct: 0.1,
    lastLegTolerancePct: 0.02
  }),
  M: makeLiquidityPoolPassConfig({
    halfLifeCandles: 18,
    touchTolerancePct: 0.012,
    reversalPct: 0.18,
    lastLegTolerancePct: 0.035
  })
};
var DEFAULT_PASS_CONFIG = DEFAULT_PASS_CONFIG_BY_TIMEFRAME[DEFAULT_BRAID_TIMEFRAME];
function getDefaultBraidCountForTimeframe(timeframe) {
  return DEFAULT_BRAID_COUNT_BY_TIMEFRAME[timeframe] ?? DEFAULT_BRAID_COUNT_BY_TIMEFRAME[DEFAULT_BRAID_TIMEFRAME];
}
function getDefaultPassConfigForTimeframe(timeframe) {
  return clonePassConfig(
    DEFAULT_PASS_CONFIG_BY_TIMEFRAME[timeframe] ?? DEFAULT_PASS_CONFIG
  );
}
function makeLiquidityPoolPassConfig(profile) {
  return {
    recency: {
      enabled: true,
      curve: "exponential",
      halfLifeCandles: profile.halfLifeCandles,
      threshold: 0.25
    },
    touchCount: {
      enabled: true,
      lookforwardCandles: 0,
      tolerancePct: profile.touchTolerancePct
    },
    lastLeg: {
      enabled: true,
      reversalPct: profile.reversalPct,
      tolerancePct: profile.lastLegTolerancePct,
      lastN: 3
    },
    polarityFlip: {
      enabled: true
    },
    aggregate: {
      enabled: true,
      weightRecency: 0.25,
      weightLastLeg: 0.45,
      weightTouchCount: 0.3,
      brokenPenalty: 0.15,
      // Reset/default is a recovery view: score everything, hide nothing.
      strengthThreshold: 0
    },
    // N=14 stays constant across TFs (matches RSI/ADX/Wilder convention).
    // The TF-invariance comes from volatility normalisation in the slope
    // formula, not from per-TF N. k=1 sets RANGING/TRENDING/BREAKOUT
    // thresholds at standard statistical multiples of σ.
    wireAngle: {
      enabled: true,
      lookbackCandles: 14,
      dwellBarsRequired: 3,
      volNormalisationK: 1
    }
  };
}
function clonePassConfig(config) {
  return {
    recency: { ...config.recency },
    touchCount: { ...config.touchCount },
    lastLeg: { ...config.lastLeg },
    polarityFlip: { ...config.polarityFlip },
    aggregate: { ...config.aggregate },
    wireAngle: { ...config.wireAngle }
  };
}

// server/modules/zenny/analysis/passes/types.ts
var DEFAULT_PASS_CONFIG2 = DEFAULT_PASS_CONFIG;
function getDefaultPassConfigForTimeframe2(timeframe) {
  return getDefaultPassConfigForTimeframe(timeframe);
}

// server/modules/zenny/analysis/passes/recencyPass.ts
function runRecencyPass(input, config) {
  const results = /* @__PURE__ */ new Map();
  if (!config.enabled) return results;
  const totalCandles = input.primaryCandles.length;
  if (totalCandles === 0) return results;
  for (const level of input.levels) {
    const value = scoreRecency(level, totalCandles, config);
    const wouldFilter = value < config.threshold;
    results.set(level.id, { value, wouldFilter });
  }
  return results;
}
function scoreRecency(level, totalCandles, config) {
  if (config.curve === "linear") {
    return Math.max(0, Math.min(1, level.recency));
  }
  if (level.swingCandleIndexOnPrimary < 0) return 0;
  const fromRightEdge = totalCandles - 1 - level.swingCandleIndexOnPrimary;
  const halfLife = Math.max(1, config.halfLifeCandles);
  const score = Math.pow(0.5, fromRightEdge / halfLife);
  return Math.max(0, Math.min(1, score));
}

// server/modules/zenny/analysis/passes/touchCountPass.ts
function runTouchCountPass(input, config) {
  const results = /* @__PURE__ */ new Map();
  if (!config.enabled) return results;
  for (const level of input.levels) {
    const candles = input.perTfCandles.get(level.sourceTimeframe);
    if (!candles || candles.length === 0) {
      results.set(level.id, { value: 0 });
      continue;
    }
    const startIdx = candles.findIndex(
      (c) => c.openTime === level.swingCandleTime
    );
    if (startIdx < 0) {
      results.set(level.id, { value: 0 });
      continue;
    }
    const lookforward = config.lookforwardCandles > 0 ? Math.min(candles.length - 1, startIdx + config.lookforwardCandles) : candles.length - 1;
    const inZone = (c) => {
      if (level.side === "RESISTANCE") {
        return c.high >= level.price * (1 - config.tolerancePct);
      }
      return c.low <= level.price * (1 + config.tolerancePct);
    };
    let count = 0;
    let prevInZone = true;
    for (let i = startIdx + 1; i <= lookforward; i++) {
      const c = candles[i];
      if (level.side === "RESISTANCE" && c.close > level.price) break;
      if (level.side === "SUPPORT" && c.close < level.price) break;
      const cur = inZone(c);
      if (cur && !prevInZone) count += 1;
      prevInZone = cur;
    }
    results.set(level.id, { value: count });
  }
  return results;
}

// server/modules/zenny/analysis/passes/lastLegPass.ts
function findLastLegSwings(candles, reversalPct) {
  if (candles.length === 0) return [];
  let runMaxIdx = 0;
  let runMinIdx = 0;
  let direction = "up";
  const swings = [];
  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    if (direction === "up") {
      if (high > candles[runMaxIdx].high) runMaxIdx = i;
      const peak = candles[runMaxIdx].high;
      const dropPct = peak > 0 ? (peak - low) / peak : 0;
      if (dropPct >= reversalPct) {
        swings.push({
          type: "high",
          index: runMaxIdx,
          price: peak,
          openTime: candles[runMaxIdx].openTime
        });
        runMinIdx = i;
        direction = "down";
      }
    } else {
      if (low < candles[runMinIdx].low) runMinIdx = i;
      const trough = candles[runMinIdx].low;
      const risePct = trough > 0 ? (high - trough) / trough : 0;
      if (risePct >= reversalPct) {
        swings.push({
          type: "low",
          index: runMinIdx,
          price: trough,
          openTime: candles[runMinIdx].openTime
        });
        runMaxIdx = i;
        direction = "up";
      }
    }
  }
  if (direction === "up") {
    const peak = candles[runMaxIdx].high;
    swings.push({
      type: "high",
      index: runMaxIdx,
      price: peak,
      openTime: candles[runMaxIdx].openTime
    });
  } else {
    const trough = candles[runMinIdx].low;
    swings.push({
      type: "low",
      index: runMinIdx,
      price: trough,
      openTime: candles[runMinIdx].openTime
    });
  }
  return swings;
}
function runLastLegPass(input, config) {
  const results = /* @__PURE__ */ new Map();
  if (!config.enabled) return results;
  const allSwings = findLastLegSwings(
    input.primaryCandles,
    config.reversalPct
  );
  const lastN = Math.max(1, Math.floor(config.lastN));
  const swings = allSwings.slice(-lastN);
  if (swings.length === 0) return results;
  for (const level of input.levels) {
    let bestScore = 0;
    let bestSwing = null;
    for (const swing of swings) {
      const dist = swing.price > 0 ? Math.abs(level.price - swing.price) / swing.price : 1;
      const s = Math.max(0, 1 - dist / Math.max(1e-9, config.tolerancePct));
      if (s > bestScore) {
        bestScore = s;
        bestSwing = swing.type;
      }
    }
    results.set(level.id, {
      value: bestScore,
      nearestSwing: bestSwing,
      swingsConsidered: swings.length
    });
  }
  return results;
}

// server/modules/zenny/analysis/passes/aggregatePass.ts
function runAggregatePass(levels, config) {
  const results = /* @__PURE__ */ new Map();
  if (!config.enabled) return results;
  const contributors = [
    {
      name: "recency",
      enabled: true,
      weight: config.weightRecency,
      read: (l) => readNum(l.passes.recency, "value")
    },
    {
      name: "lastLeg",
      enabled: true,
      weight: config.weightLastLeg,
      read: (l) => readNum(l.passes.lastLeg, "value")
    },
    {
      name: "touchCount",
      enabled: true,
      weight: config.weightTouchCount,
      read: (l) => {
        const v = readNum(l.passes.touchCount, "value");
        if (v === null) return null;
        return Math.min(1, v / 3);
      }
    }
  ];
  for (const level of levels) {
    let weightedSum = 0;
    let totalWeight = 0;
    const used = [];
    for (const c of contributors) {
      if (!c.enabled || c.weight <= 0) continue;
      const v = c.read(level);
      if (v === null) continue;
      weightedSum += v * c.weight;
      totalWeight += c.weight;
      if (v > 0) used.push(c.name);
    }
    let score = totalWeight === 0 ? 0 : weightedSum / totalWeight;
    if (level.broken) score *= config.brokenPenalty;
    results.set(level.id, {
      score: Math.max(0, Math.min(1, score)),
      contributors: used
    });
  }
  return results;
}
function readNum(passResult, key) {
  if (passResult === null || passResult === void 0) return null;
  if (typeof passResult !== "object") return null;
  const v = passResult[key];
  return typeof v === "number" ? v : null;
}

// server/modules/zenny/analysis/passes/polarityFlipPass.ts
var RETEST_TOLERANCE_PCT = 15e-4;
function runPolarityFlipPass(input, config) {
  const results = /* @__PURE__ */ new Map();
  if (!config.enabled) return results;
  for (const level of input.levels) {
    const rawSourceCandles = input.perTfCandles.get(level.sourceTimeframe);
    const sourceCandles = rawSourceCandles && rawSourceCandles.length > 1 ? rawSourceCandles.slice(0, -1) : rawSourceCandles ?? [];
    const crossings = countCloseCrossings(level, sourceCandles);
    const effectiveSide = findConfirmedFlip(level, sourceCandles);
    const flipped = effectiveSide !== level.side;
    results.set(level.id, { effectiveSide, flipped, crossings });
  }
  return results;
}
function countCloseCrossings(level, sourceCandles) {
  const startIdx = sourceCandles.findIndex(
    (c) => c.openTime === level.swingCandleTime
  );
  if (startIdx < 0) return 0;
  let crossings = 0;
  let prevAbove = null;
  for (let i = startIdx + 1; i < sourceCandles.length; i++) {
    const above = sourceCandles[i].close > level.price;
    if (prevAbove !== null && above !== prevAbove) crossings += 1;
    prevAbove = above;
  }
  return crossings;
}
function findConfirmedFlip(level, sourceCandles) {
  const startIdx = sourceCandles.findIndex(
    (c) => c.openTime === level.swingCandleTime
  );
  if (startIdx < 0) return level.side;
  const tolerance = level.price * RETEST_TOLERANCE_PCT;
  if (level.side === "RESISTANCE") {
    const breakIdx2 = sourceCandles.findIndex(
      (c, i) => i > startIdx && c.close > level.price
    );
    if (breakIdx2 < 0) return level.side;
    const hasRetest2 = sourceCandles.some(
      (c, i) => i > breakIdx2 && c.low <= level.price + tolerance && c.close >= level.price
    );
    return hasRetest2 ? "SUPPORT" : level.side;
  }
  const breakIdx = sourceCandles.findIndex(
    (c, i) => i > startIdx && c.close < level.price
  );
  if (breakIdx < 0) return level.side;
  const hasRetest = sourceCandles.some(
    (c, i) => i > breakIdx && c.high >= level.price - tolerance && c.close <= level.price
  );
  return hasRetest ? "RESISTANCE" : level.side;
}

// server/modules/zenny/analysis/passes/wireAnglePass.ts
var BRACKET_NO_TRADE = 14;
var BRACKET_ACCUMULATION = 26.25;
var BRACKET_RANGING = 45;
var BRACKET_TRENDING = 63.75;
var FLAT_EPSILON_DEG = 0.5;
var BRACKET_RANK = {
  NO_TRADE: 0,
  ACCUMULATION: 1,
  RANGING: 2,
  TRENDING: 3,
  BREAKOUT: 4
};
function runWireAnglePass(input, config) {
  if (!config.enabled) return null;
  const N = Math.max(2, Math.floor(config.lookbackCandles));
  const dwellBarsRequired = Math.max(1, Math.floor(config.dwellBarsRequired));
  const k = config.volNormalisationK > 0 ? config.volNormalisationK : 1;
  const perTimeframe = {};
  for (const [tf, candles] of input.perTfCandles) {
    const info = computeAngleFor(candles, N, k);
    if (info === null) continue;
    const history = computePerBarRegime(candles, N, k);
    const dwell = computeDwell(history, dwellBarsRequired);
    perTimeframe[tf] = { info, dwell, history };
  }
  if (!perTimeframe[input.primaryTimeframe]) return null;
  const agreement = computeAgreement(
    perTimeframe[input.primaryTimeframe].info,
    input.primaryTimeframe,
    perTimeframe
  );
  return { perTimeframe, agreement };
}
function computeAngleFor(candles, N, k = 1) {
  const smoothed = smoothCloses(candles);
  if (smoothed.length < N) return null;
  const closeNow = smoothed[smoothed.length - 1];
  const closeNAgo = smoothed[smoothed.length - N];
  if (closeNAgo === 0) return null;
  const volPct = computeRealizedVolPct(candles, N);
  return makeInfo(closeNow, closeNAgo, N, volPct, k);
}
function computePerBarRegime(candles, N, k = 1) {
  const smoothed = smoothCloses(candles);
  if (smoothed.length < N) return [];
  const out = [];
  for (let s = N - 1; s < smoothed.length; s++) {
    const closeNow = smoothed[s];
    const closeNAgo = smoothed[s - (N - 1)];
    if (closeNAgo === 0) continue;
    const candleIndex = s + 2;
    const candlesUpToBar = candles.slice(0, candleIndex + 1);
    const volPct = computeRealizedVolPct(candlesUpToBar, N);
    const info = makeInfo(closeNow, closeNAgo, N, volPct, k);
    out.push({
      candleIndex,
      candleOpenTime: candles[candleIndex].openTime,
      angleDeg: info.angleDeg,
      bracket: info.gannBracket,
      direction: info.direction
    });
  }
  return out;
}
function computeDwell(history, dwellBarsRequired) {
  if (history.length === 0) {
    return {
      lockedBracket: "NO_TRADE",
      candidateBracket: "NO_TRADE",
      candidateBarsObserved: 0,
      dwellBarsRequired,
      pendingFlip: false
    };
  }
  const candidate = history[history.length - 1];
  let observed = 1;
  for (let i = history.length - 2; i >= 0; i--) {
    if (history[i].bracket === candidate.bracket) observed++;
    else break;
  }
  let lockedBracket = candidate.bracket;
  if (observed < dwellBarsRequired) {
    let i = history.length - observed - 1;
    while (i >= 0) {
      const runBracket = history[i].bracket;
      let runLen = 1;
      while (i - 1 >= 0 && history[i - 1].bracket === runBracket) {
        runLen++;
        i--;
      }
      if (runLen >= dwellBarsRequired) {
        lockedBracket = runBracket;
        break;
      }
      i--;
    }
  }
  return {
    lockedBracket,
    candidateBracket: candidate.bracket,
    candidateBarsObserved: observed,
    dwellBarsRequired,
    pendingFlip: lockedBracket !== candidate.bracket
  };
}
function computeAgreement(primary, primaryTf, perTimeframe) {
  const entries = Object.entries(perTimeframe);
  const totalAnalysed = entries.length;
  let matchingDirectionCount = 0;
  let alignedTradePermittedCount = 0;
  let weakestAlignedBracket = null;
  for (const [, regime] of entries) {
    const info = regime.info;
    if (info.direction === "flat" || primary.direction === "flat") continue;
    if (info.direction !== primary.direction) continue;
    matchingDirectionCount += 1;
    if (info.gannBracket === "RANGING" || info.gannBracket === "TRENDING" || info.gannBracket === "BREAKOUT") {
      alignedTradePermittedCount += 1;
    }
    if (weakestAlignedBracket === null || BRACKET_RANK[info.gannBracket] < BRACKET_RANK[weakestAlignedBracket]) {
      weakestAlignedBracket = info.gannBracket;
    }
  }
  let htfConfirms = "mixed";
  if (primary.direction !== "flat") {
    let agreeCount = 0;
    let opposeCount = 0;
    for (const [tf, regime] of entries) {
      if (tf === primaryTf) continue;
      if (regime.info.direction === "flat") continue;
      if (regime.info.direction === primary.direction) agreeCount += 1;
      else opposeCount += 1;
    }
    if (agreeCount > 0 && opposeCount === 0) htfConfirms = "yes";
    else if (opposeCount > 0 && agreeCount === 0) htfConfirms = "no";
  }
  return {
    matchingDirectionCount,
    totalAnalysed,
    matchingDirectionRatio: totalAnalysed === 0 ? 0 : matchingDirectionCount / totalAnalysed,
    alignedTradePermittedCount,
    weakestAlignedBracket,
    htfConfirms
  };
}
function smoothCloses(candles) {
  if (candles.length < 5) return [];
  const out = [];
  for (let i = 2; i < candles.length - 2; i++) {
    out.push(
      (candles[i - 2].close + 2 * candles[i - 1].close + 3 * candles[i].close + 2 * candles[i + 1].close + candles[i + 2].close) / 9
    );
  }
  return out;
}
function classifyBracket(angleDeg) {
  const a = Math.abs(angleDeg);
  if (a < BRACKET_NO_TRADE) return "NO_TRADE";
  if (a < BRACKET_ACCUMULATION) return "ACCUMULATION";
  if (a < BRACKET_RANGING) return "RANGING";
  if (a < BRACKET_TRENDING) return "TRENDING";
  return "BREAKOUT";
}
function classifyDirection(angleDeg) {
  if (Math.abs(angleDeg) < FLAT_EPSILON_DEG) return "flat";
  return angleDeg > 0 ? "up" : "down";
}
function makeInfo(closeNow, closeNAgo, N, volPct, k) {
  const pctChange = (closeNow - closeNAgo) / closeNAgo * 100;
  const expectedWindowMovePct = volPct * Math.sqrt(N);
  const denom = Math.max(0.01, k * expectedWindowMovePct);
  const zScore = pctChange / denom;
  const angleDeg = Math.atan(zScore) * (180 / Math.PI);
  return {
    angleDeg,
    gannBracket: classifyBracket(angleDeg),
    direction: classifyDirection(angleDeg),
    lookback: N,
    smoothedClose: closeNow,
    smoothedCloseNAgo: closeNAgo,
    pctChange,
    realizedVolPct: volPct,
    expectedWindowMovePct,
    zScore
  };
}
function computeRealizedVolPct(candles, lookback) {
  if (candles.length < lookback + 1) return 0;
  const startIdx = candles.length - lookback;
  const returns = [];
  for (let i = startIdx; i < candles.length; i++) {
    if (i === 0) continue;
    const prev = candles[i - 1].close;
    const curr = candles[i].close;
    if (prev === 0) continue;
    returns.push((curr - prev) / prev * 100);
  }
  if (returns.length === 0) return 0;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / returns.length;
  return Math.sqrt(variance);
}

// server/modules/zenny/analysis/passes/runPasses.ts
function runPasses(input, config) {
  const c = {
    recency: { ...DEFAULT_PASS_CONFIG2.recency, ...config.recency ?? {} },
    touchCount: {
      ...DEFAULT_PASS_CONFIG2.touchCount,
      ...config.touchCount ?? {}
    },
    lastLeg: { ...DEFAULT_PASS_CONFIG2.lastLeg, ...config.lastLeg ?? {} },
    polarityFlip: {
      ...DEFAULT_PASS_CONFIG2.polarityFlip,
      ...config.polarityFlip ?? {}
    },
    aggregate: {
      ...DEFAULT_PASS_CONFIG2.aggregate,
      ...config.aggregate ?? {}
    },
    wireAngle: {
      ...DEFAULT_PASS_CONFIG2.wireAngle,
      ...config.wireAngle ?? {}
    }
  };
  const recency = runRecencyPass(input, c.recency);
  const touchCount = runTouchCountPass(input, c.touchCount);
  const lastLeg = runLastLegPass(input, c.lastLeg);
  const polarityFlip = runPolarityFlipPass(input, c.polarityFlip);
  const wireAngle = runWireAnglePass(input, c.wireAngle);
  const passInfo = {};
  if (c.lastLeg.enabled) {
    const allSwings = findLastLegSwings(
      input.primaryCandles,
      c.lastLeg.reversalPct
    );
    const lastN = Math.max(1, Math.floor(c.lastLeg.lastN));
    passInfo.lastLeg = { swings: allSwings.slice(-lastN) };
  }
  if (wireAngle !== null) {
    passInfo.wireAngle = wireAngle;
  }
  const enrichedLevels = input.levels.map((level) => {
    const passes = { ...level.passes ?? {} };
    const r = recency.get(level.id);
    if (r !== void 0) passes.recency = r;
    const t = touchCount.get(level.id);
    if (t !== void 0) passes.touchCount = t;
    const ll = lastLeg.get(level.id);
    if (ll !== void 0) passes.lastLeg = ll;
    const pf = polarityFlip.get(level.id);
    if (pf !== void 0) passes.polarityFlip = pf;
    return { ...level, passes };
  });
  const aggregate = runAggregatePass(enrichedLevels, c.aggregate);
  const finalLevels = enrichedLevels.map((level) => {
    const a = aggregate.get(level.id);
    if (a === void 0) return level;
    return {
      ...level,
      passes: { ...level.passes, aggregate: a }
    };
  });
  return { levels: finalLevels, passInfo };
}

// server/modules/zenny/analysis/regime/extractInputs.ts
var BRACKET_BOUNDARIES = [14, 26.25, 45, 63.75];
var POOL_PROXIMITY_PCT = 0.05;
function extractAngle(tfRegime) {
  return {
    available: true,
    value: {
      angleDeg: tfRegime.info.angleDeg,
      bracket: tfRegime.info.gannBracket,
      direction: tfRegime.info.direction
    }
  };
}
function extractDwell(tfRegime) {
  return {
    available: true,
    value: {
      lockedBracket: tfRegime.dwell.lockedBracket,
      candidateBracket: tfRegime.dwell.candidateBracket,
      observedBars: tfRegime.dwell.candidateBarsObserved,
      requiredBars: tfRegime.dwell.dwellBarsRequired,
      locked: tfRegime.dwell.candidateBarsObserved >= tfRegime.dwell.dwellBarsRequired,
      pendingFlip: tfRegime.dwell.pendingFlip
    }
  };
}
function extractBoundaryDistance(tfRegime) {
  const absAngle = Math.abs(tfRegime.info.angleDeg);
  const allBoundaries = [0, ...BRACKET_BOUNDARIES, 90];
  let lower = 0;
  let upper = 90;
  for (let i = 0; i < allBoundaries.length - 1; i++) {
    if (absAngle >= allBoundaries[i] && absAngle < allBoundaries[i + 1]) {
      lower = allBoundaries[i];
      upper = allBoundaries[i + 1];
      break;
    }
  }
  const distLower = absAngle - lower;
  const distUpper = upper - absAngle;
  const degreesToNearest = Math.min(distLower, distUpper);
  const bracketWidth = upper - lower;
  const centerness = bracketWidth === 0 ? 0 : 1 - Math.abs(absAngle - (lower + upper) / 2) / (bracketWidth / 2);
  return {
    available: true,
    value: {
      degreesToNearest,
      centerness: Math.max(0, Math.min(1, centerness))
    }
  };
}
function extractHtfAgreement(agreement) {
  return {
    available: true,
    value: {
      matchingDirectionCount: agreement.matchingDirectionCount,
      totalAnalysed: agreement.totalAnalysed,
      matchingDirectionRatio: agreement.matchingDirectionRatio,
      htfConfirms: agreement.htfConfirms,
      alignedTradePermittedCount: agreement.alignedTradePermittedCount
    }
  };
}
function extractArmPull(arms) {
  const upperPull = arms.upper?.pullDecayed ?? null;
  const lowerPull = arms.lower?.pullDecayed ?? null;
  const hasUsableArm = arms.upper !== null || arms.lower !== null;
  return {
    available: true,
    value: {
      upperPull,
      lowerPull,
      dominantSide: arms.dominantSide,
      hasUsableArm
    }
  };
}
function extractPoolStrength(pools, currentPrice) {
  const proximityFloor = currentPrice * (1 - POOL_PROXIMITY_PCT);
  const proximityCeil = currentPrice * (1 + POOL_PROXIMITY_PCT);
  const nearby = pools.filter(
    (p) => p.status === "active" && p.linePrice >= proximityFloor && p.linePrice <= proximityCeil
  );
  let weightedScore = 0;
  let strongCount = 0;
  for (const p of nearby) {
    const strengthScore = strengthToNumber(p.strength);
    const pullDecayed = p.pull?.decayed ?? 0;
    weightedScore += strengthScore * (1 + pullDecayed);
    if (p.strength === "strong" || p.strength === "very_strong") {
      strongCount += 1;
    }
  }
  return {
    available: true,
    value: {
      activeNearbyCount: nearby.length,
      weightedStrengthScore: weightedScore,
      hasStrongNearby: strongCount > 0
    }
  };
}
function extractPolarityFlips(levels) {
  let count = 0;
  for (const lvl of levels) {
    const pf = lvl.passes.polarityFlip;
    if (pf?.flipped) count += 1;
  }
  return {
    available: true,
    value: { recentFlipCount: count }
  };
}
function extractTouchQuality(pools, currentPrice) {
  const proximityFloor = currentPrice * (1 - POOL_PROXIMITY_PCT);
  const proximityCeil = currentPrice * (1 + POOL_PROXIMITY_PCT);
  const nearby = pools.filter(
    (p) => p.status === "active" && p.linePrice >= proximityFloor && p.linePrice <= proximityCeil
  );
  if (nearby.length === 0) {
    return {
      available: true,
      value: { averageTouchCount: 0, strongPoolCount: 0 }
    };
  }
  const avgTouch = nearby.reduce((sum, p) => sum + p.confluenceCount, 0) / nearby.length;
  const strongCount = nearby.filter(
    (p) => p.strength === "strong" || p.strength === "very_strong"
  ).length;
  return {
    available: true,
    value: { averageTouchCount: avgTouch, strongPoolCount: strongCount }
  };
}
function extractRecency(pools, currentPrice, totalCandles) {
  if (totalCandles <= 1) {
    return { available: true, value: { averageRecency: 0 } };
  }
  const proximityFloor = currentPrice * (1 - POOL_PROXIMITY_PCT);
  const proximityCeil = currentPrice * (1 + POOL_PROXIMITY_PCT);
  const nearby = pools.filter(
    (p) => p.status === "active" && p.linePrice >= proximityFloor && p.linePrice <= proximityCeil
  );
  if (nearby.length === 0) {
    return { available: true, value: { averageRecency: 0 } };
  }
  const recencies = nearby.map(
    (p) => p.birthCandleIndexOnPrimary < 0 ? 0 : Math.min(1, p.birthCandleIndexOnPrimary / (totalCandles - 1))
  );
  return {
    available: true,
    value: {
      averageRecency: recencies.reduce((a, b) => a + b, 0) / recencies.length
    }
  };
}
function extractFeedHealth(health) {
  if (!health) {
    return {
      available: false,
      reason: "feed health not available for this bar (no historical record)"
    };
  }
  return { available: true, value: { status: health.status } };
}
function extractLiquidationProximity(events, currentPrice) {
  if (!events || events.length === 0 || !currentPrice || currentPrice <= 0) {
    return {
      available: false,
      reason: events && events.length === 0 ? "no recent liquidation events for this symbol" : "liquidations not provided to assessment"
    };
  }
  let nearestDistancePct = Infinity;
  let withinOnePct = 0;
  for (const e of events) {
    const distancePct = Math.abs(e.price - currentPrice) / currentPrice * 100;
    if (distancePct < nearestDistancePct) nearestDistancePct = distancePct;
    if (distancePct <= 1) withinOnePct += e.usdValue;
  }
  return {
    available: true,
    value: {
      nearestDistancePct: nearestDistancePct === Infinity ? null : nearestDistancePct,
      withinOnePct
    }
  };
}
function extractSpread() {
  return { available: false, reason: "tick processing not built (\xA72.3)" };
}
function extractDepth() {
  return {
    available: false,
    reason: "L2 depth not subscribed (NO DEPTH per UI)"
  };
}
function extractOFI() {
  return { available: false, reason: "tick processing not built (\xA72.3)" };
}
function extractVolumeDelta() {
  return { available: false, reason: "tick processing not built (\xA72.3)" };
}
function extractCancelPullRatio() {
  return {
    available: false,
    reason: "tick processing + L2 depth not built"
  };
}
function extractRealizedVolatility() {
  return {
    available: false,
    reason: "realized-vol estimator not built"
  };
}
function extractTickDensity() {
  return { available: false, reason: "tick processing not built (\xA72.3)" };
}
function extractAbsorption() {
  return { available: false, reason: "tick processing not built (\xA72.3)" };
}
function strengthToNumber(s) {
  switch (s) {
    case "very_strong":
      return 4;
    case "strong":
      return 3;
    case "medium":
      return 2;
    case "weak":
      return 1;
    case "trivial":
    default:
      return 0;
  }
}

// server/modules/zenny/analysis/regime/assessPlaybooks.ts
var TRADEABLE_THRESHOLD = 0.4;
function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}
function clampPM(x) {
  return Math.max(-1, Math.min(1, x));
}
function runPlaybook(spec, inputs) {
  const drivers = [];
  let availableWeight = 0;
  let totalWeight = 0;
  let positiveContribution = 0;
  for (const [name, weight] of Object.entries(spec.weights)) {
    totalWeight += weight;
    const slot = inputs[name];
    const signalFn = spec.signals[name];
    if (!slot.available || !signalFn) {
      drivers.push({
        input: name,
        weight,
        signal: 0,
        contribution: 0,
        available: false
      });
      continue;
    }
    availableWeight += weight;
    const signal = clampPM(signalFn(inputs));
    const contribution = signal * weight;
    drivers.push({
      input: name,
      weight,
      signal,
      contribution,
      available: true
    });
    if (contribution > 0) positiveContribution += contribution;
  }
  const strength = availableWeight === 0 ? 0 : clamp01(positiveContribution / availableWeight);
  const confidence = totalWeight === 0 ? 0 : availableWeight / totalWeight;
  const vetoMessages = [];
  for (const veto of spec.vetoes) {
    const msg = veto(inputs);
    if (msg) vetoMessages.push(msg);
  }
  const tradeable = strength >= TRADEABLE_THRESHOLD && vetoMessages.length === 0;
  const reasons = [];
  const positiveDrivers = drivers.filter((d) => d.available && d.contribution > 0.01).sort((a, b) => b.contribution - a.contribution);
  for (const d of positiveDrivers.slice(0, 3)) {
    reasons.push(`${d.input}: +${d.contribution.toFixed(2)}`);
  }
  for (const v of vetoMessages) reasons.push(`veto: ${v}`);
  if (confidence < 0.7) {
    const missing = drivers.filter((d) => !d.available).map((d) => d.input).slice(0, 3);
    if (missing.length > 0) {
      reasons.push(`missing: ${missing.join(", ")}`);
    }
  }
  return {
    playbook: spec.name,
    tradeable,
    strength,
    confidence,
    reasons,
    drivers
  };
}
var dwellLockedSignal = (i) => i.dwell.value && i.dwell.value.locked ? 1 : -0.5;
var armUsableSignal = (i) => i.armPull.value?.hasUsableArm ? 1 : -1;
var accumulationSpec = {
  name: "accumulation",
  weights: {
    angle: 0.18,
    dwell: 0.12,
    poolStrength: 0.12,
    polarityFlips: 0.08,
    recency: 0.08,
    htfAgreement: 0.06,
    realizedVolatility: 0.12,
    // unavailable — accumulation cares hugely
    volumeDelta: 0.1,
    // unavailable — balanced flow signature
    spread: 0.08,
    // unavailable
    feedHealth: 0.06
    // partial / unavailable today
  },
  signals: {
    angle: (i) => {
      const v = i.angle.value;
      if (!v) return 0;
      switch (v.bracket) {
        case "ACCUMULATION":
          return 1;
        case "RANGING":
          return 0.4;
        case "NO_TRADE":
          return 0.2;
        case "TRENDING":
          return -0.5;
        case "BREAKOUT":
          return -1;
      }
    },
    dwell: dwellLockedSignal,
    poolStrength: (i) => {
      const v = i.poolStrength.value;
      if (!v) return 0;
      if (v.activeNearbyCount >= 2) return 1;
      if (v.activeNearbyCount === 1) return 0.3;
      return -0.4;
    },
    polarityFlips: (i) => {
      const v = i.polarityFlips.value;
      if (!v) return 0;
      if (v.recentFlipCount === 0) return 0.5;
      if (v.recentFlipCount <= 2) return 0.2;
      return -0.5;
    },
    recency: (i) => {
      const v = i.recency.value;
      if (!v) return 0;
      if (v.averageRecency >= 0.3 && v.averageRecency <= 0.85) return 0.7;
      return 0.1;
    },
    htfAgreement: (i) => {
      const v = i.htfAgreement.value;
      if (!v) return 0;
      if (v.htfConfirms === "yes") return 0.3;
      if (v.htfConfirms === "no") return -0.2;
      return 0;
    }
  },
  vetoes: [
    (i) => i.angle.value?.bracket === "NO_TRADE" ? "bracket NO_TRADE \u2014 sit out entirely" : null,
    (i) => i.angle.value?.bracket === "BREAKOUT" ? "bracket BREAKOUT \u2014 wrong playbook for this regime" : null
  ]
};
var rangingSpec = {
  name: "ranging",
  weights: {
    angle: 0.18,
    dwell: 0.14,
    armPull: 0.18,
    poolStrength: 0.14,
    touchQuality: 0.1,
    htfAgreement: 0.06,
    polarityFlips: 0.06,
    spread: 0.04,
    // unavailable
    volumeDelta: 0.05,
    // unavailable
    feedHealth: 0.05
    // partial
  },
  signals: {
    angle: (i) => {
      const v = i.angle.value;
      if (!v) return 0;
      switch (v.bracket) {
        case "RANGING":
          return 1;
        case "ACCUMULATION":
          return 0.3;
        case "TRENDING":
          return -0.3;
        case "BREAKOUT":
          return -0.7;
        case "NO_TRADE":
          return -0.5;
      }
    },
    dwell: dwellLockedSignal,
    armPull: armUsableSignal,
    poolStrength: (i) => {
      const v = i.poolStrength.value;
      if (!v) return 0;
      if (v.hasStrongNearby) return 1;
      if (v.activeNearbyCount > 0) return 0.4;
      return -0.6;
    },
    touchQuality: (i) => {
      const v = i.touchQuality.value;
      if (!v) return 0;
      if (v.averageTouchCount >= 3) return 1;
      if (v.averageTouchCount >= 2) return 0.5;
      return 0;
    },
    htfAgreement: (i) => {
      const v = i.htfAgreement.value;
      if (!v) return 0;
      if (v.htfConfirms === "yes") return 0.5;
      if (v.htfConfirms === "no") return -0.3;
      return 0.1;
    },
    polarityFlips: (i) => {
      const v = i.polarityFlips.value;
      if (!v) return 0;
      if (v.recentFlipCount >= 1 && v.recentFlipCount <= 3) return 0.4;
      if (v.recentFlipCount > 6) return -0.5;
      return 0;
    }
  },
  vetoes: [
    (i) => i.angle.value?.bracket === "NO_TRADE" ? "bracket NO_TRADE \u2014 sit out" : null,
    (i) => i.angle.value?.bracket === "BREAKOUT" ? "BREAKOUT \u2014 range is broken, not ranging" : null,
    (i) => i.armPull.value && !i.armPull.value.hasUsableArm ? "no active arm with sufficient pull" : null
  ]
};
var trendingSpec = {
  name: "trending",
  weights: {
    angle: 0.2,
    dwell: 0.12,
    htfAgreement: 0.18,
    armPull: 0.16,
    polarityFlips: 0.06,
    recency: 0.06,
    realizedVolatility: 0.1,
    // unavailable
    volumeDelta: 0.06,
    // unavailable
    spread: 0.03,
    // unavailable
    feedHealth: 0.03
  },
  signals: {
    angle: (i) => {
      const v = i.angle.value;
      if (!v) return 0;
      switch (v.bracket) {
        case "TRENDING":
          return 1;
        case "BREAKOUT":
          return 0.6;
        // trending playbook still works on a breakout
        case "RANGING":
          return -0.2;
        case "ACCUMULATION":
          return -0.7;
        case "NO_TRADE":
          return -1;
      }
    },
    dwell: dwellLockedSignal,
    htfAgreement: (i) => {
      const v = i.htfAgreement.value;
      if (!v) return 0;
      if (v.htfConfirms === "yes") return 1;
      if (v.htfConfirms === "no") return -1;
      return -0.2;
    },
    armPull: (i) => {
      const v = i.armPull.value;
      const a = i.angle.value;
      if (!v || !a) return 0;
      if (v.dominantSide === "neither") return -0.3;
      if (a.direction === "up" && v.dominantSide === "upper") return 1;
      if (a.direction === "down" && v.dominantSide === "lower") return 1;
      if (a.direction === "flat") return 0;
      return -0.5;
    },
    polarityFlips: (i) => {
      const v = i.polarityFlips.value;
      if (!v) return 0;
      if (v.recentFlipCount === 0) return 0.5;
      if (v.recentFlipCount > 3) return -0.4;
      return 0;
    },
    recency: (i) => {
      const v = i.recency.value;
      if (!v) return 0;
      if (v.averageRecency >= 0.7) return 0.6;
      return 0;
    }
  },
  vetoes: [
    (i) => i.angle.value?.bracket === "NO_TRADE" ? "bracket NO_TRADE \u2014 sit out" : null,
    (i) => i.angle.value?.bracket === "ACCUMULATION" ? "ACCUMULATION \u2014 no trend to follow" : null,
    (i) => {
      const a = i.angle.value;
      if (!a || a.direction === "flat") {
        return "no directional bias to follow";
      }
      return null;
    }
  ]
};
var breakoutSpec = {
  name: "breakout",
  weights: {
    angle: 0.22,
    dwell: 0.18,
    // freshness of the lock matters most for breakout
    armPull: 0.14,
    htfAgreement: 0.1,
    realizedVolatility: 0.12,
    // unavailable
    volumeDelta: 0.1,
    // unavailable — needs expansion
    polarityFlips: 0.06,
    feedHealth: 0.04,
    spread: 0.04
    // unavailable
  },
  signals: {
    angle: (i) => {
      const v = i.angle.value;
      if (!v) return 0;
      switch (v.bracket) {
        case "BREAKOUT":
          return 1;
        case "TRENDING":
          return 0.5;
        case "RANGING":
          return -0.4;
        case "ACCUMULATION":
          return -0.8;
        case "NO_TRADE":
          return -1;
      }
    },
    dwell: (i) => {
      const v = i.dwell.value;
      if (!v) return 0;
      if (!v.locked) return -0.5;
      const overshoot = v.observedBars - v.requiredBars;
      if (overshoot <= 1) return 1;
      if (overshoot <= 4) return 0.5;
      if (overshoot <= 10) return 0;
      return -0.3;
    },
    armPull: (i) => {
      const v = i.armPull.value;
      const a = i.angle.value;
      if (!v || !a) return 0;
      if (v.dominantSide === "neither") return -0.4;
      if (a.direction === "up" && v.dominantSide === "upper") return 1;
      if (a.direction === "down" && v.dominantSide === "lower") return 1;
      return -0.6;
    },
    htfAgreement: (i) => {
      const v = i.htfAgreement.value;
      if (!v) return 0;
      if (v.htfConfirms === "yes") return 0.7;
      if (v.htfConfirms === "no") return -0.5;
      return 0;
    },
    polarityFlips: (i) => {
      const v = i.polarityFlips.value;
      if (!v) return 0;
      if (v.recentFlipCount > 5) return -0.3;
      return 0;
    }
  },
  vetoes: [
    (i) => i.angle.value?.bracket === "NO_TRADE" ? "bracket NO_TRADE \u2014 sit out" : null,
    (i) => {
      const v = i.angle.value;
      if (!v) return null;
      if (v.bracket === "ACCUMULATION") return "ACCUMULATION \u2014 no breakout";
      if (v.bracket === "RANGING") return "RANGING \u2014 wait for the actual break";
      return null;
    }
  ]
};
function assessAccumulation(inputs) {
  return runPlaybook(accumulationSpec, inputs);
}
function assessRanging(inputs) {
  return runPlaybook(rangingSpec, inputs);
}
function assessTrending(inputs) {
  return runPlaybook(trendingSpec, inputs);
}
function assessBreakout(inputs) {
  return runPlaybook(breakoutSpec, inputs);
}

// server/modules/zenny/analysis/regime/assembleAssessment.ts
function assembleRegimeAssessment(input) {
  const primaryTfRegime = input.wireAngle.perTimeframe[input.primaryTimeframe];
  if (!primaryTfRegime) return null;
  const inputs = extractInputs(input, primaryTfRegime);
  const playbooks = {
    accumulation: assessAccumulation(inputs),
    ranging: assessRanging(inputs),
    trending: assessTrending(inputs),
    breakout: assessBreakout(inputs)
  };
  const recommended = pickRecommended(playbooks);
  const primary = {
    timeframe: input.primaryTimeframe,
    pattern: primaryTfRegime.info.gannBracket,
    playbooks,
    recommended,
    inputs
  };
  return {
    primary,
    perTimeframe: { [input.primaryTimeframe]: primary }
  };
}
function extractInputs(ctx, primaryTfRegime) {
  return {
    angle: extractAngle(primaryTfRegime),
    dwell: extractDwell(primaryTfRegime),
    boundaryDistance: extractBoundaryDistance(primaryTfRegime),
    htfAgreement: extractHtfAgreement(ctx.wireAngle.agreement),
    armPull: extractArmPull(ctx.arms),
    poolStrength: extractPoolStrength(ctx.pools, ctx.currentPrice),
    polarityFlips: extractPolarityFlips(ctx.levels),
    touchQuality: extractTouchQuality(ctx.pools, ctx.currentPrice),
    recency: extractRecency(ctx.pools, ctx.currentPrice, ctx.totalCandles),
    feedHealth: extractFeedHealth(ctx.feedHealth),
    liquidationProximity: extractLiquidationProximity(
      ctx.liquidations,
      ctx.currentPrice
    ),
    // Not yet wired
    spread: extractSpread(),
    depth: extractDepth(),
    ofi: extractOFI(),
    volumeDelta: extractVolumeDelta(),
    cancelPullRatio: extractCancelPullRatio(),
    realizedVolatility: extractRealizedVolatility(),
    tickDensity: extractTickDensity(),
    absorption: extractAbsorption()
  };
}
function pickRecommended(playbooks) {
  let best = null;
  for (const [name, assessment] of Object.entries(playbooks)) {
    if (!assessment.tradeable) continue;
    if (best === null || assessment.strength > best.strength) {
      best = { playbook: name, strength: assessment.strength };
    }
  }
  return best;
}

// server/modules/zenny/analysis/regime/regimeHistory.ts
var CACHE = /* @__PURE__ */ new Map();
function computeRegimeHistory(input) {
  const primaryRegime = input.wireAngle.perTimeframe[input.primaryTimeframe];
  if (!primaryRegime) return [];
  const lookback = primaryRegime.info.lookback;
  const out = [];
  for (const histEntry of primaryRegime.history) {
    const i = histEntry.candleIndex;
    if (i < 0 || i >= input.primaryCandles.length) continue;
    const candleOpenTime = input.primaryCandles[i].openTime;
    const cacheKey = `${input.symbol}|${input.primaryTimeframe}|${candleOpenTime}|n=${lookback}`;
    const cached = CACHE.get(cacheKey);
    if (cached) {
      out.push({ ...cached, candleIndex: i });
      continue;
    }
    const snapshot = computeAtBar(input, i, candleOpenTime, histEntry, primaryRegime);
    CACHE.set(cacheKey, snapshot);
    out.push(snapshot);
  }
  return out;
}
function computeAtBar(ctx, i, candleOpenTime, histEntry, primaryRegime) {
  const candlesUpToI = ctx.primaryCandles.slice(0, i + 1);
  const priceAtI = candlesUpToI[candlesUpToI.length - 1].close;
  const aliveAtI = filterPoolsAliveAt(ctx.pools, i);
  const enrichedAtI = enrichWithPullAtBar(aliveAtI, candlesUpToI, priceAtI);
  const armsAtI = extractArms({ pools: enrichedAtI, currentPrice: priceAtI });
  const historyToI = primaryRegime.history.filter(
    (h) => h.candleIndex <= i
  );
  const dwellAtI = computeDwell(historyToI, primaryRegime.dwell.dwellBarsRequired);
  const inputs = {
    angle: extractAngleAtBar(histEntry),
    dwell: extractDwellViaTfRegime({ ...primaryRegime, dwell: dwellAtI }),
    boundaryDistance: extractBoundaryDistance({
      ...primaryRegime,
      info: { ...primaryRegime.info, angleDeg: histEntry.angleDeg, gannBracket: histEntry.bracket, direction: histEntry.direction }
    }),
    // As-of-bar HTF agreement: for each TF in the wireAngle map, find its
    // history entry whose candleOpenTime is the latest ≤ this bar's
    // primary openTime. That's the bracket / direction the TF was in at
    // this point in time. Reconstructs an agreement object the extractor
    // can format the same way as the present-moment one.
    htfAgreement: extractHtfAgreement(
      computeAgreementAtTime(
        ctx.wireAngle,
        ctx.primaryTimeframe,
        candleOpenTime
      )
    ),
    armPull: extractArmPull(armsAtI),
    poolStrength: extractPoolStrength(enrichedAtI, priceAtI),
    // V1 LIMITATION: polarityFlip pass currently emits a single
    // boolean per level (flipped at right edge); it doesn't carry the
    // confirmation-candle index needed to derive a per-bar count.
    // Until the pass is extended, the historical count uses the
    // present-snapshot value — a small bias for older bars (none of
    // their levels have flipped yet but we count them as if they have).
    // Polarity-flips weight ~6-8% across the playbooks so the impact
    // on strength is bounded. Tighten when the pass exposes flip indices.
    polarityFlips: extractPolarityFlips(ctx.levels),
    touchQuality: extractTouchQuality(enrichedAtI, priceAtI),
    recency: extractRecency(enrichedAtI, priceAtI, candlesUpToI.length),
    feedHealth: extractFeedHealth(),
    // Per-bar liquidation proximity isn't derivable from a current
    // events list — would need event replay as-of-each-bar. Pass undefined
    // so the input lands as unavailable for historical bars.
    liquidationProximity: extractLiquidationProximity(void 0, void 0),
    spread: extractSpread(),
    depth: extractDepth(),
    ofi: extractOFI(),
    volumeDelta: extractVolumeDelta(),
    cancelPullRatio: extractCancelPullRatio(),
    realizedVolatility: extractRealizedVolatility(),
    tickDensity: extractTickDensity(),
    absorption: extractAbsorption()
  };
  const playbooks = {
    accumulation: assessAccumulation(inputs),
    ranging: assessRanging(inputs),
    trending: assessTrending(inputs),
    breakout: assessBreakout(inputs)
  };
  const recommended = pickRecommended2(playbooks);
  const playbookStrengths = {
    accumulation: playbooks.accumulation.strength,
    ranging: playbooks.ranging.strength,
    trending: playbooks.trending.strength,
    breakout: playbooks.breakout.strength
  };
  return {
    candleIndex: i,
    candleOpenTime,
    bracket: histEntry.bracket,
    recommended,
    playbookStrengths
  };
}
function computeAgreementAtTime(wireAngle, primaryTf, primaryOpenTimeMs) {
  const entries = Object.entries(wireAngle.perTimeframe);
  const snapshots = [];
  for (const [tf, regime] of entries) {
    let chosen = null;
    for (let i = regime.history.length - 1; i >= 0; i--) {
      const h = regime.history[i];
      if (h.candleOpenTime <= primaryOpenTimeMs) {
        chosen = h;
        break;
      }
    }
    if (chosen) {
      snapshots.push({
        tf,
        bracket: chosen.bracket,
        direction: chosen.direction
      });
    }
  }
  const primarySnap = snapshots.find((s) => s.tf === primaryTf);
  const totalAnalysed = snapshots.length;
  if (!primarySnap) {
    return {
      matchingDirectionCount: 0,
      totalAnalysed,
      matchingDirectionRatio: 0,
      alignedTradePermittedCount: 0,
      weakestAlignedBracket: null,
      htfConfirms: "mixed"
    };
  }
  const TRADE_STRENGTH_BRACKETS = /* @__PURE__ */ new Set([
    "RANGING",
    "TRENDING",
    "BREAKOUT"
  ]);
  const BRACKET_RANK_LOCAL = {
    NO_TRADE: 0,
    ACCUMULATION: 1,
    RANGING: 2,
    TRENDING: 3,
    BREAKOUT: 4
  };
  let matchingDirectionCount = 0;
  let alignedTradePermittedCount = 0;
  let weakestAlignedBracket = null;
  for (const s of snapshots) {
    if (s.direction === "flat" || primarySnap.direction === "flat") continue;
    if (s.direction !== primarySnap.direction) continue;
    matchingDirectionCount += 1;
    if (TRADE_STRENGTH_BRACKETS.has(s.bracket))
      alignedTradePermittedCount += 1;
    if (weakestAlignedBracket === null || BRACKET_RANK_LOCAL[s.bracket] < BRACKET_RANK_LOCAL[weakestAlignedBracket]) {
      weakestAlignedBracket = s.bracket;
    }
  }
  let htfConfirms = "mixed";
  if (primarySnap.direction !== "flat") {
    let agreeCount = 0;
    let opposeCount = 0;
    for (const s of snapshots) {
      if (s.tf === primaryTf) continue;
      if (s.direction === "flat") continue;
      if (s.direction === primarySnap.direction) agreeCount += 1;
      else opposeCount += 1;
    }
    if (agreeCount > 0 && opposeCount === 0) htfConfirms = "yes";
    else if (opposeCount > 0 && agreeCount === 0) htfConfirms = "no";
  }
  return {
    matchingDirectionCount,
    totalAnalysed,
    matchingDirectionRatio: totalAnalysed === 0 ? 0 : matchingDirectionCount / totalAnalysed,
    alignedTradePermittedCount,
    weakestAlignedBracket,
    htfConfirms
  };
}
function filterPoolsAliveAt(pools, i) {
  return pools.filter((p) => {
    if (p.birthCandleIndexOnPrimary < 0) return false;
    if (p.birthCandleIndexOnPrimary > i) return false;
    if (p.deathCandleIndexOnPrimary !== null && p.deathCandleIndexOnPrimary <= i) {
      return false;
    }
    if (p.sweptCandleIndexOnPrimary !== null && p.sweptCandleIndexOnPrimary <= i) {
      return false;
    }
    return true;
  });
}
function enrichWithPullAtBar(pools, candlesUpToI, priceAtI) {
  if (priceAtI <= 0 || pools.length === 0) return pools;
  const cfg = DEFAULT_PULL_PASS_CONFIG;
  const raws = /* @__PURE__ */ new Map();
  const dists = /* @__PURE__ */ new Map();
  const decayCounters = /* @__PURE__ */ new Map();
  for (const pool2 of pools) {
    const distancePct = Math.abs(priceAtI - pool2.centreLine) / priceAtI * 100;
    const sEff = sEffectiveStandIn(pool2.strength);
    const raw = sEff / (distancePct + cfg.distanceFloor);
    raws.set(pool2.id, raw);
    dists.set(pool2.id, distancePct);
    decayCounters.set(
      pool2.id,
      computeCandlesMovingAway(pool2, candlesUpToI)
    );
  }
  let maxRaw = 0;
  for (const v of raws.values()) if (v > maxRaw) maxRaw = v;
  if (maxRaw <= 0) return pools;
  return pools.map((pool2) => {
    const raw = raws.get(pool2.id) ?? 0;
    const normalized = raw / maxRaw * 100;
    const cma = decayCounters.get(pool2.id) ?? 0;
    const decayed = Math.max(
      cfg.minPullFloor,
      normalized * Math.pow(cfg.decayRate, cma)
    );
    const pull = {
      raw,
      normalized,
      decayed,
      distancePct: dists.get(pool2.id) ?? 0,
      candlesMovingAway: cma,
      sEffectiveStandIn: sEffectiveStandIn(pool2.strength)
    };
    return { ...pool2, pull };
  });
}
function extractAngleAtBar(h) {
  return {
    available: true,
    value: {
      angleDeg: h.angleDeg,
      bracket: h.bracket,
      direction: h.direction
    }
  };
}
function extractDwellViaTfRegime(tfRegime) {
  return extractDwell(tfRegime);
}
function pickRecommended2(playbooks) {
  let best = null;
  for (const [name, assessment] of Object.entries(playbooks)) {
    if (!assessment.tradeable) continue;
    if (best === null || assessment.strength > best.strength) {
      best = { playbook: name, strength: assessment.strength };
    }
  }
  return best;
}

// server/modules/zenny/decision/wick/computeATR.ts
function computeATR(candles, period) {
  if (period <= 0) return null;
  if (candles.length < period + 1) return null;
  const trs = [];
  const start = candles.length - period;
  for (let i = start; i < candles.length; i++) {
    const cur = candles[i];
    const prev = candles[i - 1];
    const tr = Math.max(
      cur.high - cur.low,
      Math.abs(cur.high - prev.close),
      Math.abs(cur.low - prev.close)
    );
    trs.push(tr);
  }
  let sum = 0;
  for (const tr of trs) sum += tr;
  return sum / trs.length;
}

// server/modules/zenny/decision/reach/computeAsymmetry.ts
function computeAsymmetry(arms) {
  if (arms.dominantSide === "neither") return null;
  const upperPull = arms.upper?.pullDecayed ?? 0;
  const lowerPull = arms.lower?.pullDecayed ?? 0;
  if (arms.dominantSide === "upper") {
    if (upperPull <= 0) return null;
    const asymmetry2 = lowerPull <= 0 ? 999 : upperPull / lowerPull;
    return {
      asymmetry: asymmetry2,
      dominantSide: "upper",
      dominantPull: upperPull,
      subordinatePull: lowerPull
    };
  }
  if (lowerPull <= 0) return null;
  const asymmetry = upperPull <= 0 ? 999 : lowerPull / upperPull;
  return {
    asymmetry,
    dominantSide: "lower",
    dominantPull: lowerPull,
    subordinatePull: upperPull
  };
}

// server/modules/zenny/decision/reach/defaultConfig.ts
var DEFAULT_REACH_CONFIG = {
  // REACH is for continuation / drive trades, not for fading a range edge.
  allowedPlaybooks: ["trending", "breakout"],
  // R1 — lowered 2.0 → 1.5 on 2026-05-09 after user observed setups
  // with asymmetry ~1.47 being missed. Still operates WITHIN the regime
  // gate; just relaxed the within-REACH threshold.
  pullAsymmetryThreshold: 1.5,
  // R2
  entryMethod: "pullback-swing",
  pullbackLookbackBars: 5,
  // R3
  stopAtrBufferMultiple: 0.25,
  atrPeriod: 14,
  // R4
  tp1RatioOfPoolWidth: 0.2,
  // Regime gating — direction must align (long REACH needs up direction)
  requireDirectionAlignment: true,
  // R5 — no time stop initially; matches TAKE convention E6
  maxBarsInTrade: null,
  // R6 — same R as TAKE per Van Tharp
  sizeMultiplierVsTake: 1,
  minRiskRewardRatio: 1,
  // R7
  conflictZoneAtrMultiple: 1,
  // Effort vs Result filter — disabled until volume normalisation lands
  effortVsResultFilterEnabled: false
};

// server/modules/zenny/decision/reach/findRecentSwing.ts
function findRecentSwingLow(candles, lookbackBars) {
  if (candles.length === 0) return null;
  const start = Math.max(0, candles.length - lookbackBars);
  let lo = Infinity;
  for (let i = start; i < candles.length; i++) {
    if (candles[i].low < lo) lo = candles[i].low;
  }
  return Number.isFinite(lo) ? lo : null;
}
function findRecentSwingHigh(candles, lookbackBars) {
  if (candles.length === 0) return null;
  const start = Math.max(0, candles.length - lookbackBars);
  let hi = -Infinity;
  for (let i = start; i < candles.length; i++) {
    if (candles[i].high > hi) hi = candles[i].high;
  }
  return Number.isFinite(hi) ? hi : null;
}

// server/modules/zenny/decision/reach/proposeReachTrade.ts
function proposeReachTrade(input) {
  const cfg = input.config ?? DEFAULT_REACH_CONFIG;
  const playbook = input.assessment.recommended?.playbook;
  if (!playbook) return null;
  if (!cfg.allowedPlaybooks.includes(playbook)) return null;
  const asym = computeAsymmetry(input.arms);
  if (asym === null) return null;
  if (asym.asymmetry < cfg.pullAsymmetryThreshold) return null;
  const dominantSide = asym.dominantSide;
  const side = dominantSide === "upper" ? "long" : "short";
  const dominantArm = dominantSide === "upper" ? input.arms.upper : input.arms.lower;
  const oppositeArm = dominantSide === "upper" ? input.arms.lower : input.arms.upper;
  if (!dominantArm) return null;
  const dominantPool = dominantArm.pool;
  if (cfg.requireDirectionAlignment) {
    const angleInput = input.assessment.inputs.angle;
    if (!angleInput.available || !angleInput.value) return null;
    const direction = angleInput.value.direction;
    if (side === "long" && direction !== "up") return null;
    if (side === "short" && direction !== "down") return null;
  }
  const atr = computeATR(input.candles, cfg.atrPeriod);
  if (atr === null) return null;
  const distanceToPool = Math.abs(input.currentPrice - dominantPool.centreLine);
  if (distanceToPool < atr * cfg.conflictZoneAtrMultiple) return null;
  let entry = null;
  if (cfg.entryMethod === "pullback-swing") {
    entry = side === "long" ? findRecentSwingLow(input.candles, cfg.pullbackLookbackBars) : findRecentSwingHigh(input.candles, cfg.pullbackLookbackBars);
  } else if (cfg.entryMethod === "at-market") {
    entry = input.currentPrice;
  }
  if (entry === null) return null;
  if (side === "long" && entry > input.currentPrice) entry = input.currentPrice;
  if (side === "short" && entry < input.currentPrice) entry = input.currentPrice;
  const buffer = atr * cfg.stopAtrBufferMultiple;
  let stop;
  let stopSource;
  if (oppositeArm) {
    stop = side === "long" ? oppositeArm.pool.wickLow - buffer : oppositeArm.pool.wickHigh + buffer;
    stopSource = `opposite-arm wick + ${cfg.stopAtrBufferMultiple} \xD7 ATR`;
  } else {
    const dist = Math.abs(entry - dominantPool.centreLine);
    stop = side === "long" ? entry - dist : entry + dist;
    stopSource = "fallback (no opposite arm)";
  }
  const target = dominantPool.centreLine;
  const poolWidth = Math.abs(
    dominantPool.wickHigh - dominantPool.wickLow
  );
  const tp1Offset = poolWidth * cfg.tp1RatioOfPoolWidth;
  const target2 = side === "long" ? target - tp1Offset : target + tp1Offset;
  if (side === "long" && (stop >= entry || target <= entry)) return null;
  if (side === "short" && (stop <= entry || target >= entry)) return null;
  const riskAbs = Math.abs(entry - stop);
  const rewardAbs = Math.abs(target - entry);
  if (riskAbs === 0 || entry === 0) return null;
  const riskRewardRatio = rewardAbs / riskAbs;
  if (riskRewardRatio < cfg.minRiskRewardRatio) return null;
  return {
    timeframe: input.timeframe,
    playbook,
    phase: "reach",
    side,
    entry,
    stop,
    target,
    target2,
    // TP1 — execution v0 doesn't honour, but persisted for UI
    riskRewardRatio,
    riskPct: riskAbs / entry * 100,
    sizeMultiplier: cfg.sizeMultiplierVsTake,
    anchorPoolId: dominantPool.id,
    rationale: [
      `REACH ${side} \u2192 ${dominantSide} pool ${dominantPool.id}`,
      `pull asymmetry ${asym.asymmetry.toFixed(2)} (threshold ${cfg.pullAsymmetryThreshold})`,
      `entry: ${cfg.entryMethod}`,
      `stop: ${stopSource}`,
      `TP2 target: dominant pool centre; TP1 (target2) at ${cfg.tp1RatioOfPoolWidth.toFixed(2)}\xD7 pool width back`
    ]
  };
}

// server/modules/zenny/decision/selectTradePlans.ts
var PHASE_PRIORITY = {
  take: 0,
  reach: 1
};
function selectTradePlansForTimeframe(plans, currentPrice) {
  if (plans.length <= 1) return plans;
  const [winner] = [...plans].sort(
    (a, b) => compareTradePlans(a, b, currentPrice)
  );
  return winner ? [winner] : [];
}
function compareTradePlans(a, b, currentPrice) {
  const actionabilityDiff = entryTravelInRiskUnits(a, currentPrice) - entryTravelInRiskUnits(b, currentPrice);
  if (Math.abs(actionabilityDiff) > 1e-9) return actionabilityDiff;
  const rawEntryDistanceDiff = Math.abs(a.entry - currentPrice) - Math.abs(b.entry - currentPrice);
  if (Math.abs(rawEntryDistanceDiff) > 1e-9) return rawEntryDistanceDiff;
  const rrDiff = b.riskRewardRatio - a.riskRewardRatio;
  if (Math.abs(rrDiff) > 1e-9) return rrDiff;
  const sizeDiff = b.sizeMultiplier - a.sizeMultiplier;
  if (Math.abs(sizeDiff) > 1e-9) return sizeDiff;
  return PHASE_PRIORITY[a.phase] - PHASE_PRIORITY[b.phase];
}
function entryTravelInRiskUnits(plan, currentPrice) {
  const riskAbs = Math.abs(plan.entry - plan.stop);
  if (riskAbs <= 0) return Number.POSITIVE_INFINITY;
  return Math.abs(plan.entry - currentPrice) / riskAbs;
}

// server/modules/zenny/decision/wick/checkConfirmation.ts
function checkConfirmation(input) {
  const { pool: pool2, candles, maxBarsAfterSweep } = input;
  const sweptIdx = pool2.sweptCandleIndexOnPrimary;
  if (sweptIdx === null) {
    return { satisfied: false, reason: "pool not swept" };
  }
  if (sweptIdx < 0 || sweptIdx >= candles.length) {
    return { satisfied: false, reason: "sweep index out of range" };
  }
  const lastIdx = Math.min(
    candles.length - 1,
    sweptIdx + maxBarsAfterSweep
  );
  for (let i = sweptIdx; i <= lastIdx; i++) {
    const c = candles[i];
    if (pool2.type === "RESISTANCE" && c.close < pool2.linePrice) {
      return { satisfied: true, confirmedAtIndex: i };
    }
    if (pool2.type === "SUPPORT" && c.close > pool2.linePrice) {
      return { satisfied: true, confirmedAtIndex: i };
    }
  }
  return {
    satisfied: false,
    reason: `no close-back-inside within ${maxBarsAfterSweep} bars`
  };
}

// server/modules/zenny/decision/wick/computeBuffer.ts
function computeBuffer(price, candles, config) {
  const pctBuffer = price * config.percentage;
  if (config.rule === "percentage") return pctBuffer;
  const atr = computeATR(candles, config.atrPeriod);
  const atrBuffer = atr === null ? null : atr * config.atrMultiple;
  if (config.rule === "atr") {
    return atrBuffer ?? pctBuffer;
  }
  if (atrBuffer === null) return pctBuffer;
  return Math.max(pctBuffer, atrBuffer);
}

// server/modules/zenny/decision/wick/computeEntry.ts
function computeEntry(input) {
  const { pool: pool2, style, buffer, anticipatory } = input;
  if (pool2.type === "RESISTANCE") {
    switch (style) {
      case "midpoint":
        return (pool2.linePrice + pool2.wickHigh) / 2;
      case "extreme":
        return pool2.wickHigh;
      case "beyond":
        return pool2.wickHigh + buffer;
      case "anticipatory":
        return resolveAnticipatoryEntry(
          pool2.wickHigh,
          buffer,
          "RESISTANCE",
          anticipatory
        );
    }
  }
  switch (style) {
    case "midpoint":
      return (pool2.linePrice + pool2.wickLow) / 2;
    case "extreme":
      return pool2.wickLow;
    case "beyond":
      return pool2.wickLow - buffer;
    case "anticipatory":
      return resolveAnticipatoryEntry(
        pool2.wickLow,
        buffer,
        "SUPPORT",
        anticipatory
      );
  }
}
function resolveAnticipatoryEntry(wickExtreme, buffer, side, cfg) {
  if (cfg.distanceRule === "fixed-buffer") {
    const offset2 = buffer * cfg.fixedBufferMultiple;
    return side === "RESISTANCE" ? wickExtreme - offset2 : wickExtreme + offset2;
  }
  if (cfg.distanceRule === "current-price") {
    const offset2 = buffer * cfg.fixedBufferMultiple;
    return side === "RESISTANCE" ? wickExtreme - offset2 : wickExtreme + offset2;
  }
  const offset = buffer * cfg.fixedBufferMultiple;
  return side === "RESISTANCE" ? wickExtreme - offset : wickExtreme + offset;
}

// server/modules/zenny/decision/wick/computeStop.ts
function computeStop(input) {
  const { pool: pool2, style, buffer, beyond } = input;
  const multiplier = style === "beyond" ? beyond.stopMultiplier : 1;
  if (pool2.type === "RESISTANCE") {
    return pool2.wickHigh + buffer * multiplier;
  }
  return pool2.wickLow - buffer * multiplier;
}

// server/modules/zenny/decision/wick/computeTarget.ts
function computeTarget(input) {
  const { pool: pool2, arms, entry, side } = input;
  const opposingArm = side === "short" ? arms.lower : arms.upper;
  if (opposingArm) {
    return { target: opposingArm.pool.centreLine, source: "opposing-arm" };
  }
  const distance = Math.abs(entry - pool2.centreLine);
  const target = side === "short" ? entry - distance : entry + distance;
  return { target, source: "measured-move" };
}

// server/modules/zenny/decision/wick/defaultConfig.ts
var DEFAULT_WICK_CONFIG = {
  // W4 — buffer formula
  buffer: {
    rule: "max",
    percentage: 2e-3,
    // 0.2% — crypto SFP convention
    atrPeriod: 14,
    // standard ATR lookback
    atrMultiple: 0.25
    // tight; the small stop is the edge for #2
  },
  // W1 — confirmation gate
  confirmation: {
    // Default: extreme/beyond require close-back-inside; midpoint is exempt
    // because the entry is already deeper than the wick (structurally implied).
    requiredFor: ["extreme", "beyond"],
    maxBarsAfterSweep: 1
    // same/next bar
  },
  // W5 — beyond interpretation
  beyond: {
    interpretation: "second-sweep-fade",
    // ICT/SMC/Bookmap consensus
    stopMultiplier: 2
    // wider stop to absorb the second sweep
  },
  // W2 + W6 — anticipatory (#4)
  // requireTrendingRegime relaxed 2026-05-09 — the regimeMatrix is now the
  // authoritative gate for which regimes allow anticipatory. The internal
  // requireTrendingRegime flag is now redundant; kept as belt-and-braces.
  anticipatory: {
    enabled: true,
    // ICT canon kept by default
    distanceRule: "fixed-buffer",
    // simplest v1 — refine to OTE later
    fixedBufferMultiple: 1.5,
    oteFraction: 0.705,
    // ICT Sweet Spot
    requireTrendingRegime: false
  },
  // W3 — regime → entry style matrix
  // Updated 2026-05-09: added 'anticipatory' to RANGING and ACCUMULATION
  // per "optimise within the gate" principle (memory/zenny_regime_gate_principle.md).
  // RANGING + ACCUMULATION already fire trades; we just added another entry
  // style they can use. We did NOT add anticipatory to NO_TRADE — that
  // would override the gate, not optimise within it.
  regimeMatrix: {
    ranging: ["midpoint", "extreme", "anticipatory"],
    accumulation: ["midpoint", "anticipatory"],
    trending: ["anticipatory"],
    breakout: ["extreme"]
  },
  // Per-style size multipliers. #1/#2 are the bread-and-butter (full size);
  // #3 is wider stop so smaller; #4 is anticipatory so smallest.
  sizeMultiplier: {
    midpoint: 1,
    extreme: 1,
    beyond: 0.7,
    anticipatory: 0.5
  },
  minRiskRewardRatio: 1,
  // Beyond ~5 bars, the sweep is stale and the fade window has closed.
  maxBarsSinceSweep: 5
};

// server/modules/zenny/decision/wick/proposeWickTrade.ts
function proposeWickTrade(input) {
  const cfg = input.config ?? DEFAULT_WICK_CONFIG;
  const playbook = input.assessment.recommended?.playbook;
  if (!playbook) return null;
  const allowedStyles = cfg.regimeMatrix[playbook];
  if (!allowedStyles || allowedStyles.length === 0) return null;
  const dominant = pickDominantArm(input.arms);
  if (!dominant) return null;
  const pool2 = dominant.pool;
  const side = pool2.type === "RESISTANCE" ? "short" : "long";
  const buffer = computeBuffer(input.currentPrice, input.candles, cfg.buffer);
  for (const style of allowedStyles) {
    const plan = tryStyle({
      style,
      pool: pool2,
      side,
      input,
      cfg,
      buffer,
      playbook
    });
    if (plan !== null) return plan;
  }
  return null;
}
function tryStyle(args) {
  const { style, pool: pool2, side, input, cfg, buffer, playbook } = args;
  if (style === "anticipatory") {
    if (!cfg.anticipatory.enabled) return null;
    if (pool2.status !== "active") return null;
    if (cfg.anticipatory.requireTrendingRegime && playbook !== "trending") {
      return null;
    }
  } else {
    if (pool2.status !== "swept") return null;
    if (pool2.sweptCandleIndexOnPrimary === null || pool2.sweptCandleIndexOnPrimary < 0) {
      return null;
    }
    const candlesSinceSweep = input.candles.length - 1 - pool2.sweptCandleIndexOnPrimary;
    if (candlesSinceSweep < 0 || candlesSinceSweep > cfg.maxBarsSinceSweep) {
      return null;
    }
  }
  const entry = computeEntry({
    pool: pool2,
    style,
    buffer,
    anticipatory: cfg.anticipatory
  });
  if (entry === null) return null;
  const stop = computeStop({ pool: pool2, style, buffer, beyond: cfg.beyond });
  const targetOut = computeTarget({ pool: pool2, arms: input.arms, entry, side });
  if (side === "short" && (stop <= entry || targetOut.target >= entry)) {
    return null;
  }
  if (side === "long" && (stop >= entry || targetOut.target <= entry)) {
    return null;
  }
  if (cfg.confirmation.requiredFor.includes(style)) {
    const conf = checkConfirmation({
      pool: pool2,
      candles: input.candles,
      maxBarsAfterSweep: cfg.confirmation.maxBarsAfterSweep
    });
    if (!conf.satisfied) return null;
  }
  const riskAbs = Math.abs(entry - stop);
  const rewardAbs = Math.abs(targetOut.target - entry);
  if (riskAbs === 0 || entry === 0) return null;
  const riskRewardRatio = rewardAbs / riskAbs;
  if (riskRewardRatio < cfg.minRiskRewardRatio) return null;
  const sizeMultiplier = cfg.sizeMultiplier[style];
  const rationale = [
    `playbook ${playbook} \u2192 entry style ${style}`,
    `pool ${pool2.id} (${pool2.type}, ${pool2.status})`,
    `target via ${targetOut.source}`
  ];
  if (style === "beyond") {
    rationale.push(
      `interpretation: ${cfg.beyond.interpretation}, stop \xD7${cfg.beyond.stopMultiplier}`
    );
  }
  if (style === "anticipatory") {
    rationale.push(`distance rule: ${cfg.anticipatory.distanceRule}`);
  }
  return {
    timeframe: input.timeframe,
    playbook,
    phase: "take",
    side,
    entry,
    stop,
    target: targetOut.target,
    riskRewardRatio,
    riskPct: riskAbs / entry * 100,
    sizeMultiplier,
    anchorPoolId: pool2.id,
    rationale
  };
}
function pickDominantArm(arms) {
  if (arms.dominantSide === "upper" && arms.upper) {
    return { side: "upper", pool: arms.upper.pool };
  }
  if (arms.dominantSide === "lower" && arms.lower) {
    return { side: "lower", pool: arms.lower.pool };
  }
  return null;
}

// server/modules/zenny/decision/assembleTradePlans.ts
function assembleTradePlans(input) {
  const perTimeframe = {};
  const plansPerTimeframe = {};
  if (!input.regimeAssessment) {
    return { primary: null, perTimeframe, plansPerTimeframe };
  }
  for (const [tf, tfAssessment] of Object.entries(
    input.regimeAssessment.perTimeframe
  )) {
    if (!tfAssessment.recommended) continue;
    const tfCandles = input.perTfCandles.get(tf);
    const tfArms = input.armsPerTimeframe[tf];
    const tfPools = input.enrichedPoolsPerTimeframe[tf];
    if (!tfCandles || !tfArms || !tfPools) continue;
    if (tfCandles.length === 0) continue;
    const currentPrice = tfCandles[tfCandles.length - 1].close;
    if (currentPrice <= 0) continue;
    const tfPlans = [];
    const takePlan = proposeWickTrade({
      timeframe: tf,
      candles: tfCandles,
      currentPrice,
      arms: tfArms,
      pools: tfPools,
      assessment: tfAssessment,
      config: input.wickConfig
    });
    if (takePlan !== null) tfPlans.push(takePlan);
    const reachPlan = proposeReachTrade({
      timeframe: tf,
      candles: tfCandles,
      currentPrice,
      arms: tfArms,
      pools: tfPools,
      assessment: tfAssessment,
      config: input.reachConfig
    });
    if (reachPlan !== null) tfPlans.push(reachPlan);
    const selectedPlans = selectTradePlansForTimeframe(tfPlans, currentPrice);
    if (selectedPlans.length > 0) {
      plansPerTimeframe[tf] = selectedPlans;
      perTimeframe[tf] = selectedPlans[0];
    }
  }
  return {
    primary: perTimeframe[input.primaryTimeframe] ?? null,
    perTimeframe,
    plansPerTimeframe
  };
}

// server/modules/zenny/analysis/orchestrator.ts
var TF_RANK = {
  "15m": 0,
  "1H": 1,
  "4H": 2,
  "12H": 3,
  D: 4,
  W: 5,
  M: 6
};
async function runAnalysis(input) {
  const candleCount = input.candleCountPerTf ?? 200;
  const stack = input.timeframeStack ?? DEFAULT_TIMEFRAME_STACK;
  const pivotN = input.pivotN ?? 2;
  const fetchResults = await Promise.all(
    stack.map(async (tf) => {
      try {
        const candles = await getCandles(input.provider, {
          symbol: input.symbol,
          timeframe: tf,
          count: candleCount
        });
        return { tf, candles };
      } catch {
        return { tf, candles: [] };
      }
    })
  );
  const perTfCandles = /* @__PURE__ */ new Map();
  const analysedTfs = [];
  for (const { tf, candles } of fetchResults) {
    if (candles.length < pivotN * 2 + 1) continue;
    perTfCandles.set(tf, candles);
    analysedTfs.push(tf);
  }
  const primaryCandles = perTfCandles.get(input.primaryTimeframe) ?? [];
  if (primaryCandles.length === 0) {
    return {
      symbol: input.symbol,
      primaryTimeframe: input.primaryTimeframe,
      analysedTimeframes: analysedTfs,
      candles: [],
      levels: [],
      pools: [],
      passInfo: {},
      arms: { upper: null, lower: null, dominantSide: "neither" },
      armsPerTimeframe: {},
      regimeAssessment: null,
      regimeHistory: [],
      regimeHistoryPerTimeframe: {},
      feedHealthPerTimeframe: {},
      tradePlan: null,
      tradePlanResult: { primary: null, perTimeframe: {}, plansPerTimeframe: {} },
      depth: null,
      orderFlow: null,
      computedAtMs: Date.now()
    };
  }
  const levels = [];
  const pools = [];
  for (const tf of analysedTfs) {
    const candles = perTfCandles.get(tf);
    const pivots = findBodyPivots({ candles, n: pivotN });
    for (const pivot of pivots) {
      const breakResult = isLevelBroken(candles, pivot);
      const rawIndex = findClosestCandleIndex(
        primaryCandles,
        pivot.candleOpenTime
      );
      const swingCandleIndexOnPrimary = rawIndex < 0 ? -1 : Math.min(rawIndex, primaryCandles.length - 1);
      const recency = swingCandleIndexOnPrimary < 0 ? 0 : Math.min(
        1,
        swingCandleIndexOnPrimary / Math.max(1, primaryCandles.length - 1)
      );
      const strength = levelStrength({
        sourceTimeframe: tf,
        recency,
        isPrimaryTimeframe: tf === input.primaryTimeframe
      });
      const levelId = makeLevelId(input.symbol, tf, pivot);
      levels.push({
        id: levelId,
        price: pivot.price,
        wickPrice: pivot.wickPrice,
        side: pivot.side,
        sourceTimeframe: tf,
        swingCandleTime: pivot.candleOpenTime,
        swingCandleIndexOnPrimary,
        source: "swing",
        matchingTimeframes: [],
        confluenceCount: 0,
        clusterMemberIds: [],
        recency,
        strength,
        graduatedToPoolId: null,
        broken: breakResult.broken,
        passes: {}
      });
    }
    const liquidityCandidates = findLiquidityPools({
      symbol: input.symbol,
      timeframe: tf,
      candles,
      depletionCandles: primaryCandles
    });
    for (const candidate of liquidityCandidates) {
      const rawIndex = findClosestCandleIndex(
        primaryCandles,
        candidate.sourceOpenTime
      );
      const sourceIndexOnPrimary = rawIndex < 0 ? -1 : Math.min(rawIndex, primaryCandles.length - 1);
      const recency = sourceIndexOnPrimary < 0 ? 0 : Math.min(
        1,
        sourceIndexOnPrimary / Math.max(1, primaryCandles.length - 1)
      );
      const strength = levelStrength({
        sourceTimeframe: tf,
        recency,
        isPrimaryTimeframe: tf === input.primaryTimeframe
      });
      pools.push({
        id: `pool-${candidate.kind}-${candidate.idSeed}`,
        symbol: input.symbol,
        sourceTimeframe: tf,
        type: candidate.side,
        kind: candidate.kind,
        linePrice: candidate.targetPrice,
        wickHigh: candidate.zoneHigh,
        wickLow: candidate.zoneLow,
        centreLine: (candidate.zoneHigh + candidate.zoneLow) / 2,
        birthCandleTime: candidate.sourceOpenTime,
        birthCandleIndexOnPrimary: sourceIndexOnPrimary,
        sweptCandleTime: null,
        sweptCandleIndexOnPrimary: null,
        sweepReason: null,
        deathCandleTime: null,
        deathCandleIndexOnPrimary: null,
        deathReason: null,
        status: "active",
        confluenceCount: candidate.touchCount,
        strength,
        pull: null
      });
    }
    const closedCandles = candles.length > 1 ? candles.slice(0, -1) : candles;
    const clusters = findBodyClusters({
      candles: closedCandles,
      tolerancePct: clusterTolerancePct(tf)
    });
    for (const cluster of clusters) {
      const lastTouchPrimaryIdxRaw = findClosestCandleIndex(
        primaryCandles,
        cluster.lastTouchOpenTime
      );
      const lastTouchPrimaryIdx = lastTouchPrimaryIdxRaw < 0 ? -1 : Math.min(lastTouchPrimaryIdxRaw, primaryCandles.length - 1);
      const firstTouchPrimaryIdxRaw = findClosestCandleIndex(
        primaryCandles,
        cluster.firstTouchOpenTime
      );
      const firstTouchPrimaryIdx = firstTouchPrimaryIdxRaw < 0 ? -1 : Math.min(firstTouchPrimaryIdxRaw, primaryCandles.length - 1);
      const synthPivot = {
        index: cluster.lastTouchIndex,
        side: cluster.side,
        price: cluster.price,
        wickPrice: cluster.price,
        candleOpenTime: cluster.lastTouchOpenTime
      };
      const breakResult = isLevelBroken(candles, synthPivot);
      const recencyClus = lastTouchPrimaryIdx < 0 ? 0 : Math.min(
        1,
        lastTouchPrimaryIdx / Math.max(1, primaryCandles.length - 1)
      );
      const strengthClus = levelStrength({
        sourceTimeframe: tf,
        recency: recencyClus,
        isPrimaryTimeframe: tf === input.primaryTimeframe
      });
      const clusterId = `cluster-${input.symbol}-${tf}-${cluster.firstTouchIndex}-${Math.round(cluster.price)}`;
      levels.push({
        id: clusterId,
        price: cluster.price,
        wickPrice: cluster.price,
        side: cluster.side,
        sourceTimeframe: tf,
        swingCandleTime: cluster.firstTouchOpenTime,
        swingCandleIndexOnPrimary: firstTouchPrimaryIdx,
        source: "cluster",
        matchingTimeframes: [],
        confluenceCount: 0,
        clusterMemberIds: [],
        recency: recencyClus,
        strength: strengthClus,
        graduatedToPoolId: null,
        broken: breakResult.broken,
        passes: {}
      });
    }
  }
  const passConfig = input.passConfig ?? getDefaultPassConfigForTimeframe2(input.primaryTimeframe) ?? DEFAULT_PASS_CONFIG2;
  const passResult = runPasses(
    {
      levels,
      perTfCandles,
      primaryCandles,
      primaryTimeframe: input.primaryTimeframe
    },
    passConfig
  );
  const wireAngle = passResult.passInfo.wireAngle;
  const armsPerTimeframe = {};
  const enrichedPoolsPerTimeframe = {};
  const regimeAssessmentPerTimeframe = {};
  const regimeHistoryPerTimeframe = {};
  const feedHealthPerTimeframe = {};
  const nowMs = Date.now();
  for (const tf of analysedTfs) {
    const tfCandles = perTfCandles.get(tf);
    if (!tfCandles || tfCandles.length === 0) continue;
    const tfPrice = tfCandles[tfCandles.length - 1].close;
    if (tfPrice <= 0) continue;
    const lastOpenTime = tfCandles[tfCandles.length - 1].openTime;
    const lastCandleAgeMs = Math.max(0, nowMs - lastOpenTime);
    const expectedBarMs = TF_BAR_DURATION_MS[tf];
    feedHealthPerTimeframe[tf] = {
      status: lastCandleAgeMs <= expectedBarMs * 2 ? "healthy" : "degraded",
      lastCandleAgeMs,
      expectedBarMs
    };
    const tfRank = TF_RANK[tf];
    const relevantPools = pools.filter(
      (p) => (TF_RANK[p.sourceTimeframe] ?? 0) >= tfRank
    );
    const tfPulls = runPullPass(
      { pools: relevantPools, primaryCandles: tfCandles },
      DEFAULT_PULL_PASS_CONFIG
    );
    const tfEnrichedPools = relevantPools.map((p) => ({
      ...p,
      pull: tfPulls.get(p.id) ?? null
    }));
    enrichedPoolsPerTimeframe[tf] = tfEnrichedPools;
    const tfArms = extractArms({
      pools: tfEnrichedPools,
      currentPrice: tfPrice
    });
    armsPerTimeframe[tf] = tfArms;
    if (wireAngle !== void 0 && wireAngle.perTimeframe[tf]) {
      const tfAssessment = assembleRegimeAssessment({
        primaryTimeframe: tf,
        wireAngle,
        arms: tfArms,
        pools: tfEnrichedPools,
        levels: passResult.levels,
        currentPrice: tfPrice,
        totalCandles: tfCandles.length,
        feedHealth: feedHealthPerTimeframe[tf],
        liquidations: input.liquidations
      });
      if (tfAssessment) {
        regimeAssessmentPerTimeframe[tf] = tfAssessment.primary;
      }
      regimeHistoryPerTimeframe[tf] = computeRegimeHistory({
        symbol: input.symbol,
        primaryTimeframe: tf,
        primaryCandles: tfCandles,
        pools: tfEnrichedPools,
        levels: passResult.levels,
        wireAngle
      });
    }
  }
  const tradePlanResult = regimeAssessmentPerTimeframe[input.primaryTimeframe] ? assembleTradePlans({
    primaryTimeframe: input.primaryTimeframe,
    perTfCandles,
    armsPerTimeframe,
    enrichedPoolsPerTimeframe,
    regimeAssessment: {
      primary: regimeAssessmentPerTimeframe[input.primaryTimeframe],
      perTimeframe: regimeAssessmentPerTimeframe
    }
  }) : { primary: null, perTimeframe: {}, plansPerTimeframe: {} };
  const primaryArms = armsPerTimeframe[input.primaryTimeframe] ?? {
    upper: null,
    lower: null,
    dominantSide: "neither"
  };
  const primaryEnrichedPools = enrichedPoolsPerTimeframe[input.primaryTimeframe] ?? pools.map((p) => ({ ...p, pull: null }));
  const primaryRegimeHistory = regimeHistoryPerTimeframe[input.primaryTimeframe] ?? [];
  const regimeAssessment = regimeAssessmentPerTimeframe[input.primaryTimeframe] ? {
    primary: regimeAssessmentPerTimeframe[input.primaryTimeframe],
    perTimeframe: regimeAssessmentPerTimeframe
  } : null;
  return {
    symbol: input.symbol,
    primaryTimeframe: input.primaryTimeframe,
    analysedTimeframes: analysedTfs,
    candles: primaryCandles,
    levels: passResult.levels,
    pools: primaryEnrichedPools,
    passInfo: passResult.passInfo,
    arms: primaryArms,
    armsPerTimeframe,
    regimeAssessment,
    regimeHistory: primaryRegimeHistory,
    regimeHistoryPerTimeframe,
    feedHealthPerTimeframe,
    tradePlan: tradePlanResult.primary,
    tradePlanResult,
    depth: null,
    orderFlow: null,
    computedAtMs: Date.now()
  };
}
function makeLevelId(symbol, tf, pivot) {
  return `lvl-${symbol}-${tf}-${pivot.index}-${Math.round(pivot.price)}`;
}
function clusterTolerancePct(tf) {
  switch (tf) {
    case "15m":
      return 15e-4;
    case "1H":
      return 2e-3;
    case "4H":
      return 28e-4;
    case "12H":
      return 35e-4;
    case "D":
      return 45e-4;
    case "W":
      return 7e-3;
    case "M":
      return 0.01;
    default:
      return 25e-4;
  }
}
function findClosestCandleIndex(candles, openTime) {
  if (candles.length === 0) return 0;
  if (openTime < candles[0].openTime) return -1;
  if (openTime > candles[candles.length - 1].openTime) return candles.length;
  let closestIdx = 0;
  let closestDelta = Infinity;
  for (let i = 0; i < candles.length; i++) {
    const d = Math.abs(candles[i].openTime - openTime);
    if (d < closestDelta) {
      closestDelta = d;
      closestIdx = i;
    }
  }
  return closestIdx;
}

// server/modules/zenny/analysis/data/fetchRecentLiquidations.ts
import { desc as desc2, eq as eq2, gte as gte2, and as and2 } from "drizzle-orm";
var DEFAULT_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1e3;
var DEFAULT_LIMIT = 5e3;
async function fetchRecentLiquidations(opts) {
  const lookbackMs = opts.lookbackMs ?? DEFAULT_LOOKBACK_MS;
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const since = new Date(Date.now() - lookbackMs);
  const rows = await db.select({
    price: binanceLiquidations.price,
    usdValue: binanceLiquidations.usdValue,
    eventTime: binanceLiquidations.eventTime,
    positionSide: binanceLiquidations.positionSide
  }).from(binanceLiquidations).where(
    and2(
      eq2(binanceLiquidations.symbol, opts.symbol),
      gte2(binanceLiquidations.eventTime, since)
    )
  ).orderBy(desc2(binanceLiquidations.eventTime)).limit(limit);
  return rows.map((r) => ({
    price: Number(r.price),
    usdValue: Number(r.usdValue),
    eventTimeMs: r.eventTime.getTime(),
    positionSide: r.positionSide
  }));
}

// server/modules/zenny/execution/computeSize.ts
function computeSize(input) {
  if (input.equity <= 0) return null;
  if (input.plan.riskPct <= 0) return null;
  if (input.plan.sizeMultiplier <= 0) return null;
  const stopDistance = Math.abs(input.plan.entry - input.plan.stop);
  if (stopDistance === 0) return null;
  const riskBudget = input.equity * (input.plan.riskPct / 100) * input.plan.sizeMultiplier;
  const size = riskBudget / stopDistance;
  if (!Number.isFinite(size) || size <= 0) return null;
  const notional = size * input.plan.entry;
  return { size, notional };
}

// server/modules/zenny/execution/createPosition.ts
function createPosition(input) {
  return {
    id: input.id,
    symbol: input.symbol,
    timeframe: input.plan.timeframe,
    phase: input.plan.phase,
    side: input.plan.side,
    entryPrice: input.plan.entry,
    stopPrice: input.plan.stop,
    targetPrice: input.plan.target,
    riskPct: input.plan.riskPct,
    sizeMultiplier: input.plan.sizeMultiplier,
    size: null,
    notional: null,
    emittedAtBarTs: input.emittedAtBarTs,
    submittedAtBarTs: null,
    filledAtBarTs: null,
    closedAtBarTs: null,
    fillPrice: null,
    closePrice: null,
    realisedPnl: null,
    status: "PLANNED",
    exitReason: null,
    rejectionReason: null,
    lastEvaluatedAt: input.emittedAtBarTs
  };
}
function submitPosition(position, equity, submittedAtBarTs) {
  const sizing = computeSize({
    equity,
    plan: {
      entry: position.entryPrice,
      stop: position.stopPrice,
      riskPct: position.riskPct,
      sizeMultiplier: position.sizeMultiplier
    }
  });
  if (sizing === null) {
    return {
      ...position,
      status: "REJECTED",
      exitReason: "sizing",
      rejectionReason: "computeSize returned null",
      lastEvaluatedAt: submittedAtBarTs
    };
  }
  return {
    ...position,
    status: "LIVE",
    size: sizing.size,
    notional: sizing.notional,
    submittedAtBarTs,
    lastEvaluatedAt: submittedAtBarTs
  };
}

// server/modules/zenny/execution/executionConfig.ts
var DEFAULT_EXECUTION_CONFIG = {
  fillMode: "next-bar-touch",
  sameBarConflict: "stop-wins",
  slippageBps: 5,
  applySlippageToLimits: false,
  entryValidBars: 5,
  trailMode: "static",
  maxBarsInTrade: null,
  softKillDrawdownPct: 20,
  hardKillDrawdownPct: 30,
  killSwitchReference: "peak"
};

// server/modules/zenny/execution/killSwitchEvaluate.ts
function killSwitchEvaluate(input) {
  if (input.previousKillStatus === "HARD_TRIPPED") {
    return {
      killStatus: "HARD_TRIPPED",
      drawdownPct: drawdown(
        input.currentEquity,
        referenceEquity(input)
      ),
      reference: input.config.killSwitchReference
    };
  }
  const ref = referenceEquity(input);
  if (ref <= 0) {
    return {
      killStatus: "OK",
      drawdownPct: 0,
      reference: input.config.killSwitchReference
    };
  }
  const ddPct = drawdown(input.currentEquity, ref);
  if (ddPct >= input.config.hardKillDrawdownPct) {
    return {
      killStatus: "HARD_TRIPPED",
      drawdownPct: ddPct,
      reference: input.config.killSwitchReference
    };
  }
  if (ddPct >= input.config.softKillDrawdownPct) {
    return {
      killStatus: "SOFT_TRIPPED",
      drawdownPct: ddPct,
      reference: input.config.killSwitchReference
    };
  }
  return {
    killStatus: "OK",
    drawdownPct: ddPct,
    reference: input.config.killSwitchReference
  };
}
function referenceEquity(input) {
  if (input.config.killSwitchReference === "starting") {
    return input.startingEquity;
  }
  return input.peakEquity;
}
function drawdown(current, reference) {
  if (reference <= 0) return 0;
  if (current >= reference) return 0;
  return (reference - current) / reference * 100;
}

// server/modules/zenny/execution/applyFillRules.ts
function applyFillRules(input) {
  const { orderKind, orderPrice, side, bar } = input;
  if (!wasOrderTriggered(input)) return null;
  const isLimit = orderKind === "entry-limit" || orderKind === "target-limit";
  const slipApplies = !isLimit || input.applySlippageToLimits;
  if (!slipApplies) {
    return { kind: orderKind, fillPrice: orderPrice };
  }
  const slipFactor = input.slippageBps / 1e4;
  const slipped = side === "long" ? orderPrice * (1 - slipFactor) : orderPrice * (1 + slipFactor);
  return { kind: orderKind, fillPrice: slipped };
}
function wasOrderTriggered(input) {
  const { orderKind, orderPrice, side, bar } = input;
  if (orderKind === "entry-limit") {
    return side === "long" ? bar.low <= orderPrice : bar.high >= orderPrice;
  }
  if (orderKind === "target-limit") {
    return side === "long" ? bar.high >= orderPrice : bar.low <= orderPrice;
  }
  return side === "long" ? bar.low <= orderPrice : bar.high >= orderPrice;
}
function checkEntryFill(input) {
  return applyFillRules({
    orderKind: "entry-limit",
    orderPrice: input.entryPrice,
    side: input.side,
    bar: input.bar,
    slippageBps: input.config.slippageBps,
    applySlippageToLimits: input.config.applySlippageToLimits
  });
}
function checkStopFill(input) {
  return applyFillRules({
    orderKind: "stop-market",
    orderPrice: input.stopPrice,
    side: input.side,
    bar: input.bar,
    slippageBps: input.config.slippageBps,
    applySlippageToLimits: input.config.applySlippageToLimits
  });
}
function checkTargetFill(input) {
  return applyFillRules({
    orderKind: "target-limit",
    orderPrice: input.targetPrice,
    side: input.side,
    bar: input.bar,
    slippageBps: input.config.slippageBps,
    applySlippageToLimits: input.config.applySlippageToLimits
  });
}

// server/modules/zenny/execution/resolveSameBarConflict.ts
function resolveSameBarConflict(input) {
  const { mode, bar, side } = input;
  if (mode === "stop-wins") return "stop-market";
  if (mode === "target-wins") return "target-limit";
  if (mode === "use-lower-tf") return "stop-market";
  const distFromOpenToHigh = Math.abs(bar.high - bar.open);
  const distFromOpenToLow = Math.abs(bar.open - bar.low);
  const lowFirst = distFromOpenToLow < distFromOpenToHigh;
  if (side === "long") {
    return lowFirst ? "stop-market" : "target-limit";
  }
  return lowFirst ? "target-limit" : "stop-market";
}

// server/modules/zenny/execution/reduceStep.ts
function reduceStep(input) {
  const { position, bar, equity, config } = input;
  if (bar.openTime <= position.lastEvaluatedAt) {
    throw new Error(
      `reduceStep lookahead violation: bar.openTime ${bar.openTime} <= lastEvaluatedAt ${position.lastEvaluatedAt}`
    );
  }
  if (equity <= 0) {
    throw new Error(`reduceStep requires equity > 0, got ${equity}`);
  }
  if (isTerminal(position.status)) return position;
  if (bar.gapFilled === true) {
    return { ...position, lastEvaluatedAt: bar.openTime };
  }
  if (position.status === "PLANNED") {
    return tryPlannedTransition(position, bar, equity);
  }
  if (position.status === "LIVE") {
    return tryLiveTransition(position, bar, config);
  }
  if (position.status === "FILLED") {
    return tryFilledTransition(position, bar, config);
  }
  return position;
}
function tryPlannedTransition(position, bar, equity) {
  const sizing = computeSize({
    equity,
    plan: {
      entry: position.entryPrice,
      stop: position.stopPrice,
      riskPct: position.riskPct,
      sizeMultiplier: position.sizeMultiplier
    }
  });
  if (sizing === null) {
    return reject(position, bar, "sizing");
  }
  return {
    ...position,
    status: "LIVE",
    size: sizing.size,
    notional: sizing.notional,
    submittedAtBarTs: bar.openTime,
    lastEvaluatedAt: bar.openTime
  };
}
function tryLiveTransition(position, bar, config) {
  const submittedAt = position.submittedAtBarTs ?? position.emittedAtBarTs;
  if (bar.openTime <= submittedAt) {
    return { ...position, lastEvaluatedAt: bar.openTime };
  }
  const approxBarMs = Math.max(1, bar.closeTime - bar.openTime + 1);
  const elapsedBars = Math.floor(
    (bar.openTime - submittedAt) / approxBarMs
  );
  if (elapsedBars >= config.entryValidBars) {
    return expire(position, bar);
  }
  const fill = checkEntryFill({
    side: position.side,
    bar,
    entryPrice: position.entryPrice,
    config
  });
  if (fill === null) {
    return { ...position, lastEvaluatedAt: bar.openTime };
  }
  return fillEntry(position, bar, fill);
}
function tryFilledTransition(position, bar, config) {
  if (config.maxBarsInTrade !== null && position.filledAtBarTs !== null) {
    const approxBarMs = Math.max(1, bar.closeTime - bar.openTime + 1);
    const elapsedBars = Math.floor(
      (bar.openTime - position.filledAtBarTs) / approxBarMs
    );
    if (elapsedBars >= config.maxBarsInTrade) {
      return closeAt(position, bar, bar.close, "operator");
    }
  }
  const stopFill = checkStopFill({
    side: position.side,
    bar,
    stopPrice: position.stopPrice,
    config
  });
  const targetFill = checkTargetFill({
    side: position.side,
    bar,
    targetPrice: position.targetPrice,
    config
  });
  if (stopFill === null && targetFill === null) {
    return { ...position, lastEvaluatedAt: bar.openTime };
  }
  if (stopFill !== null && targetFill === null) {
    return closeAt(position, bar, stopFill.fillPrice, "stop");
  }
  if (stopFill === null && targetFill !== null) {
    return closeAt(position, bar, targetFill.fillPrice, "target");
  }
  const winner = resolveSameBarConflict({
    bar,
    side: position.side,
    mode: config.sameBarConflict
  });
  const fill = winner === "stop-market" ? stopFill : targetFill;
  const reason = winner === "stop-market" ? "stop" : "target";
  return closeAt(position, bar, fill.fillPrice, reason);
}
function isTerminal(status) {
  return status === "CLOSED" || status === "CANCELLED" || status === "EXPIRED" || status === "REJECTED";
}
function reject(position, bar, reason) {
  return {
    ...position,
    status: "REJECTED",
    exitReason: reason,
    rejectionReason: rejectionMessage(reason),
    lastEvaluatedAt: bar.openTime
  };
}
function expire(position, bar) {
  return {
    ...position,
    status: "EXPIRED",
    exitReason: "valid-bars-elapsed",
    lastEvaluatedAt: bar.openTime
  };
}
function fillEntry(position, bar, fill) {
  return {
    ...position,
    status: "FILLED",
    fillPrice: fill.fillPrice,
    filledAtBarTs: bar.openTime,
    lastEvaluatedAt: bar.openTime
  };
}
function closeAt(position, bar, closePrice, reason) {
  if (position.fillPrice === null || position.size === null) {
    return position;
  }
  const pnl = computePnl(
    position.side,
    position.fillPrice,
    closePrice,
    position.size
  );
  return {
    ...position,
    status: "CLOSED",
    closePrice,
    closedAtBarTs: bar.openTime,
    realisedPnl: pnl,
    exitReason: reason,
    lastEvaluatedAt: bar.openTime
  };
}
function computePnl(side, entry, exit, size) {
  return side === "long" ? (exit - entry) * size : (entry - exit) * size;
}
function rejectionMessage(reason) {
  if (reason === "sizing") return "computeSize returned null";
  if (reason === "gap") return "first bar after PLANNED was gap-filled";
  if (reason === "equity-zero") return "account equity is zero or negative";
  if (reason === "risk-veto") return "risk manager rejected the plan";
  return reason;
}

// server/modules/zenny/persistence/paperTradeStore.ts
import { and as and3, eq as eq3 } from "drizzle-orm";
function toRow(p) {
  return {
    id: p.id,
    symbol: p.symbol,
    timeframe: p.timeframe,
    phase: p.phase,
    side: p.side,
    entryPrice: String(p.entryPrice),
    stopPrice: String(p.stopPrice),
    targetPrice: String(p.targetPrice),
    riskPct: String(p.riskPct),
    sizeMultiplier: String(p.sizeMultiplier),
    size: p.size === null ? null : String(p.size),
    notional: p.notional === null ? null : String(p.notional),
    emittedAtBarTs: String(p.emittedAtBarTs),
    submittedAtBarTs: p.submittedAtBarTs === null ? null : String(p.submittedAtBarTs),
    filledAtBarTs: p.filledAtBarTs === null ? null : String(p.filledAtBarTs),
    closedAtBarTs: p.closedAtBarTs === null ? null : String(p.closedAtBarTs),
    fillPrice: p.fillPrice === null ? null : String(p.fillPrice),
    closePrice: p.closePrice === null ? null : String(p.closePrice),
    realisedPnl: p.realisedPnl === null ? null : String(p.realisedPnl),
    status: p.status,
    exitReason: p.exitReason,
    rejectionReason: p.rejectionReason,
    lastEvaluatedAt: String(p.lastEvaluatedAt),
    updatedAt: /* @__PURE__ */ new Date()
  };
}
function fromRow(r) {
  return {
    id: r.id,
    symbol: r.symbol,
    timeframe: r.timeframe,
    phase: r.phase ?? "take",
    side: r.side,
    entryPrice: Number(r.entryPrice),
    stopPrice: Number(r.stopPrice),
    targetPrice: Number(r.targetPrice),
    riskPct: Number(r.riskPct),
    sizeMultiplier: Number(r.sizeMultiplier),
    size: r.size === null ? null : Number(r.size),
    notional: r.notional === null ? null : Number(r.notional),
    emittedAtBarTs: Number(r.emittedAtBarTs),
    submittedAtBarTs: r.submittedAtBarTs === null ? null : Number(r.submittedAtBarTs),
    filledAtBarTs: r.filledAtBarTs === null ? null : Number(r.filledAtBarTs),
    closedAtBarTs: r.closedAtBarTs === null ? null : Number(r.closedAtBarTs),
    fillPrice: r.fillPrice === null ? null : Number(r.fillPrice),
    closePrice: r.closePrice === null ? null : Number(r.closePrice),
    realisedPnl: r.realisedPnl === null ? null : Number(r.realisedPnl),
    status: r.status,
    exitReason: r.exitReason ?? null,
    rejectionReason: r.rejectionReason,
    lastEvaluatedAt: Number(r.lastEvaluatedAt)
  };
}
var OPEN_STATES = ["PLANNED", "LIVE", "FILLED"];
async function loadOpenPositions(symbol, timeframe) {
  const rows = await db.select().from(zennyPaperPositions).where(
    and3(
      eq3(zennyPaperPositions.symbol, symbol),
      eq3(zennyPaperPositions.timeframe, timeframe)
    )
  );
  return rows.filter((r) => OPEN_STATES.includes(r.status)).map(fromRow);
}
async function upsertPosition(p) {
  const row = toRow(p);
  await db.insert(zennyPaperPositions).values(row).onConflictDoUpdate({
    target: zennyPaperPositions.id,
    set: {
      ...row,
      updatedAt: /* @__PURE__ */ new Date()
    }
  });
}
async function listPositions(symbol, timeframe, limit = 100) {
  const rows = await db.select().from(zennyPaperPositions).where(
    and3(
      eq3(zennyPaperPositions.symbol, symbol),
      eq3(zennyPaperPositions.timeframe, timeframe)
    )
  ).limit(limit);
  return rows.map(fromRow);
}
var DEFAULT_ACCOUNT_ID = "default";
var DEFAULT_STARTING_EQUITY = 500;
async function loadAccount(id = DEFAULT_ACCOUNT_ID) {
  const rows = await db.select().from(zennyPaperAccount).where(eq3(zennyPaperAccount.id, id));
  if (rows.length === 0) {
    const init = {
      id,
      startingEquity: String(DEFAULT_STARTING_EQUITY),
      currentEquity: String(DEFAULT_STARTING_EQUITY),
      peakEquity: String(DEFAULT_STARTING_EQUITY),
      killStatus: "OK",
      drawdownPct: "0"
    };
    await db.insert(zennyPaperAccount).values(init);
    return {
      id,
      startingEquity: DEFAULT_STARTING_EQUITY,
      currentEquity: DEFAULT_STARTING_EQUITY,
      peakEquity: DEFAULT_STARTING_EQUITY,
      killStatus: "OK",
      drawdownPct: 0
    };
  }
  const r = rows[0];
  return {
    id: r.id,
    startingEquity: Number(r.startingEquity),
    currentEquity: Number(r.currentEquity),
    peakEquity: Number(r.peakEquity),
    killStatus: r.killStatus,
    drawdownPct: Number(r.drawdownPct)
  };
}
async function upsertAccount(acct) {
  await db.insert(zennyPaperAccount).values({
    id: acct.id,
    startingEquity: String(acct.startingEquity),
    currentEquity: String(acct.currentEquity),
    peakEquity: String(acct.peakEquity),
    killStatus: acct.killStatus,
    drawdownPct: String(acct.drawdownPct)
  }).onConflictDoUpdate({
    target: zennyPaperAccount.id,
    set: {
      currentEquity: String(acct.currentEquity),
      peakEquity: String(acct.peakEquity),
      killStatus: acct.killStatus,
      drawdownPct: String(acct.drawdownPct),
      updatedAt: /* @__PURE__ */ new Date()
    }
  });
}
async function logTick(input) {
  await db.insert(zennyPaperTickLog).values({
    symbol: input.symbol,
    timeframe: input.timeframe,
    summary: input.summary,
    error: input.error
  });
}

// server/modules/zenny/runner/runPaperTradeTick.ts
async function runPaperTradeTick(input) {
  const cfg = input.config ?? DEFAULT_EXECUTION_CONFIG;
  const now = input.now ?? Date.now();
  let account = await loadAccount();
  const transitions = [];
  let newPositionId = null;
  let noTransitionReason = null;
  if (account.killStatus === "HARD_TRIPPED") {
    noTransitionReason = "kill-switch-hard-tripped";
    await logTick({
      symbol: input.symbol,
      timeframe: input.timeframe,
      summary: { hadOpenPosition: false, transitions, account, noTransitionReason }
    });
    return {
      symbol: input.symbol,
      timeframe: input.timeframe,
      tickAt: now,
      hadOpenPosition: false,
      newPositionId: null,
      transitions,
      account: pickAccount(account),
      noTransitionReason
    };
  }
  let analysisState;
  try {
    let liquidations = [];
    try {
      liquidations = await fetchRecentLiquidations({ symbol: input.symbol });
    } catch {
    }
    analysisState = await runAnalysis({
      provider: input.provider,
      symbol: input.symbol,
      primaryTimeframe: input.timeframe,
      candleCountPerTf: input.candleCount ?? 200,
      liquidations
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logTick({
      symbol: input.symbol,
      timeframe: input.timeframe,
      summary: { error: msg, account },
      error: msg
    });
    throw err;
  }
  const latestClosedBar = pickLatestClosedBar(analysisState.candles, now);
  if (!latestClosedBar) {
    noTransitionReason = "no-closed-bar-yet";
    await logTick({
      symbol: input.symbol,
      timeframe: input.timeframe,
      summary: { hadOpenPosition: false, transitions, account, noTransitionReason }
    });
    return {
      symbol: input.symbol,
      timeframe: input.timeframe,
      tickAt: now,
      hadOpenPosition: false,
      newPositionId: null,
      transitions,
      account: pickAccount(account),
      noTransitionReason
    };
  }
  const openPositions = await loadOpenPositions(input.symbol, input.timeframe);
  for (const pos of openPositions) {
    if (latestClosedBar.openTime <= pos.lastEvaluatedAt) {
      continue;
    }
    const before = pos.status;
    const after = reduceStep({
      position: pos,
      bar: latestClosedBar,
      equity: account.currentEquity,
      config: cfg
    });
    await upsertPosition(after);
    if (after.status !== before) {
      transitions.push({
        id: after.id,
        from: before,
        to: after.status,
        reason: after.exitReason
      });
    }
    if (after.status === "CLOSED" && before === "FILLED" && after.realisedPnl !== null) {
      account = applyPnl(account, after.realisedPnl);
    }
  }
  const tfPlans = analysisState.tradePlanResult.plansPerTimeframe?.[input.timeframe] ?? [];
  const stillOpen = (await loadOpenPositions(input.symbol, input.timeframe)).filter(
    (p) => p.status === "PLANNED" || p.status === "LIVE" || p.status === "FILLED"
  );
  const openPhases = new Set(stillOpen.map((p) => p.phase));
  const newPositionIds = [];
  if (account.killStatus === "OK") {
    for (const plan of tfPlans) {
      if (openPhases.has(plan.phase)) continue;
      const drafted = createPosition({
        id: makePositionId(
          input.symbol,
          input.timeframe,
          plan.phase,
          latestClosedBar.openTime
        ),
        symbol: input.symbol,
        plan,
        emittedAtBarTs: latestClosedBar.openTime
      });
      const pos = submitPosition(
        drafted,
        account.currentEquity,
        latestClosedBar.closeTime
      );
      await upsertPosition(pos);
      newPositionIds.push(pos.id);
      openPhases.add(plan.phase);
    }
  }
  if (newPositionIds.length > 0) {
    newPositionId = newPositionIds[0];
  } else if (tfPlans.length === 0 && stillOpen.length === 0) {
    noTransitionReason = "no-trade-plan";
  } else if (account.killStatus === "SOFT_TRIPPED") {
    noTransitionReason = "kill-switch-soft-tripped";
  }
  const killOut = killSwitchEvaluate({
    currentEquity: account.currentEquity,
    peakEquity: account.peakEquity,
    startingEquity: account.startingEquity,
    previousKillStatus: account.killStatus,
    config: cfg
  });
  account = {
    ...account,
    killStatus: killOut.killStatus,
    drawdownPct: killOut.drawdownPct
  };
  await upsertAccount(account);
  await logTick({
    symbol: input.symbol,
    timeframe: input.timeframe,
    summary: {
      hadOpenPosition: openPositions.length > 0,
      transitions,
      newPositionId,
      account: pickAccount(account),
      noTransitionReason
    }
  });
  return {
    symbol: input.symbol,
    timeframe: input.timeframe,
    tickAt: now,
    hadOpenPosition: openPositions.length > 0,
    newPositionId,
    transitions,
    account: pickAccount(account),
    noTransitionReason
  };
}
function applyPnl(account, pnl) {
  const newEquity = account.currentEquity + pnl;
  const newPeak = Math.max(account.peakEquity, newEquity);
  return {
    ...account,
    currentEquity: newEquity,
    peakEquity: newPeak
  };
}
function pickAccount(account) {
  return {
    currentEquity: account.currentEquity,
    peakEquity: account.peakEquity,
    killStatus: account.killStatus,
    drawdownPct: account.drawdownPct
  };
}
function pickLatestClosedBar(candles, now) {
  for (let i = candles.length - 1; i >= 0; i--) {
    const c = candles[i];
    if (c.closeTime <= now) {
      return {
        openTime: c.openTime,
        closeTime: c.closeTime,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close
      };
    }
  }
  return null;
}
function makePositionId(symbol, timeframe, phase, bar) {
  return `${symbol}-${timeframe}-${phase}-${bar}`;
}

// server/routes/zennyRoutes.ts
var PAPER_TRADE_WATCHLIST = [
  { symbol: "BTCUSDT", timeframe: "15m" }
];
var sharedProvider = null;
function getProvider() {
  if (!sharedProvider) {
    sharedProvider = new BinanceProvider(DEFAULT_INFRASTRUCTURE_CONFIG);
  }
  return sharedProvider;
}
async function runPaperTradeWatchlistTick(provider) {
  const results = [];
  for (const watch of PAPER_TRADE_WATCHLIST) {
    try {
      const r = await runPaperTradeTick({
        provider,
        symbol: watch.symbol,
        timeframe: watch.timeframe
      });
      results.push(r);
    } catch (e) {
      results.push({
        symbol: watch.symbol,
        timeframe: watch.timeframe,
        error: e instanceof Error ? e.message : String(e)
      });
    }
  }
  return results;
}
var VALID_TIMEFRAMES = /* @__PURE__ */ new Set([
  "15m",
  "1H",
  "4H",
  "12H",
  "D",
  "W",
  "M"
]);
function registerZennyRoutes(app2) {
  app2.get(
    "/api/zenny/braid-view-model",
    isAuthenticated,
    async (req, res) => {
      try {
        const symbol = String(req.query.symbol || "BTCUSDT").toUpperCase();
        const timeframe = String(req.query.timeframe || "1H");
        const defaultCount = VALID_TIMEFRAMES.has(timeframe) ? getDefaultBraidCountForTimeframe(timeframe) : getDefaultBraidCountForTimeframe("1H");
        const count = Math.min(
          1500,
          Math.max(
            50,
            parseInt(String(req.query.count || defaultCount), 10) || defaultCount
          )
        );
        if (!VALID_TIMEFRAMES.has(timeframe)) {
          return res.status(400).json({
            error: "invalid_timeframe",
            allowed: Array.from(VALID_TIMEFRAMES)
          });
        }
        let passConfig;
        if (typeof req.query.passConfig === "string") {
          try {
            passConfig = JSON.parse(req.query.passConfig);
          } catch {
          }
        }
        const provider = getProvider();
        let liquidations = [];
        try {
          liquidations = await fetchRecentLiquidations({ symbol });
        } catch (err) {
          console.error("[zenny] fetchRecentLiquidations failed", err);
        }
        const state = await runAnalysis({
          provider,
          symbol,
          primaryTimeframe: timeframe,
          candleCountPerTf: count,
          passConfig,
          liquidations
        });
        let paperPositions = [];
        let paperOpenPositions = [];
        try {
          [paperPositions, paperOpenPositions] = await Promise.all([
            listPositions(symbol, timeframe, 200),
            loadOpenPositions(symbol, timeframe)
          ]);
        } catch (err) {
          console.error("[zenny] paper positions fetch failed", err);
        }
        res.json({
          ...state,
          paperPositions,
          paperOpenPositions
        });
      } catch (err) {
        console.error("[zenny] braid-view-model failed", err);
        res.status(500).json({
          error: "analysis_failed",
          message: err instanceof Error ? err.message : String(err)
        });
      }
    }
  );
  app2.get(
    "/api/zenny/health",
    isAuthenticated,
    async (_req, res) => {
      const provider = getProvider();
      res.json({
        ok: true,
        provider: provider.name,
        rateLimiter: provider.getRateLimiterState(),
        breaker: provider.getBreakerState(),
        recentApiCalls: provider.getApiCallLog().slice(-20)
      });
    }
  );
  app2.post(
    "/api/zenny/dev/paper-trade-tick",
    isAuthenticated,
    async (_req, res) => {
      if (process.env.NODE_ENV === "production") {
        return res.status(404).json({ error: "not_found" });
      }
      try {
        const provider = getProvider();
        const results = await runPaperTradeWatchlistTick(provider);
        res.json({ ok: true, tickedAt: Date.now(), results });
      } catch (err) {
        console.error("[zenny] dev paper-trade-tick failed", err);
        res.status(500).json({
          error: "tick_failed",
          message: err instanceof Error ? err.message : String(err)
        });
      }
    }
  );
  app2.post(
    "/api/zenny/paper-trade-tick",
    async (req, res) => {
      const auth = req.headers.authorization ?? "";
      const expected = process.env.CRON_SECRET;
      if (!expected) {
        return res.status(503).json({
          error: "cron_secret_not_configured",
          hint: "Set CRON_SECRET in Vercel env vars."
        });
      }
      if (auth !== `Bearer ${expected}`) {
        return res.status(401).json({ error: "unauthorized" });
      }
      try {
        const provider = getProvider();
        const results = await runPaperTradeWatchlistTick(provider);
        res.json({ ok: true, tickedAt: Date.now(), results });
      } catch (err) {
        console.error("[zenny] paper-trade-tick failed", err);
        res.status(500).json({
          error: "tick_failed",
          message: err instanceof Error ? err.message : String(err)
        });
      }
    }
  );
  app2.get(
    "/api/zenny/paper-trades",
    async (req, res) => {
      try {
        const symbol = String(req.query.symbol || "BTCUSDT").toUpperCase();
        const timeframe = String(req.query.timeframe || "1H");
        const limit = Math.min(
          500,
          Math.max(1, parseInt(String(req.query.limit || "100"), 10) || 100)
        );
        const [positions, account] = await Promise.all([
          listPositions(symbol, timeframe, limit),
          loadAccount()
        ]);
        const pnlAbs = account.currentEquity - account.startingEquity;
        const pnlPct = account.startingEquity > 0 ? pnlAbs / account.startingEquity * 100 : 0;
        const closedPositions = positions.filter((p) => p.status === "CLOSED");
        const winners = closedPositions.filter(
          (p) => (p.realisedPnl ?? 0) > 0
        ).length;
        const losers = closedPositions.filter(
          (p) => (p.realisedPnl ?? 0) < 0
        ).length;
        res.json({
          symbol,
          timeframe,
          account,
          pnl: {
            abs: pnlAbs,
            pct: pnlPct,
            closedTrades: closedPositions.length,
            winners,
            losers,
            winRate: closedPositions.length > 0 ? winners / closedPositions.length : null
          },
          positions
        });
      } catch (err) {
        res.status(500).json({
          error: "fetch_failed",
          message: err instanceof Error ? err.message : String(err)
        });
      }
    }
  );
}

// server/api.ts
var app = express();
var isProd = process.env.NODE_ENV === "production";
var appUrl = process.env.APP_URL ?? "";
var allowedOrigins = [
  "http://localhost:5000",
  "http://localhost:5173",
  appUrl,
  appUrl.includes("://www.") ? appUrl.replace("://www.", "://") : appUrl.replace("://", "://www.")
].filter((s) => s && s.length > 0);
app.use(
  helmet({
    contentSecurityPolicy: isProd ? void 0 : false,
    crossOriginEmbedderPolicy: false
  })
);
if (isProd) {
  app.use(
    cors({
      origin: (origin, cb) => {
        if (!origin) return cb(null, true);
        if (allowedOrigins.includes(origin)) return cb(null, true);
        return cb(new Error("CORS blocked"));
      },
      credentials: true
    })
  );
} else {
  app.use(cors({ origin: true, credentials: true }));
}
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(
  "/api",
  rateLimit({
    // See server/index.ts for the rationale — 1000/15min per IP gives
    // active dev sessions and active prd users enough headroom while
    // still rate-limited against floods.
    windowMs: 15 * 60 * 1e3,
    max: 1e3,
    standardHeaders: true,
    legacyHeaders: false
  })
);
setupAuth(app);
registerRoutes(app);
registerZennyRoutes(app);
app.use(
  (err, _req, res, _next) => {
    console.error("[error]", err.message);
    const status = err.status || 500;
    res.status(status).json({
      error: isProd ? "internal_error" : err.message
    });
  }
);
var api_default = app;
export {
  api_default as default
};
