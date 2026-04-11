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
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ============================================================================
// Enums
// ============================================================================

export const regimeEnum = pgEnum("regime", [
  "no_trade",
  "ranging",
  "trending",
  "breakout",
  "high_volatility",
  "low_liquidity",
  "accumulation_distribution",
]);

export const botStatusEnum = pgEnum("bot_status", [
  "off",
  "active",
  "paused",
  "halted",
  "error",
]);

export const tradeSideEnum = pgEnum("trade_side", ["long", "short"]);
export const tradeStatusEnum = pgEnum("trade_status", [
  "pending",
  "open",
  "partially_closed",
  "closed",
  "cancelled",
  "rejected",
]);
export const setupModeEnum = pgEnum("setup_mode", ["mode_a", "mode_b"]);

export const accessRequestStatusEnum = pgEnum("access_request_status", [
  "pending",
  "approved",
  "declined",
]);

// ============================================================================
// Baseline: sessions, users, audit, invites, access requests
// ============================================================================

export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (t) => [index("sessions_expire_idx").on(t.expire)]
);

export const users = pgTable("users", {
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
  lastLoginAt: timestamp("last_login_at"),
});

export const invitedUsers = pgTable("invited_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  invitedByUserId: uuid("invited_by_user_id").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const accessRequests = pgTable("access_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 200 }).notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  cell: varchar("cell", { length: 32 }),
  reason: text("reason"),
  status: accessRequestStatusEnum("status").notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  decidedAt: timestamp("decided_at"),
  decidedByUserId: uuid("decided_by_user_id").references(() => users.id),
});

export const auditLogs = pgTable(
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
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("audit_logs_user_idx").on(t.userId),
    index("audit_logs_tenant_idx").on(t.tenantId),
    index("audit_logs_created_idx").on(t.createdAt),
  ]
);

// ============================================================================
// Phoenix core: tenants, configs, exchange keys
// ============================================================================
//
// One tenant per user for now (1:1). Keeping a separate `tenants` table means
// a user can later own multiple isolated bot instances without schema changes
// (PRD §13.3 Phase 3 multi-pair).

export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  name: varchar("name", { length: 200 }).notNull(),
  botStatus: botStatusEnum("bot_status").notNull().default("off"),
  activeRegime: regimeEnum("active_regime").notNull().default("no_trade"),
  activeRegimeSource: varchar("active_regime_source", { length: 16 }).notNull().default("manual"), // 'manual' | 'autopilot'
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
  consecutiveExchangeFailures: integer("consecutive_exchange_failures").notNull().default(0),
});

// Per-tenant risk and strategy configuration. PRD §12.1 — per-tenant, never
// shared. One row per tenant; updated in place with history captured via
// audit_logs.
export const tenantConfigs = pgTable("tenant_configs", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .unique()
    .references(() => tenants.id, { onDelete: "cascade" }),
  paperStartingCapital: numeric("paper_starting_capital", { precision: 20, scale: 2 })
    .notNull()
    .default("10000.00"),
  // Portfolio-aware risk preset. 'auto' lets the engine pick a tier based
  // on capital and reapply on capital changes. 'manual' means the user has
  // hand-tuned the parameters and the engine should leave them alone.
  portfolioTier: varchar("portfolio_tier", { length: 16 }).notNull().default("auto"),
  riskPercentPerTrade: numeric("risk_percent_per_trade", { precision: 5, scale: 3 })
    .notNull()
    .default("1.000"),
  maxConcurrentPositions: integer("max_concurrent_positions").notNull().default(2),
  dailyDrawdownLimitPct: numeric("daily_drawdown_limit_pct", { precision: 5, scale: 2 })
    .notNull()
    .default("3.00"),
  weeklyDrawdownLimitPct: numeric("weekly_drawdown_limit_pct", { precision: 5, scale: 2 })
    .notNull()
    .default("6.00"),
  minRiskRewardRatio: numeric("min_risk_reward_ratio", { precision: 4, scale: 2 })
    .notNull()
    .default("2.00"),
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
  tradingTimeframe: varchar("trading_timeframe", { length: 8 })
    .notNull()
    .default("15m"),
  temporalRules: jsonb("temporal_rules"), // session/day-of-week rules
  regimeProfiles: jsonb("regime_profiles"), // per-regime overrides
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// PRD §12.3 — encrypted at rest with AES-256-GCM using
// EXCHANGE_KEY_ENCRYPTION_KEY. Ciphertext + iv + authTag stored separately.
// Plaintext never persisted, never logged.
export const exchangeKeys = pgTable("exchange_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  exchange: varchar("exchange", { length: 32 }).notNull(), // binance, bybit
  apiKeyCiphertext: text("api_key_ciphertext").notNull(),
  apiKeyIv: varchar("api_key_iv", { length: 64 }).notNull(),
  apiKeyAuthTag: varchar("api_key_auth_tag", { length: 64 }).notNull(),
  apiSecretCiphertext: text("api_secret_ciphertext").notNull(),
  apiSecretIv: varchar("api_secret_iv", { length: 64 }).notNull(),
  apiSecretAuthTag: varchar("api_secret_auth_tag", { length: 64 }).notNull(),
  permissionsValidatedAt: timestamp("permissions_validated_at"),
  lastValidationError: text("last_validation_error"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ============================================================================
// Market registry (PRD §13) — admin-curated tradeable pairs
// ============================================================================

export const marketPairs = pgTable("market_pairs", {
  id: uuid("id").primaryKey().defaultRandom(),
  baseAsset: varchar("base_asset", { length: 16 }).notNull(),
  quoteAsset: varchar("quote_asset", { length: 16 }).notNull(),
  displayName: varchar("display_name", { length: 100 }).notNull(),
  supportedExchanges: jsonb("supported_exchanges").notNull(), // string[]
  enabled: boolean("enabled").notNull().default(true),
  minOrderSize: numeric("min_order_size", { precision: 20, scale: 8 }).notNull(),
  defaultRiskPct: numeric("default_risk_pct", { precision: 5, scale: 3 }).notNull().default("1.000"),
  defaultMaxPositions: integer("default_max_positions").notNull().default(2),
  defaultMinRR: numeric("default_min_rr", { precision: 4, scale: 2 }).notNull().default("2.00"),
  liquidityRating: varchar("liquidity_rating", { length: 16 }).notNull().default("medium"), // low/medium/high
  adminNotes: text("admin_notes"),
  tenantVisibleNotes: text("tenant_visible_notes"),
  addedByUserId: uuid("added_by_user_id").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ============================================================================
// Trades, decisions, risk events
// ============================================================================

export const trades = pgTable(
  "trades",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
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
    levelContext: jsonb("level_context"),
  },
  (t) => [
    index("trades_tenant_idx").on(t.tenantId),
    index("trades_opened_idx").on(t.openedAt),
  ]
);

// Every decision the bot makes — enter, skip, exit — with full reasoning.
// PRD §8.3: persistent internal data.
export const botDecisions = pgTable(
  "bot_decisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    decisionType: varchar("decision_type", { length: 64 }).notNull(), // entry, exit, skip, halt, ...
    regime: regimeEnum("regime").notNull(),
    tradeId: uuid("trade_id").references(() => trades.id),
    inputs: jsonb("inputs").notNull(),
    outputs: jsonb("outputs").notNull(),
    reasoning: text("reasoning"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("bot_decisions_tenant_idx").on(t.tenantId),
    index("bot_decisions_created_idx").on(t.createdAt),
  ]
);

// Risk-manager specific events: drawdown hit, emergency exit, R:R rejection.
// PRD §7.4 requires a persistent risk audit trail.
export const riskEvents = pgTable(
  "risk_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    eventType: varchar("event_type", { length: 64 }).notNull(),
    severity: varchar("severity", { length: 16 }).notNull(), // info/warn/critical
    detail: jsonb("detail").notNull(),
    triggeredByUserId: uuid("triggered_by_user_id").references(() => users.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("risk_events_tenant_idx").on(t.tenantId)]
);

// ============================================================================
// Backtest Sundays (PRD §11) + LLM usage metering (PRD §12.6)
// ============================================================================

// Experiment definitions — the operator's library of research questions.
// Each row is a reusable, named, configured experiment that can be run on
// demand and produces a recommendation. Templates are picked from a small
// fixed set (`kind`); the `config` blob is template-specific.
export const experiments = pgTable(
  "experiments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    name: varchar("name", { length: 200 }).notNull(),
    kind: varchar("kind", { length: 32 }).notNull(), // diagnostic | param_sweep | comparison
    config: jsonb("config").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("experiments_tenant_idx").on(t.tenantId)]
);

// Per-execution result of an experiment. Stores baseline + proposed param
// snapshots, raw run output (`metrics`), and a structured `recommendation`
// the operator reviews. `verdict` walks pending → approved/rejected/deferred,
// and finally → applied once the change has been written to live config.
//
// `experimentId` is nullable to allow legacy / ad-hoc rows; new rows always
// reference an experiment definition. `week` is nullable now that runs are
// triggered on demand instead of in a Sunday batch.
export const experimentRuns = pgTable("experiment_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  experimentId: uuid("experiment_id").references(() => experiments.id),
  week: varchar("week", { length: 10 }), // ISO week, optional
  baselineConfig: jsonb("baseline_config").notNull(),
  proposedConfig: jsonb("proposed_config").notNull(),
  metrics: jsonb("metrics").notNull(),
  recommendation: jsonb("recommendation"), // Recommendation shape from shared/experiments
  verdict: varchar("verdict", { length: 16 }).notNull().default("pending"),
  // pending | approved | rejected | deferred | applied | no_action
  reviewedByUserId: uuid("reviewed_by_user_id").references(() => users.id),
  reviewedAt: timestamp("reviewed_at"),
  appliedAt: timestamp("applied_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ============================================================================
// Autoresearch (PRD §11.x — autonomous parameter search)
// ============================================================================
//
// Bounded LLM-driven search loop. The operator picks a goal + iteration
// budget, and the orchestrator runs N iterations of "ask LLM what to vary,
// run backtest, score, keep/discard". Each session gets one row in
// `autoresearch_sessions` and N rows in `autoresearch_iterations`.
//
// Local-only by design — the orchestrator refuses to start unless
// OPENAI_API_KEY is set, and we keep that secret out of prd config.

export const autoresearchSessions = pgTable(
  "autoresearch_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    // Operator-supplied goal in plain English ("Find a config where CRV
    // trades >= 1/day with positive net PnL"). Fed to the LLM in the
    // system prompt.
    goal: text("goal").notNull(),
    pairId: uuid("pair_id")
      .notNull()
      .references(() => marketPairs.id),
    timeframe: varchar("timeframe", { length: 8 }).notNull(),
    lookbackBars: integer("lookback_bars").notNull(),
    regime: regimeEnum("regime").notNull(),
    model: varchar("model", { length: 64 }).notNull(), // gpt-4o, gpt-4o-mini, etc.
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
    status: varchar("status", { length: 16 }).notNull().default("running"),
    // running | done | aborted | error | idle
    iterationsRun: integer("iterations_run").notNull().default(0),
    bestIterationId: uuid("best_iteration_id"), // FK set after first kept iter
    bestScore: numeric("best_score", { precision: 10, scale: 6 }),
    totalCostUsd: numeric("total_cost_usd", { precision: 10, scale: 6 })
      .notNull()
      .default("0"),
    errorMessage: text("error_message"),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id),
    startedAt: timestamp("started_at").notNull().defaultNow(),
    stoppedAt: timestamp("stopped_at"),
  },
  (t) => [index("autoresearch_sessions_tenant_idx").on(t.tenantId)]
);

export const autoresearchIterations = pgTable(
  "autoresearch_iterations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => autoresearchSessions.id, { onDelete: "cascade" }),
    idx: integer("idx").notNull(), // 0..N-1 within the session
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
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("autoresearch_iterations_session_idx").on(t.sessionId)]
);

// Cached symbol list per exchange. Railway worker refreshes hourly so the
// admin UI on Vercel can read instantly without making a slow + memory-heavy
// fetch from a serverless function (which times out).
export const cachedSymbols = pgTable("cached_symbols", {
  exchange: varchar("exchange", { length: 32 }).primaryKey(),
  symbols: jsonb("symbols").notNull(), // SymbolInfo[]
  refreshedAt: timestamp("refreshed_at").notNull().defaultNow(),
});

export const llmUsage = pgTable(
  "llm_usage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    model: varchar("model", { length: 64 }).notNull(),
    inputTokens: integer("input_tokens").notNull(),
    outputTokens: integer("output_tokens").notNull(),
    costUsd: numeric("cost_usd", { precision: 10, scale: 6 }).notNull(),
    purpose: varchar("purpose", { length: 64 }).notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("llm_usage_tenant_idx").on(t.tenantId),
    index("llm_usage_created_idx").on(t.createdAt),
  ]
);

// ============================================================================
// Regime change history (PRD §7.4 MUST — persistent storage)
// ============================================================================

export const regimeChanges = pgTable(
  "regime_changes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    fromRegime: regimeEnum("from_regime").notNull(),
    toRegime: regimeEnum("to_regime").notNull(),
    changedByUserId: uuid("changed_by_user_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("regime_changes_tenant_idx").on(t.tenantId)]
);

// ============================================================================
// Relations
// ============================================================================

export const usersRelations = relations(users, ({ many }) => ({
  tenants: many(tenants),
}));

export const tenantsRelations = relations(tenants, ({ one, many }) => ({
  user: one(users, { fields: [tenants.userId], references: [users.id] }),
  config: one(tenantConfigs, { fields: [tenants.id], references: [tenantConfigs.tenantId] }),
  trades: many(trades),
  exchangeKeys: many(exchangeKeys),
}));

// ============================================================================
// Zod insert schemas
// ============================================================================

export const insertUserSchema = createInsertSchema(users);
export const insertAccessRequestSchema = createInsertSchema(accessRequests, {
  name: z.string().min(2).max(200),
  email: z.string().email(),
  cell: z.string().min(6).max(32).optional(),
  reason: z.string().max(2000).optional(),
}).pick({ name: true, email: true, cell: true, reason: true });

export const insertInviteSchema = createInsertSchema(invitedUsers, {
  email: z.string().email(),
}).pick({ email: true });

export const insertMarketPairSchema = createInsertSchema(marketPairs, {
  baseAsset: z.string().min(1).max(16),
  quoteAsset: z.string().min(1).max(16),
  displayName: z.string().min(1).max(100),
  supportedExchanges: z.array(z.string()),
  minOrderSize: z.string(),
});

export const regimeChangeSchema = z.object({
  toRegime: z.enum([
    "no_trade",
    "ranging",
    "trending",
    "breakout",
    "high_volatility",
    "low_liquidity",
    "accumulation_distribution",
  ]),
});

// ============================================================================
// Types
// ============================================================================

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Tenant = typeof tenants.$inferSelect;
export type TenantConfig = typeof tenantConfigs.$inferSelect;
export type Trade = typeof trades.$inferSelect;
export type MarketPair = typeof marketPairs.$inferSelect;
export type BotDecision = typeof botDecisions.$inferSelect;
export type RiskEvent = typeof riskEvents.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
export type AccessRequest = typeof accessRequests.$inferSelect;
export type InvitedUser = typeof invitedUsers.$inferSelect;
export type ExperimentRun = typeof experimentRuns.$inferSelect;
export type Experiment = typeof experiments.$inferSelect;
export type InsertExperiment = typeof experiments.$inferInsert;
export type AutoresearchSession = typeof autoresearchSessions.$inferSelect;
export type InsertAutoresearchSession = typeof autoresearchSessions.$inferInsert;
export type AutoresearchIteration = typeof autoresearchIterations.$inferSelect;
export type InsertAutoresearchIteration = typeof autoresearchIterations.$inferInsert;
export type LlmUsage = typeof llmUsage.$inferSelect;
export type RegimeChange = typeof regimeChanges.$inferSelect;

export type Regime =
  | "no_trade"
  | "ranging"
  | "trending"
  | "breakout"
  | "high_volatility"
  | "low_liquidity"
  | "accumulation_distribution";
