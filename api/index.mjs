var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// shared/schema.ts
var schema_exports = {};
__export(schema_exports, {
  accessRequestStatusEnum: () => accessRequestStatusEnum,
  accessRequests: () => accessRequests,
  auditLogs: () => auditLogs,
  autoresearchIterations: () => autoresearchIterations,
  autoresearchSessions: () => autoresearchSessions,
  botDecisions: () => botDecisions,
  botStatusEnum: () => botStatusEnum,
  cachedSymbols: () => cachedSymbols,
  exchangeKeys: () => exchangeKeys,
  experimentRuns: () => experimentRuns,
  experiments: () => experiments,
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
  usersRelations: () => usersRelations
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
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
var regimeEnum, botStatusEnum, tradeSideEnum, tradeStatusEnum, setupModeEnum, accessRequestStatusEnum, sessions, users, invitedUsers, accessRequests, auditLogs, tenants, tenantConfigs, exchangeKeys, marketPairs, trades, botDecisions, riskEvents, experiments, experimentRuns, autoresearchSessions, autoresearchIterations, cachedSymbols, llmUsage, regimeChanges, usersRelations, tenantsRelations, insertUserSchema, insertAccessRequestSchema, insertInviteSchema, insertMarketPairSchema, regimeChangeSchema;
var init_schema = __esm({
  "shared/schema.ts"() {
    "use strict";
    regimeEnum = pgEnum("regime", [
      "no_trade",
      "ranging",
      "trending",
      "breakout",
      "high_volatility",
      "low_liquidity",
      "accumulation_distribution"
    ]);
    botStatusEnum = pgEnum("bot_status", [
      "off",
      "active",
      "paused",
      "halted",
      "error"
    ]);
    tradeSideEnum = pgEnum("trade_side", ["long", "short"]);
    tradeStatusEnum = pgEnum("trade_status", [
      "pending",
      "open",
      "partially_closed",
      "closed",
      "cancelled",
      "rejected"
    ]);
    setupModeEnum = pgEnum("setup_mode", ["mode_a", "mode_b"]);
    accessRequestStatusEnum = pgEnum("access_request_status", [
      "pending",
      "approved",
      "declined"
    ]);
    sessions = pgTable(
      "sessions",
      {
        sid: varchar("sid").primaryKey(),
        sess: jsonb("sess").notNull(),
        expire: timestamp("expire").notNull()
      },
      (t) => [index("sessions_expire_idx").on(t.expire)]
    );
    users = pgTable("users", {
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
    invitedUsers = pgTable("invited_users", {
      id: uuid("id").primaryKey().defaultRandom(),
      email: varchar("email", { length: 255 }).notNull().unique(),
      invitedByUserId: uuid("invited_by_user_id").references(() => users.id),
      createdAt: timestamp("created_at").notNull().defaultNow()
    });
    accessRequests = pgTable("access_requests", {
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
    auditLogs = pgTable(
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
    tenants = pgTable("tenants", {
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
    tenantConfigs = pgTable("tenant_configs", {
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
    exchangeKeys = pgTable("exchange_keys", {
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
    marketPairs = pgTable("market_pairs", {
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
    trades = pgTable(
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
    botDecisions = pgTable(
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
    riskEvents = pgTable(
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
    experiments = pgTable(
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
    experimentRuns = pgTable("experiment_runs", {
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
    autoresearchSessions = pgTable(
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
    autoresearchIterations = pgTable(
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
    cachedSymbols = pgTable("cached_symbols", {
      exchange: varchar("exchange", { length: 32 }).primaryKey(),
      symbols: jsonb("symbols").notNull(),
      // SymbolInfo[]
      refreshedAt: timestamp("refreshed_at").notNull().defaultNow()
    });
    llmUsage = pgTable(
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
    regimeChanges = pgTable(
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
    usersRelations = relations(users, ({ many }) => ({
      tenants: many(tenants)
    }));
    tenantsRelations = relations(tenants, ({ one, many }) => ({
      user: one(users, { fields: [tenants.userId], references: [users.id] }),
      config: one(tenantConfigs, { fields: [tenants.id], references: [tenantConfigs.tenantId] }),
      trades: many(trades),
      exchangeKeys: many(exchangeKeys)
    }));
    insertUserSchema = createInsertSchema(users);
    insertAccessRequestSchema = createInsertSchema(accessRequests, {
      name: z.string().min(2).max(200),
      email: z.string().email(),
      cell: z.string().min(6).max(32).optional(),
      reason: z.string().max(2e3).optional()
    }).pick({ name: true, email: true, cell: true, reason: true });
    insertInviteSchema = createInsertSchema(invitedUsers, {
      email: z.string().email()
    }).pick({ email: true });
    insertMarketPairSchema = createInsertSchema(marketPairs, {
      baseAsset: z.string().min(1).max(16),
      quoteAsset: z.string().min(1).max(16),
      displayName: z.string().min(1).max(100),
      supportedExchanges: z.array(z.string()),
      minOrderSize: z.string()
    });
    regimeChangeSchema = z.object({
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
  }
});

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
init_schema();
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
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
init_schema();
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
init_schema();
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
init_schema();

// server/modules/emergencyExit.ts
init_schema();
import { eq as eq2 } from "drizzle-orm";

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

// server/modules/alerts.ts
var telegramConfigured = Boolean(
  process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID
);
async function sendUrgentAlert(alert) {
  return send({ ...alert, tier: "urgent" });
}
async function send(alert) {
  if (!telegramConfigured) {
    console.log(
      `[alerts:stub] ${alert.tier} ${alert.tenantId}: ${alert.title} \u2014 ${alert.body}`
    );
    return;
  }
  const icon = alert.tier === "urgent" ? "\u{1F6A8}" : "\u{1F4DD}";
  const text2 = `${icon} *${escape(alert.title)}*
${escape(alert.body)}`;
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: process.env.TELEGRAM_CHAT_ID,
          text: text2,
          parse_mode: "Markdown",
          disable_notification: alert.tier === "digest"
        })
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
function escape(s) {
  return s.replace(/([_*`[\]])/g, "\\$1");
}

// server/modules/emergencyExit.ts
async function emergencyMarketExit(tenantId, userId) {
  const openTrades = await storage.listOpenTrades(tenantId);
  const [tenant] = await db.select().from(tenants).where(eq2(tenants.id, tenantId));
  let markPrice = null;
  if (tenant?.activePairId) {
    const [pair] = await db.select().from(marketPairs).where(eq2(marketPairs.id, tenant.activePairId));
    if (pair) {
      const symbol = `${pair.baseAsset}${pair.quoteAsset}`;
      try {
        markPrice = await getBinance().fetchPrice(symbol);
      } catch (err) {
        console.error("[emergency-exit] failed to fetch mark price", err);
      }
    }
  }
  const results = [];
  for (const t of openTrades) {
    const entry = Number(t.entryPrice);
    const size = Number(t.size);
    const exitPrice = markPrice ?? entry;
    const realisedPnl = t.side === "long" ? (exitPrice - entry) * size : (entry - exitPrice) * size;
    await storage.closeTrade({
      tradeId: t.id,
      exitPrice,
      realisedPnl,
      reason: "emergency"
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
      results
    },
    triggeredByUserId: userId
  });
  sendUrgentAlert({
    tenantId,
    title: "Emergency market exit executed",
    body: `${openTrades.length} trade(s) closed at ${markPrice ?? "entry"}. Bot is now halted.`
  }).catch((err) => {
    console.error("[emergency-exit] alert dispatch failed", err);
  });
  return {
    ok: true,
    closedCount: openTrades.length,
    markPrice,
    results
  };
}

// server/modules/regimeEngine.ts
var REGIME_PROFILES = {
  no_trade: {
    regime: "no_trade",
    label: "NO TRADE",
    character: "Unclear, transitional, or unclassified. Market does not fit a known pattern.",
    botBehaviour: "All entries suppressed. Existing positions managed to exit. Bot is silent.",
    permittedModes: [],
    minRiskRewardRatio: 0,
    sizeMultiplier: 0,
    entrySuppressed: true,
    colour: "notrade"
  },
  ranging: {
    regime: "ranging",
    label: "Ranging",
    character: "Price oscillating between defined upper and lower liquidity pools. Sweeps reverse predictably. Highest-probability environment for the core strategy.",
    botBehaviour: "Full strategy active. Both sides tradeable. Tighter targets \u2014 fade back to range midpoint or opposite boundary.",
    permittedModes: ["mode_a", "mode_b"],
    minRiskRewardRatio: 2,
    sizeMultiplier: 1,
    entrySuppressed: false,
    colour: "ranging"
  },
  trending: {
    regime: "trending",
    label: "Trending",
    character: "Directional structure. Sweeps tend to continue rather than reverse cleanly.",
    botBehaviour: "Strategy active in trend direction only. Counter-trend setups suppressed. Mode B preferred. Larger targets.",
    permittedModes: ["mode_b"],
    minRiskRewardRatio: 2.5,
    sizeMultiplier: 1,
    entrySuppressed: false,
    colour: "trending"
  },
  breakout: {
    regime: "breakout",
    label: "Breakout",
    character: "Price has ranged and is beginning to commit to a direction. Highest false-signal environment.",
    botBehaviour: "Reduced activity. Only highest-rank levels considered. Position size reduced. Mode A suppressed \u2014 confirmation entries only.",
    permittedModes: ["mode_b"],
    minRiskRewardRatio: 3,
    sizeMultiplier: 0.5,
    entrySuppressed: false,
    colour: "breakout"
  },
  high_volatility: {
    regime: "high_volatility",
    label: "High Volatility",
    character: "News-driven, erratic. Levels blown through without respect. Manipulation amplified.",
    botBehaviour: "All entries suppressed. Tighter emergency stops on any open positions. State flagged prominently.",
    permittedModes: [],
    minRiskRewardRatio: 0,
    sizeMultiplier: 0,
    entrySuppressed: true,
    colour: "volatile"
  },
  low_liquidity: {
    regime: "low_liquidity",
    label: "Low Liquidity",
    character: "Weekend, public holiday, or thin session. Order book shallow. Moves can be exaggerated.",
    botBehaviour: "Entries suppressed or heavily restricted. Existing positions may be closed at session end.",
    permittedModes: [],
    minRiskRewardRatio: 0,
    sizeMultiplier: 0,
    entrySuppressed: true,
    colour: "notrade"
  },
  accumulation_distribution: {
    regime: "accumulation_distribution",
    label: "Accumulation / Distribution",
    character: "Smart money positioning. Sweep failures expected to be higher. Appears similar to ranging but more aggressive.",
    botBehaviour: "Strategy active with caution flags. Position sizing reduced. Both modes permitted but R:R minimums raised.",
    permittedModes: ["mode_a", "mode_b"],
    minRiskRewardRatio: 2.5,
    sizeMultiplier: 0.75,
    entrySuppressed: false,
    colour: "ranging"
  }
};
function getRegimeProfile(regime) {
  return REGIME_PROFILES[regime];
}

// server/modules/portfolioTier.ts
function tierFor(capital) {
  if (capital < 500) return "tiny";
  if (capital < 5e3) return "small";
  if (capital < 5e4) return "medium";
  return "large";
}
function tierDefaults(tier) {
  switch (tier) {
    case "tiny":
      return {
        riskPercentPerTrade: "2.000",
        maxConcurrentPositions: 1,
        minRiskRewardRatio: "1.50",
        minLevelRank: 1,
        dailyDrawdownLimitPct: "5.00",
        weeklyDrawdownLimitPct: "10.00"
      };
    case "small":
      return {
        riskPercentPerTrade: "1.500",
        maxConcurrentPositions: 2,
        minRiskRewardRatio: "2.00",
        minLevelRank: 2,
        dailyDrawdownLimitPct: "4.00",
        weeklyDrawdownLimitPct: "8.00"
      };
    case "medium":
      return {
        riskPercentPerTrade: "1.000",
        maxConcurrentPositions: 2,
        minRiskRewardRatio: "2.00",
        minLevelRank: 2,
        dailyDrawdownLimitPct: "3.00",
        weeklyDrawdownLimitPct: "6.00"
      };
    case "large":
      return {
        riskPercentPerTrade: "0.500",
        maxConcurrentPositions: 3,
        minRiskRewardRatio: "2.50",
        minLevelRank: 3,
        dailyDrawdownLimitPct: "2.00",
        weeklyDrawdownLimitPct: "4.00"
      };
  }
}

// server/modules/strategy/levels.ts
var DEFAULT_LEVEL_CONFIG = {
  swingLookback: 5,
  equalTolerancePct: 0.05,
  // 5 bps — tight for crypto
  mergeTolerancePct: 0.1,
  // 10 bps
  minTouches: 1
};
function findSwingHighs(candles, lookback = DEFAULT_LEVEL_CONFIG.swingLookback) {
  const out = [];
  for (let i = lookback; i < candles.length - lookback; i++) {
    const c = candles[i];
    let isSwing = true;
    for (let j = 1; j <= lookback; j++) {
      if (candles[i - j].high >= c.high || candles[i + j].high >= c.high) {
        isSwing = false;
        break;
      }
    }
    if (isSwing) {
      out.push(level("swing_high", "resistance", c.high, c.openTime));
    }
  }
  return out;
}
function findSwingLows(candles, lookback = DEFAULT_LEVEL_CONFIG.swingLookback) {
  const out = [];
  for (let i = lookback; i < candles.length - lookback; i++) {
    const c = candles[i];
    let isSwing = true;
    for (let j = 1; j <= lookback; j++) {
      if (candles[i - j].low <= c.low || candles[i + j].low <= c.low) {
        isSwing = false;
        break;
      }
    }
    if (isSwing) {
      out.push(level("swing_low", "support", c.low, c.openTime));
    }
  }
  return out;
}
function findEqualHighs(candles, tolerancePct) {
  return clusterByPrice(
    candles.map((c) => ({ price: c.high, at: c.openTime })),
    tolerancePct
  ).map(
    (g) => level(
      "equal_high",
      "resistance",
      average(g.map((p) => p.price)),
      g[0].at,
      g[g.length - 1].at,
      g.length
    )
  );
}
function findEqualLows(candles, tolerancePct) {
  return clusterByPrice(
    candles.map((c) => ({ price: c.low, at: c.openTime })),
    tolerancePct
  ).map(
    (g) => level(
      "equal_low",
      "support",
      average(g.map((p) => p.price)),
      g[0].at,
      g[g.length - 1].at,
      g.length
    )
  );
}
function findPrevDayLevels(candles) {
  const byDay = groupByDay(candles);
  const out = [];
  const days = Array.from(byDay.keys()).sort();
  if (days.length < 2) return out;
  const prev = byDay.get(days[days.length - 2]);
  const high = Math.max(...prev.map((c) => c.high));
  const low = Math.min(...prev.map((c) => c.low));
  const at = prev[0].openTime;
  out.push(level("prev_day_high", "resistance", high, at));
  out.push(level("prev_day_low", "support", low, at));
  return out;
}
function findPrevWeekLevels(candles) {
  const byWeek = groupByWeek(candles);
  const out = [];
  const weeks = Array.from(byWeek.keys()).sort();
  if (weeks.length < 2) return out;
  const prev = byWeek.get(weeks[weeks.length - 2]);
  const high = Math.max(...prev.map((c) => c.high));
  const low = Math.min(...prev.map((c) => c.low));
  const at = prev[0].openTime;
  out.push(level("prev_week_high", "resistance", high, at));
  out.push(level("prev_week_low", "support", low, at));
  return out;
}
function identifyLevels(candles, config = DEFAULT_LEVEL_CONFIG) {
  if (candles.length < config.swingLookback * 2 + 1) return [];
  const raw = [
    ...findSwingHighs(candles, config.swingLookback),
    ...findSwingLows(candles, config.swingLookback),
    ...findEqualHighs(candles, config.equalTolerancePct),
    ...findEqualLows(candles, config.equalTolerancePct),
    ...findPrevDayLevels(candles),
    ...findPrevWeekLevels(candles)
  ];
  const merged = mergeConfluentLevels(raw, config.mergeTolerancePct);
  for (const lvl of merged) {
    lvl.touches = countTouches(candles, lvl.price, config.equalTolerancePct);
    lvl.rank = rankLevel(lvl);
  }
  return merged.filter((l) => l.touches >= config.minTouches).sort((a, b) => b.rank - a.rank || a.price - b.price);
}
function mergeConfluentLevels(levels, tolerancePct) {
  const sorted = [...levels].sort((a, b) => a.price - b.price);
  const merged = [];
  for (const l of sorted) {
    const last = merged[merged.length - 1];
    if (last && withinTolerance(last.price, l.price, tolerancePct)) {
      last.components = [...last.components ?? [last.type], l.type];
      last.price = (last.price + l.price) / 2;
      last.firstSeenAt = Math.min(last.firstSeenAt, l.firstSeenAt);
      last.lastSeenAt = Math.max(last.lastSeenAt, l.lastSeenAt);
    } else {
      merged.push({ ...l, components: [l.type] });
    }
  }
  return merged;
}
function rankLevel(l) {
  const baseByType = {
    prev_week_high: 4,
    prev_week_low: 4,
    prev_day_high: 3,
    prev_day_low: 3,
    equal_high: 3,
    equal_low: 3,
    session_high: 2,
    session_low: 2,
    swing_high: 2,
    swing_low: 2
  };
  const base = Math.max(...(l.components ?? [l.type]).map((t) => baseByType[t]));
  const confluence = new Set(l.components ?? [l.type]).size - 1;
  const touch = Math.min(2, Math.floor(l.touches / 3));
  return Math.min(5, base + confluence + touch);
}
function level(type, side, price, firstSeenAt, lastSeenAt, touches) {
  return {
    id: `${type}:${price.toFixed(2)}`,
    type,
    side,
    price,
    rank: 1,
    touches: touches ?? 1,
    firstSeenAt,
    lastSeenAt: lastSeenAt ?? firstSeenAt
  };
}
function withinTolerance(a, b, tolerancePct) {
  if (a === 0) return b === 0;
  return Math.abs(a - b) / a * 100 <= tolerancePct;
}
function clusterByPrice(points, tolerancePct) {
  const sorted = [...points].sort((a, b) => a.price - b.price);
  const groups = [];
  for (const p of sorted) {
    const last = groups[groups.length - 1];
    if (last && withinTolerance(last[last.length - 1].price, p.price, tolerancePct)) {
      last.push(p);
    } else {
      groups.push([p]);
    }
  }
  return groups.filter((g) => g.length >= 2);
}
function countTouches(candles, price, tolerancePct) {
  let n = 0;
  for (const c of candles) {
    if (withinTolerance(c.high, price, tolerancePct) || withinTolerance(c.low, price, tolerancePct) || c.low <= price && c.high >= price) {
      n++;
    }
  }
  return n;
}
function groupByDay(candles) {
  const m = /* @__PURE__ */ new Map();
  for (const c of candles) {
    const d = new Date(c.openTime);
    const key = `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
    if (!m.has(key)) m.set(key, []);
    m.get(key).push(c);
  }
  return m;
}
function groupByWeek(candles) {
  const m = /* @__PURE__ */ new Map();
  for (const c of candles) {
    const d = new Date(c.openTime);
    const year = d.getUTCFullYear();
    const week = isoWeek(d);
    const key = `${year}-W${week}`;
    if (!m.has(key)) m.set(key, []);
    m.get(key).push(c);
  }
  return m;
}
function isoWeek(d) {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 864e5 + 1) / 7);
}
function average(nums) {
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

// server/modules/strategy/sweeps.ts
var DEFAULT_SWEEP_CONFIG = {
  minWickProtrusionPct: 0.02
  // 2 bps — noise floor for crypto
};
function detectSweeps(candles, levels, config = DEFAULT_SWEEP_CONFIG) {
  const out = [];
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    for (const lvl of levels) {
      if (lvl.firstSeenAt > c.openTime) continue;
      if (lvl.side === "resistance") {
        const protrusion = (c.high - lvl.price) / lvl.price * 100;
        if (c.high > lvl.price && protrusion >= config.minWickProtrusionPct) {
          out.push({
            candleIndex: i,
            candleTime: c.openTime,
            direction: "up",
            level: lvl,
            wickExtreme: c.high,
            closeBackPrice: c.close,
            closedBack: c.close < lvl.price
            // closed back inside = Mode B valid
          });
        }
      } else {
        const protrusion = (lvl.price - c.low) / lvl.price * 100;
        if (c.low < lvl.price && protrusion >= config.minWickProtrusionPct) {
          out.push({
            candleIndex: i,
            candleTime: c.openTime,
            direction: "down",
            level: lvl,
            wickExtreme: c.low,
            closeBackPrice: c.close,
            closedBack: c.close > lvl.price
          });
        }
      }
    }
  }
  return out;
}
function detectLatestSweep(candles, levels, config = DEFAULT_SWEEP_CONFIG) {
  if (candles.length === 0) return null;
  const last = candles.length - 1;
  const sweeps = detectSweeps(candles.slice(last), levels, config);
  if (sweeps.length === 0) return null;
  sweeps.sort((a, b) => b.level.rank - a.level.rank);
  return { ...sweeps[0], candleIndex: last };
}

// server/modules/strategy/entries.ts
var DEFAULT_PROPOSAL_CONFIG = {
  targetDistanceMultiplier: 1.5
};
function generateProposal(sweep, allLevels, regime, config = DEFAULT_PROPOSAL_CONFIG) {
  if (!sweep) return { ok: false, reason: "no_sweep" };
  const profile = getRegimeProfile(regime);
  if (profile.entrySuppressed) return { ok: false, reason: "entry_suppressed" };
  const mode = sweep.closedBack ? "mode_b" : "mode_a";
  if (!profile.permittedModes.includes(mode)) {
    return { ok: false, reason: "mode_not_permitted" };
  }
  const side = sweep.direction === "up" ? "short" : "long";
  const entryPrice = sweep.level.price;
  const stopPrice = side === "short" ? sweep.wickExtreme * 1.0005 : sweep.wickExtreme * 0.9995;
  const riskPerUnit = Math.abs(entryPrice - stopPrice);
  const minTargetDistance = riskPerUnit * config.targetDistanceMultiplier;
  const target = findTargetLevel(allLevels, entryPrice, side, minTargetDistance);
  if (!target) return { ok: false, reason: "no_target" };
  const reasoning = [
    `sweep_${sweep.direction}`,
    `level:${sweep.level.type}@${sweep.level.price.toFixed(2)}`,
    `rank:${sweep.level.rank}`,
    `mode:${mode}`,
    `target:${target.type}@${target.price.toFixed(2)}`
  ].join(" ");
  return {
    ok: true,
    proposal: {
      side,
      setupMode: mode,
      entryPrice,
      stopPrice,
      targetPrice: target.price,
      levelId: sweep.level.id,
      sweepCandleIndex: sweep.candleIndex,
      reasoning
    }
  };
}
function findTargetLevel(levels, entry, side, minDistance) {
  const candidates = levels.filter((l) => {
    if (side === "short") {
      return l.side === "support" && l.price < entry && entry - l.price >= minDistance;
    }
    return l.side === "resistance" && l.price > entry && l.price - entry >= minDistance;
  });
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => {
    const distA = Math.abs(a.price - entry);
    const distB = Math.abs(b.price - entry);
    const scoreA = distA / Math.max(1, a.rank);
    const scoreB = distB / Math.max(1, b.rank);
    return scoreA - scoreB;
  });
  return candidates[0];
}

// server/modules/riskManager.ts
function assessTrade(i) {
  const profile = getRegimeProfile(i.regime);
  if (profile.entrySuppressed) {
    return { approved: false, reason: "regime_suppresses_entries", detail: { regime: i.regime } };
  }
  if (i.dailyPnlPct <= -i.dailyDrawdownLimitPct) {
    return { approved: false, reason: "daily_drawdown_breached", detail: { dailyPnlPct: i.dailyPnlPct } };
  }
  if (i.weeklyPnlPct <= -i.weeklyDrawdownLimitPct) {
    return { approved: false, reason: "weekly_drawdown_breached", detail: { weeklyPnlPct: i.weeklyPnlPct } };
  }
  if (i.openPositionCount >= i.maxConcurrentPositions) {
    return { approved: false, reason: "max_concurrent_positions_reached" };
  }
  if (i.candidateLevelRank < i.minLevelRank) {
    return { approved: false, reason: "level_rank_below_minimum" };
  }
  const effectiveMinRR = Math.max(i.minRiskRewardRatio, profile.minRiskRewardRatio);
  const riskPerUnit = Math.abs(i.entryPrice - i.stopPrice);
  const rewardPerUnit = Math.abs(i.targetPrice - i.entryPrice);
  if (riskPerUnit <= 0) {
    return { approved: false, reason: "invalid_stop_distance" };
  }
  const plannedRR = rewardPerUnit / riskPerUnit;
  if (plannedRR < effectiveMinRR) {
    return {
      approved: false,
      reason: "rr_below_minimum",
      detail: { plannedRR, effectiveMinRR }
    };
  }
  const riskAmount = i.capital * i.riskPercentPerTrade * profile.sizeMultiplier / 100;
  if (riskAmount <= 0) {
    return { approved: false, reason: "regime_size_multiplier_zero" };
  }
  const positionSize = riskAmount / riskPerUnit;
  if (positionSize < i.pairMinOrderSize) {
    return {
      approved: false,
      reason: "below_min_order_size",
      detail: {
        positionSize,
        minOrderSize: i.pairMinOrderSize,
        capital: i.capital
      }
    };
  }
  const positionNotional = positionSize * i.entryPrice;
  if (positionNotional > i.capital) {
    return {
      approved: false,
      reason: "position_exceeds_capital",
      detail: { positionNotional, capital: i.capital }
    };
  }
  return { approved: true, positionSize, riskAmount, plannedRR };
}

// server/modules/backtestEngine.ts
function runBacktest(input) {
  const warmup = input.warmupCandles ?? 100;
  if (input.candles.length <= warmup) {
    return emptyResult();
  }
  let capital = input.startingCapital;
  let peakCapital = capital;
  let maxDrawdown = 0;
  const openTrades = [];
  const closedTrades = [];
  const diag = {
    barsEvaluated: 0,
    entriesTaken: 0,
    rejections: {},
    bestLevelRankSeen: 0,
    minLevelRankFloor: input.config.minLevelRank,
    bestRRSeen: 0,
    minRRFloor: input.config.minRiskRewardRatio,
    recentRejections: []
  };
  const reject = (barTime, reason, detail) => {
    diag.rejections[reason] = (diag.rejections[reason] ?? 0) + 1;
    if (diag.recentRejections.length < 20) {
      diag.recentRejections.push({ atMs: barTime, reason, detail });
    }
  };
  const levelConfig = input.levelConfig ?? DEFAULT_LEVEL_CONFIG;
  const sweepConfig = input.sweepConfig ?? DEFAULT_SWEEP_CONFIG;
  const proposalConfig = input.proposalConfig ?? DEFAULT_PROPOSAL_CONFIG;
  const fullWindowLevels = identifyLevels(input.candles, levelConfig);
  for (let i = warmup; i < input.candles.length; i++) {
    const bar = input.candles[i];
    diag.barsEvaluated++;
    for (let t = openTrades.length - 1; t >= 0; t--) {
      const ot = openTrades[t];
      const hit = resolveBar(ot, bar);
      if (hit) {
        const closed = {
          openedAt: ot.openedAt,
          closedAt: bar.openTime,
          side: ot.side,
          setupMode: ot.setupMode,
          entry: ot.entry,
          stop: ot.stop,
          target: ot.target,
          size: ot.size,
          realisedPnl: hit.pnl,
          outcome: hit.outcome,
          triggerPrice: ot.triggerPrice,
          triggerSide: ot.triggerSide
        };
        closedTrades.push(closed);
        capital += hit.pnl;
        peakCapital = Math.max(peakCapital, capital);
        const dd = (peakCapital - capital) / peakCapital * 100;
        if (dd > maxDrawdown) maxDrawdown = dd;
        openTrades.splice(t, 1);
      }
    }
    const levels = fullWindowLevels.filter((l) => l.firstSeenAt <= bar.openTime);
    if (levels.length === 0) {
      reject(bar.openTime, "no_levels");
      continue;
    }
    const sweep = detectLatestSweep([bar], levels, sweepConfig);
    if (!sweep) {
      reject(bar.openTime, "no_sweep", { levelCount: levels.length });
      continue;
    }
    if (sweep.level.rank > diag.bestLevelRankSeen) {
      diag.bestLevelRankSeen = sweep.level.rank;
    }
    const proposalResult = generateProposal(sweep, levels, input.regime, proposalConfig);
    if (!proposalResult.ok) {
      reject(bar.openTime, `no_proposal:${proposalResult.reason}`, {
        levelType: sweep.level.type,
        sweepDirection: sweep.direction,
        closedBack: sweep.closedBack
      });
      continue;
    }
    const proposal = proposalResult.proposal;
    const proposalRisk = Math.abs(proposal.entryPrice - proposal.stopPrice);
    const proposalReward = Math.abs(proposal.targetPrice - proposal.entryPrice);
    const proposalRR = proposalRisk > 0 ? proposalReward / proposalRisk : 0;
    if (proposalRR > diag.bestRRSeen) diag.bestRRSeen = proposalRR;
    const { dailyPnlPct, weeklyPnlPct } = windowedPnl(closedTrades, bar.openTime, input.startingCapital);
    const decision = assessTrade({
      capital,
      riskPercentPerTrade: input.config.riskPercentPerTrade,
      entryPrice: proposal.entryPrice,
      stopPrice: proposal.stopPrice,
      targetPrice: proposal.targetPrice,
      regime: input.regime,
      minRiskRewardRatio: input.config.minRiskRewardRatio,
      openPositionCount: openTrades.length,
      maxConcurrentPositions: input.config.maxConcurrentPositions,
      dailyPnlPct,
      weeklyPnlPct,
      dailyDrawdownLimitPct: input.config.dailyDrawdownLimitPct,
      weeklyDrawdownLimitPct: input.config.weeklyDrawdownLimitPct,
      minLevelRank: input.config.minLevelRank,
      candidateLevelRank: sweep.level.rank,
      pairMinOrderSize: 0
      // backtests assume any size is fillable
    });
    if (!decision.approved) {
      reject(bar.openTime, `risk_rejected:${decision.reason}`, decision.detail);
      continue;
    }
    diag.entriesTaken++;
    openTrades.push({
      openedAt: bar.openTime,
      side: proposal.side,
      setupMode: proposal.setupMode,
      entry: proposal.entryPrice,
      stop: proposal.stopPrice,
      target: proposal.targetPrice,
      size: decision.positionSize,
      riskAmount: decision.riskAmount,
      triggerPrice: sweep.level.price,
      triggerSide: sweep.level.side
    });
  }
  const last = input.candles[input.candles.length - 1];
  for (const ot of openTrades) {
    const pnl = pnlAt(ot, last.close);
    closedTrades.push({
      openedAt: ot.openedAt,
      closedAt: last.openTime,
      side: ot.side,
      setupMode: ot.setupMode,
      entry: ot.entry,
      stop: ot.stop,
      target: ot.target,
      size: ot.size,
      realisedPnl: pnl,
      outcome: "timeout",
      triggerPrice: ot.triggerPrice,
      triggerSide: ot.triggerSide
    });
    capital += pnl;
  }
  return summarise(closedTrades, capital - input.startingCapital, maxDrawdown, diag);
}
function resolveBar(ot, bar) {
  if (ot.side === "long") {
    if (bar.low <= ot.stop) return { pnl: -ot.riskAmount, outcome: "stop" };
    if (bar.high >= ot.target) {
      const reward = (ot.target - ot.entry) * ot.size;
      return { pnl: reward, outcome: "target" };
    }
  } else {
    if (bar.high >= ot.stop) return { pnl: -ot.riskAmount, outcome: "stop" };
    if (bar.low <= ot.target) {
      const reward = (ot.entry - ot.target) * ot.size;
      return { pnl: reward, outcome: "target" };
    }
  }
  return null;
}
function pnlAt(ot, price) {
  return ot.side === "long" ? (price - ot.entry) * ot.size : (ot.entry - price) * ot.size;
}
function windowedPnl(closed, nowMs, startingCapital) {
  const day = nowMs - 24 * 60 * 60 * 1e3;
  const week = nowMs - 7 * 24 * 60 * 60 * 1e3;
  let d = 0, w = 0;
  for (const t of closed) {
    if (t.closedAt >= day) d += t.realisedPnl;
    if (t.closedAt >= week) w += t.realisedPnl;
  }
  return {
    dailyPnlPct: d / startingCapital * 100,
    weeklyPnlPct: w / startingCapital * 100
  };
}
function summarise(trades2, netPnl, maxDrawdown, diagnostic) {
  const wins = trades2.filter((t) => t.realisedPnl > 0).length;
  const losses = trades2.filter((t) => t.realisedPnl <= 0).length;
  const rrSum = trades2.reduce((s, t) => {
    const risk = Math.abs(t.entry - t.stop);
    const reward = Math.abs(t.target - t.entry);
    return s + (risk > 0 ? reward / risk : 0);
  }, 0);
  const returns = trades2.map((t) => t.realisedPnl);
  const mean = returns.reduce((a, b) => a + b, 0) / (returns.length || 1);
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length || 1);
  const std = Math.sqrt(variance);
  const sharpe = std > 0 ? mean / std * Math.sqrt(365) : null;
  return {
    trades: trades2.length,
    wins,
    losses,
    winRate: trades2.length ? wins / trades2.length : 0,
    netPnl,
    maxDrawdown,
    avgRR: trades2.length ? rrSum / trades2.length : 0,
    sharpe,
    tradeLog: trades2,
    diagnostic
  };
}
function emptyResult() {
  return {
    trades: 0,
    wins: 0,
    losses: 0,
    winRate: 0,
    netPnl: 0,
    maxDrawdown: 0,
    avgRR: 0,
    sharpe: null,
    tradeLog: [],
    diagnostic: {
      barsEvaluated: 0,
      entriesTaken: 0,
      rejections: {},
      bestLevelRankSeen: 0,
      minLevelRankFloor: 0,
      bestRRSeen: 0,
      minRRFloor: 0,
      recentRejections: []
    }
  };
}

// server/modules/experiments/runners.ts
function scoreBacktest(r) {
  if (r.trades < 3) return 0;
  const sharpe = r.sharpe ?? 0;
  const tradesPenalty = Math.min(1, r.trades / 20);
  const winBonus = r.winRate;
  return Math.max(0, sharpe * tradesPenalty + winBonus);
}
function variantOf(label, r) {
  return {
    label,
    score: scoreBacktest(r),
    trades: r.trades,
    winRate: r.winRate,
    netPnl: r.netPnl,
    maxDrawdown: r.maxDrawdown
  };
}
function runDiagnostic(args) {
  const { candles, regime, live } = args;
  const result = runBacktest({
    candles,
    regime,
    startingCapital: live.startingCapital,
    config: {
      riskPercentPerTrade: live.riskPercentPerTrade,
      minRiskRewardRatio: live.minRiskRewardRatio,
      minLevelRank: live.minLevelRank,
      maxConcurrentPositions: live.maxConcurrentPositions,
      dailyDrawdownLimitPct: live.dailyDrawdownLimitPct,
      weeklyDrawdownLimitPct: live.weeklyDrawdownLimitPct
    }
  });
  const diag = result.diagnostic;
  const totalRejected = Object.values(diag.rejections).reduce((a, b) => a + b, 0);
  const findings = [];
  findings.push(
    `${diag.barsEvaluated} bars evaluated \xB7 ${diag.entriesTaken} entries taken \xB7 ${totalRejected} rejected.`
  );
  const sorted = Object.entries(diag.rejections).sort((a, b) => b[1] - a[1]);
  for (const [reason, count] of sorted.slice(0, 6)) {
    const pct = totalRejected > 0 ? Math.round(count / totalRejected * 100) : 0;
    findings.push(`${humanReason(reason)}: ${count} bars (${pct}%)`);
  }
  if (diag.bestLevelRankSeen > 0 && diag.bestLevelRankSeen < diag.minLevelRankFloor) {
    findings.push(
      `Best level rank seen was ${diag.bestLevelRankSeen}; your floor is ${diag.minLevelRankFloor}. Every sweep in this window was below the bar.`
    );
  }
  if (diag.bestRRSeen > 0 && diag.bestRRSeen < diag.minRRFloor) {
    findings.push(
      `Best R:R produced was ${diag.bestRRSeen.toFixed(2)}; your minimum is ${diag.minRRFloor.toFixed(2)}.`
    );
  }
  let diff;
  const rejKey = (k) => diag.rejections[`risk_rejected:${k}`] ?? 0;
  const dominantRank = rejKey("level_rank_below_minimum");
  const dominantRR = rejKey("rr_below_minimum");
  if (dominantRank > 0 && dominantRank >= totalRejected * 0.5 && diag.bestLevelRankSeen >= 1 && diag.bestLevelRankSeen < diag.minLevelRankFloor) {
    diff = {
      paramKey: "minLevelRank",
      fromValue: diag.minLevelRankFloor,
      toValue: diag.bestLevelRankSeen,
      rationale: `${Math.round(dominantRank / totalRejected * 100)}% of rejections were level_rank_below_minimum, and the best rank seen in this window was ${diag.bestLevelRankSeen}. Lowering the floor to ${diag.bestLevelRankSeen} would have admitted those sweeps for evaluation.`
    };
  } else if (dominantRR > 0 && dominantRR >= totalRejected * 0.5 && diag.bestRRSeen >= 1 && diag.bestRRSeen < diag.minRRFloor) {
    const floor = Math.floor(diag.bestRRSeen * 10) / 10;
    diff = {
      paramKey: "minRiskRewardRatio",
      fromValue: diag.minRRFloor,
      toValue: floor,
      rationale: `${Math.round(dominantRR / totalRejected * 100)}% of rejections were rr_below_minimum, and the best R:R any proposal produced was ${diag.bestRRSeen.toFixed(2)}. Lowering the minimum to ${floor.toFixed(1)} would have admitted those.`
    };
  }
  const summary = diff ? `Found a likely blocker \u2014 suggesting ${diff.paramKey} ${diff.fromValue} \u2192 ${diff.toValue}.` : diag.entriesTaken > 0 ? `Bot is trading (${diag.entriesTaken} entries in window). No change suggested.` : `Bot found no entries, but no single rejection reason dominates. No change suggested \u2014 review findings.`;
  return {
    metrics: result,
    recommendation: {
      summary,
      findings,
      diff,
      diagnosticPayload: {
        diagnostic: diag,
        trades: result.trades,
        winRate: result.winRate,
        netPnl: result.netPnl
      }
    }
  };
}
function runParamSweep(args) {
  const { config, candles, regime, live } = args;
  const variants = [];
  const baseConfig = {
    riskPercentPerTrade: live.riskPercentPerTrade,
    minRiskRewardRatio: live.minRiskRewardRatio,
    minLevelRank: live.minLevelRank,
    maxConcurrentPositions: live.maxConcurrentPositions,
    dailyDrawdownLimitPct: live.dailyDrawdownLimitPct,
    weeklyDrawdownLimitPct: live.weeklyDrawdownLimitPct
  };
  for (const value of config.values) {
    const cfg = { ...baseConfig, [config.paramKey]: value };
    const r = runBacktest({
      candles,
      regime,
      startingCapital: live.startingCapital,
      config: cfg
    });
    variants.push(variantOf(`${config.paramKey}=${value}`, r));
  }
  const ranked = [...variants].sort(
    (a, b) => b.score !== a.score ? b.score - a.score : b.trades - a.trades
  );
  const winner = ranked[0];
  const currentValue = live[config.paramKey];
  const findings = [
    `Tested ${variants.length} values of ${config.paramKey}: ${config.values.join(", ")}.`,
    `Best: ${winner.label} (score ${winner.score.toFixed(2)}, ${winner.trades} trades, ${Math.round(winner.winRate * 100)}% wins).`,
    `Current live value: ${currentValue}.`
  ];
  const winnerValue = Number(winner.label.split("=")[1]);
  let diff;
  if (winnerValue !== currentValue && winner.score > 0) {
    diff = {
      paramKey: config.paramKey,
      fromValue: currentValue,
      toValue: winnerValue,
      rationale: `Sweeping ${config.paramKey} over ${config.values.length} values, ${winner.label} produced the highest score (${winner.score.toFixed(2)}) versus the current live value of ${currentValue}.`
    };
  }
  return {
    metrics: { variants },
    recommendation: {
      summary: diff ? `Recommend ${config.paramKey}: ${diff.fromValue} \u2192 ${diff.toValue}.` : `Current ${config.paramKey} (${currentValue}) is already optimal.`,
      findings,
      diff,
      variants
    }
  };
}
function runComparison(args) {
  const { config, candles, regime, live } = args;
  const baseConfig = {
    riskPercentPerTrade: live.riskPercentPerTrade,
    minRiskRewardRatio: live.minRiskRewardRatio,
    minLevelRank: live.minLevelRank,
    maxConcurrentPositions: live.maxConcurrentPositions,
    dailyDrawdownLimitPct: live.dailyDrawdownLimitPct,
    weeklyDrawdownLimitPct: live.weeklyDrawdownLimitPct
  };
  const variants = [];
  for (const alt of config.alternatives) {
    const cfg = { ...baseConfig, ...alt.overrides };
    const r = runBacktest({
      candles,
      regime,
      startingCapital: live.startingCapital,
      config: cfg
    });
    variants.push(variantOf(alt.label, r));
  }
  const ranked = [...variants].sort(
    (a, b) => b.score !== a.score ? b.score - a.score : b.trades - a.trades
  );
  const winner = ranked[0];
  const findings = [
    `Compared ${variants.length} alternatives.`,
    ...ranked.map(
      (v, i) => `${i + 1}. ${v.label} \u2014 score ${v.score.toFixed(2)}, ${v.trades} trades, ${Math.round(v.winRate * 100)}% wins`
    )
  ];
  return {
    metrics: { variants },
    recommendation: {
      summary: `Best alternative: ${winner.label} (score ${winner.score.toFixed(2)}).`,
      findings,
      variants
      // diff intentionally omitted — comparison results are read-only insights.
    }
  };
}
function humanReason(machineReason) {
  const map = {
    no_levels: "no levels identified",
    no_sweep: "no liquidity sweep detected",
    no_proposal: "sweep found but no valid setup",
    "risk_rejected:regime_suppresses_entries": "regime suppresses entries",
    "risk_rejected:daily_drawdown_breached": "daily drawdown breached",
    "risk_rejected:weekly_drawdown_breached": "weekly drawdown breached",
    "risk_rejected:max_concurrent_positions_reached": "at max concurrent positions",
    "risk_rejected:level_rank_below_minimum": "level rank below minimum",
    "risk_rejected:rr_below_minimum": "R:R below minimum",
    "risk_rejected:invalid_stop_distance": "invalid stop distance",
    "risk_rejected:regime_size_multiplier_zero": "regime size multiplier zero",
    "risk_rejected:below_min_order_size": "position below exchange minimum",
    "risk_rejected:position_exceeds_capital": "position would exceed capital"
  };
  return map[machineReason] ?? machineReason;
}

// shared/experiments.ts
var APPLIABLE_PARAM_KEYS = [
  "minLevelRank",
  "minRiskRewardRatio",
  "maxConcurrentPositions"
];

// server/modules/experiments/applier.ts
async function applyRecommendation(args) {
  const run = await storage.getExperimentRun(args.runId);
  if (!run) return { ok: false, reason: "run_not_found" };
  if (run.verdict !== "approved") {
    return { ok: false, reason: `verdict_not_approved (was: ${run.verdict})` };
  }
  const recommendation = run.recommendation;
  if (!recommendation || !recommendation.diff) {
    return { ok: false, reason: "recommendation_has_no_diff" };
  }
  const { diff } = recommendation;
  if (!APPLIABLE_PARAM_KEYS.includes(diff.paramKey)) {
    return { ok: false, reason: `param_key_not_appliable: ${diff.paramKey}` };
  }
  const config = await storage.getTenantConfig(run.tenantId);
  if (!config) return { ok: false, reason: "tenant_config_missing" };
  const currentLive = readNumericKey(config, diff.paramKey);
  if (currentLive !== diff.fromValue) {
    return {
      ok: false,
      reason: `stale_recommendation: live ${diff.paramKey} is ${currentLive}, recommendation expected ${diff.fromValue}`
    };
  }
  await storage.updateTenantConfig(run.tenantId, {
    [diff.paramKey]: writableValue(diff.paramKey, diff.toValue)
  });
  await storage.setRunVerdict(args.runId, "applied", args.operatorUserId);
  audit({
    userId: args.operatorUserId,
    tenantId: run.tenantId,
    action: "apply_experiment_recommendation",
    resourceType: "experiment_run",
    resourceId: args.runId,
    outcome: "success",
    detail: {
      paramKey: diff.paramKey,
      fromValue: diff.fromValue,
      toValue: diff.toValue,
      experimentId: run.experimentId
    },
    ipAddress: args.ipAddress
  });
  return {
    ok: true,
    tenantId: run.tenantId,
    appliedDiff: { paramKey: diff.paramKey, fromValue: diff.fromValue, toValue: diff.toValue }
  };
}
function readNumericKey(config, key) {
  const v = config[key];
  if (typeof v === "string") return Number(v);
  if (typeof v === "number") return v;
  return NaN;
}
function writableValue(key, value) {
  if (key === "minLevelRank" || key === "maxConcurrentPositions") return value;
  return String(value);
}

// server/modules/autoresearch/orchestrator.ts
init_schema();
import { eq as eq3 } from "drizzle-orm";

// server/modules/autoresearch/openai.ts
var OPENAI_BASE = "https://api.openai.com/v1";
var PRICING = {
  "gpt-4o": { inputPerM: 2.5, outputPerM: 10 },
  "gpt-4o-mini": { inputPerM: 0.15, outputPerM: 0.6 },
  "gpt-4-turbo": { inputPerM: 10, outputPerM: 30 }
};
async function chat(args) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is not set. Add it to Doppler dev: doppler secrets set OPENAI_API_KEY=sk-... --config dev"
    );
  }
  const body = {
    model: args.model,
    messages: args.messages,
    temperature: args.temperature ?? 0.7
  };
  if (args.responseFormat === "json_object") {
    body.response_format = { type: "json_object" };
  }
  const res = await fetch(`${OPENAI_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const text3 = await res.text().catch(() => "");
    const sanitized = text3.replace(/sk-[A-Za-z0-9_\-.*]+/g, "[redacted-key]").slice(0, 500);
    const err = new Error(`openai chat ${res.status}: ${sanitized}`);
    err.status = res.status;
    err.isPermanent = res.status >= 400 && res.status < 500 && res.status !== 429;
    throw err;
  }
  const data = await res.json();
  const text2 = data.choices[0]?.message?.content ?? "";
  const inputTokens = data.usage.prompt_tokens;
  const outputTokens = data.usage.completion_tokens;
  const pricing = PRICING[args.model] ?? PRICING["gpt-4o"];
  const costUsd = inputTokens / 1e6 * pricing.inputPerM + outputTokens / 1e6 * pricing.outputPerM;
  return { text: text2, inputTokens, outputTokens, costUsd };
}
function isOpenAIConfigured() {
  return Boolean(process.env.OPENAI_API_KEY);
}

// server/modules/autoresearch/prompt.ts
var SYSTEM_PROMPT = `You are an autonomous trading-strategy researcher running a Karpathy-style autoresearch loop. Your job is to find a parameter configuration that meets the operator's stated goal by iterating: read previous results, propose a change, the system runs a backtest, you read the score, you propose another change.

You are NOT a chatbot. You do not greet the user, apologize, hedge, or explain what you're about to do outside the JSON output. Every response is a single JSON object with the shape:

{
  "params": { ... full ProposedParams object ... },
  "rationale": "1-2 sentences explaining the hypothesis"
}

The params object MUST contain ALL of the following fields. Missing any field is a hard error. Use the value from the most recent kept iteration if you don't want to change a particular field:

- minLevelRank (integer 1..5): minimum strength level the strategy will trade against. Lower = more setups admitted, weaker quality.
- minRiskRewardRatio (number 0.5..3.0): minimum reward:risk ratio. Lower = more setups admitted, smaller wins.
- maxConcurrentPositions (integer 1..5): how many positions can be open at once.
- swingLookback (integer 3..15): bars on each side for swing-point detection. Lower = more swings detected (noisier), higher = fewer (more significant).
- equalTolerancePct (number 0.01..0.5): % tolerance for equal-high/low clustering. Higher = looser clustering, more equal-level signals.
- mergeTolerancePct (number 0.05..0.5): % tolerance for merging nearby levels into one. Higher = more confluence merging.
- minTouches (integer 1..3): minimum candle touches for a level to be valid.
- minWickProtrusionPct (number 0.005..0.5): minimum wick protrusion % to count as a sweep. Lower = more sweeps detected.
- targetDistanceMultiplier (number 0.5..3.0): target must be at least this multiple of the risk distance away. Lower = tighter targets accepted.

When picking your next hypothesis:
1. Read the rejection_top of the most recent iteration. If one reason dominates (>50% of rejections), the parameters governing that reason are your prime target.
2. If "no_proposal:no_target" dominates \u2192 you MUST try targetDistanceMultiplier values BELOW 1.0. Specifically: try 0.8, then 0.6, then 0.5. "Lowering" from 1.0 to 1.0 is not a change \u2014 check the history. You must also lower minRiskRewardRatio to match (below 1.0 target requires below 1.0 R:R, otherwise the proposal will be rejected by the risk manager). The valid range for both is 0.5..3.0. Use it.
3. If "no_proposal:mode_not_permitted" dominates \u2192 this is a regime/setup-mode mismatch, not a parameter problem. No parameter change will help; flag this in the rationale so the operator can change the regime label on the next run.
4. If "no_proposal:entry_suppressed" dominates \u2192 same: regime profile suppresses all entries. Flag in rationale. No parameter change helps.
5. If "no_sweep" dominates \u2192 consider lowering minWickProtrusionPct.
6. If "no_levels" dominates \u2192 consider lowering minTouches or increasing equalTolerancePct.
7. If "risk_rejected:level_rank_below_minimum" dominates \u2192 consider lowering minLevelRank.
8. If "risk_rejected:rr_below_minimum" dominates \u2192 consider lowering minRiskRewardRatio OR lowering targetDistanceMultiplier (which produces lower R:R proposals).
9. If "risk_rejected:position_exceeds_capital" dominates \u2192 consider increasing minRiskRewardRatio (forces wider stops, smaller positions).
10. HARD RULE: do not propose params identical to any of the last 3 iterations. If you find yourself writing the same rationale twice, stop and try a *different* parameter dimension. Copy-pasting your own previous rationale is a failure mode \u2014 you are wasting an iteration.
11. Prefer one-knob changes per iteration so you can attribute score deltas. Two-knob changes only when you have a strong joint hypothesis.
12. After ~10 iterations on a single dimension with no improvement, broaden to a different dimension.

Your responses are machine-parsed. JSON only. No markdown fences. No commentary outside the rationale field.`;
var DEFAULT_SYSTEM_PROMPT = SYSTEM_PROMPT;
var DEFAULT_DISCOVER_PROMPT = `You are an autonomous trading-strategy explorer running in DISCOVER mode. Your job is NOT to find a winning configuration. Your job is to map the search space \u2014 sample diverse parameter combinations so the operator can see what the strategy actually DOES across the parameter range, where trades happen at all, where they don't, and what tradeoffs exist between trade count, win rate, P&L, and drawdown.

You are NOT a chatbot. You do not greet the user, apologize, hedge, or explain what you're about to do outside the JSON output. Every response is a single JSON object with the shape:

{
  "params": { ... full ProposedParams object ... },
  "rationale": "1-2 sentences explaining what region of the search space this iteration is exploring and why"
}

The params object MUST contain ALL of the following fields. Missing any field is a hard error.

- minLevelRank (integer 1..5)
- minRiskRewardRatio (number 0.5..3.0)
- maxConcurrentPositions (integer 1..5)
- swingLookback (integer 3..15)
- equalTolerancePct (number 0.01..0.5)
- mergeTolerancePct (number 0.05..0.5)
- minTouches (integer 1..3)
- minWickProtrusionPct (number 0.005..0.5)
- targetDistanceMultiplier (number 0.5..3.0)

Discover-mode discipline:

1. DO NOT hill-climb. Do not try to "improve" on previous iterations. There is no "best" in discover mode \u2014 every iteration is a data point.
2. DO sample widely. Cover the param space. If iteration 1 was at minLevelRank=3 swingLookback=5, iteration 2 should be at notably different values (e.g. minLevelRank=1 swingLookback=10) to explore a different region.
3. Vary multiple dimensions per iteration when useful \u2014 coverage matters more than attribution here.
4. Consciously target unexplored regions. Read the history of previous iterations and pick params that are FAR from the centroid of what's been tried so far.
5. Don't repeat exact param sets you've already tried. Check the history.
6. After ~half the iteration budget, you should have visited corners of the search space the operator wouldn't think to try manually. Lean into combinations that look counterintuitive.
7. Your rationale should explain the REGION you're sampling, not the hypothesis ("targeting low-rank, long-lookback corner" \u2014 not "I think this will improve trades").

The operator will read the resulting iteration log as a survey of strategy behaviour and use it to inform decisions about what rules to keep, change, or add. Your job is to give them coverage, not opinions.

Your responses are machine-parsed. JSON only. No markdown fences. No commentary outside the rationale field.`;
function buildMessages(args) {
  const { ctx, history, currentParams, isBaseline, systemPrompt, mode } = args;
  let userContent;
  if (isBaseline) {
    userContent = `Goal: ${ctx.goal}

Pair: ${ctx.pair.symbol} \xB7 timeframe: ${ctx.timeframe} \xB7 lookback: ${ctx.lookbackBars} bars \xB7 regime: ${ctx.regime}
Mode: ${mode}

This is the BASELINE iteration. Return the current params as-is so we can establish a starting reference point:

${JSON.stringify(currentParams, null, 2)}

Respond with the same params and a one-sentence rationale that says "baseline".`;
  } else if (mode === "discover") {
    userContent = `Goal: ${ctx.goal}

Pair: ${ctx.pair.symbol} \xB7 timeframe: ${ctx.timeframe} \xB7 lookback: ${ctx.lookbackBars} bars \xB7 regime: ${ctx.regime}
Mode: discover (sample the search space, do NOT hill-climb)

Iterations sampled so far (${history.length} data points):
${formatHistory(history)}

Pick a NEW configuration that explores a region of the search space that previous iterations haven't covered yet. Vary multiple dimensions when useful. The goal is breadth \u2014 give the operator a survey of how the strategy behaves across the param space.`;
  } else {
    userContent = `Goal: ${ctx.goal}

Pair: ${ctx.pair.symbol} \xB7 timeframe: ${ctx.timeframe} \xB7 lookback: ${ctx.lookbackBars} bars \xB7 regime: ${ctx.regime}
Mode: tune (hill-climb to maximise score)

History so far (${history.length} iterations):
${formatHistory(history)}

Current best params:
${JSON.stringify(currentParams, null, 2)}

Propose the next iteration. Return a JSON object with "params" (all fields) and "rationale" (1-2 sentences).`;
  }
  return [
    { role: "system", content: systemPrompt || DEFAULT_SYSTEM_PROMPT },
    { role: "user", content: userContent }
  ];
}
function formatHistory(history) {
  if (history.length === 0) return "(none yet)";
  const recent = history.slice(-12);
  return recent.map((it) => {
    const top = it.rejectionTop ? Object.entries(it.rejectionTop).slice(0, 3).map(([k, v]) => `${k}=${v}`).join(", ") : "";
    return `#${it.idx} [${it.status}] score=${it.score.toFixed(4)} trades=${it.trades} win_rate=${it.winRate.toFixed(2)} pnl=${it.netPnl.toFixed(2)}
       params=${JSON.stringify(it.params)}
       top_rejections=${top}
       rationale="${it.rationale ?? ""}"`;
  }).join("\n");
}
function parseLLMResponse(text2) {
  let parsed;
  try {
    parsed = JSON.parse(text2);
  } catch (err) {
    throw new Error(`LLM did not return valid JSON: ${err.message}`);
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("LLM response is not an object");
  }
  const obj = parsed;
  if (!obj.params || typeof obj.params !== "object") {
    throw new Error("LLM response missing 'params' object");
  }
  const params = obj.params;
  const required = [
    "minLevelRank",
    "minRiskRewardRatio",
    "maxConcurrentPositions",
    "swingLookback",
    "equalTolerancePct",
    "mergeTolerancePct",
    "minTouches",
    "minWickProtrusionPct",
    "targetDistanceMultiplier"
  ];
  for (const key of required) {
    if (typeof params[key] !== "number" || !Number.isFinite(params[key])) {
      throw new Error(`LLM response params.${key} is missing or not a number`);
    }
  }
  return {
    params,
    rationale: typeof obj.rationale === "string" ? obj.rationale : ""
  };
}
var DEFAULT_PARAMS = {
  minLevelRank: 2,
  minRiskRewardRatio: 2,
  maxConcurrentPositions: 2,
  swingLookback: 5,
  equalTolerancePct: 0.05,
  mergeTolerancePct: 0.1,
  minTouches: 1,
  minWickProtrusionPct: 0.02,
  targetDistanceMultiplier: 1.5
};

// server/modules/autoresearch/narrate.ts
function narrateIteration(o) {
  if (o.status === "crash") {
    return `Iteration ${o.idx + 1}: crashed \u2014 ${o.crashReason ?? "unknown error"}. Moving on.`;
  }
  if (o.isBaseline || o.status === "baseline") {
    if (o.trades === 0) {
      return `Baseline: ${o.trades} trades. Reference point recorded.`;
    }
    return `Baseline: ${o.trades} trades, score ${o.newScore.toFixed(4)}. Reference point recorded.`;
  }
  const diff = diffParams(o.prevParams, o.newParams);
  const change = diff ? `${diff.key} ${formatVal(diff.before)} \u2192 ${formatVal(diff.after)}` : "tweaked params";
  if (o.status === "sampled") {
    const wr = o.winRate != null ? `${Math.round(o.winRate * 100)}%` : "\u2014";
    const pnl = o.netPnl != null ? `${o.netPnl >= 0 ? "+" : ""}${o.netPnl.toFixed(2)}` : "\u2014";
    return `Iteration ${o.idx + 1}: ${change}. ${o.trades} trades, ${wr} wins, ${pnl} P&L.`;
  }
  if (o.status === "keep") {
    const delta = o.prevScore != null ? o.newScore - o.prevScore : o.newScore;
    return `Iteration ${o.idx + 1}: ${change}. Score ${o.newScore.toFixed(4)} (+${delta.toFixed(4)}), ${o.trades} trades. Keeping.`;
  }
  if (o.status === "discard") {
    return `Iteration ${o.idx + 1}: ${change}. Score ${o.newScore.toFixed(4)} no better than current best, ${o.trades} trades. Reverting.`;
  }
  return `Iteration ${o.idx + 1}: ${change}. Score ${o.newScore.toFixed(4)}.`;
}
function diffParams(prev, next) {
  if (!prev) return null;
  const keys = Object.keys(next);
  for (const k of keys) {
    if (prev[k] !== next[k]) {
      return { key: String(k), before: prev[k], after: next[k] };
    }
  }
  return null;
}
function formatVal(v) {
  if (Number.isInteger(v)) return v.toString();
  return v.toFixed(2);
}

// server/modules/autoresearch/orchestrator.ts
var stopFlags = /* @__PURE__ */ new Map();
function requestStop(sessionId) {
  stopFlags.set(sessionId, true);
}
async function startSession(args) {
  if (!isOpenAIConfigured()) {
    throw new Error(
      "OPENAI_API_KEY not set. Add it to Doppler dev: doppler secrets set OPENAI_API_KEY=sk-... --config dev"
    );
  }
  const [session2] = await db.insert(autoresearchSessions).values({
    tenantId: args.tenantId,
    goal: args.goal,
    pairId: args.pairId,
    timeframe: args.timeframe,
    lookbackBars: args.lookbackBars,
    regime: args.regime,
    model: args.model,
    mode: args.mode,
    maxIterations: args.maxIterations,
    systemPrompt: args.systemPrompt,
    seedParams: args.seedParams ?? {},
    status: "running",
    createdByUserId: args.userId
  }).returning();
  void runLoop(session2, args, { startIdx: 0, initialHistory: [] }).catch(
    async (err) => {
      console.error(`[autoresearch] session ${session2.id} fatal:`, err);
      await db.update(autoresearchSessions).set({
        status: "error",
        errorMessage: err.message,
        stoppedAt: /* @__PURE__ */ new Date()
      }).where(eq3(autoresearchSessions.id, session2.id));
    }
  );
  return session2;
}
async function resumeSession(args) {
  const [session2] = await db.select().from(autoresearchSessions).where(eq3(autoresearchSessions.id, args.sessionId));
  if (!session2) throw new Error("session_not_found");
  if (!isContinuable(session2.status)) {
    throw new Error(`session_not_continuable (status: ${session2.status})`);
  }
  const existingIterations = await db.select().from(autoresearchIterations).where(eq3(autoresearchIterations.sessionId, session2.id)).orderBy(autoresearchIterations.idx);
  const initialHistory = existingIterations.filter((it) => it.status !== "crash").map((it) => ({
    idx: it.idx,
    params: it.params,
    score: Number(it.score),
    trades: it.trades,
    winRate: Number(it.winRate),
    netPnl: Number(it.netPnl),
    rejectionTop: it.rejectionTop ?? null,
    status: it.status,
    rationale: it.rationale ?? void 0
  }));
  const extra = args.extraIterations ?? session2.maxIterations;
  const newMaxIterations = session2.maxIterations + extra;
  const startIdx = session2.iterationsRun;
  await db.update(autoresearchSessions).set({
    status: "running",
    maxIterations: newMaxIterations,
    stoppedAt: null,
    errorMessage: null
  }).where(eq3(autoresearchSessions.id, session2.id));
  const { marketPairs: marketPairs2 } = await Promise.resolve().then(() => (init_schema(), schema_exports));
  const [pair] = await db.select().from(marketPairs2).where(eq3(marketPairs2.id, session2.pairId));
  if (!pair) throw new Error("pair_not_found");
  const pairSymbol = `${pair.baseAsset}${pair.quoteAsset}`;
  const refreshedSession = { ...session2, status: "running", maxIterations: newMaxIterations };
  const resumeArgs = {
    tenantId: session2.tenantId,
    userId: session2.createdByUserId,
    goal: session2.goal,
    pairId: session2.pairId,
    pairSymbol,
    timeframe: session2.timeframe,
    lookbackBars: session2.lookbackBars,
    regime: session2.regime,
    model: session2.model,
    maxIterations: newMaxIterations,
    systemPrompt: session2.systemPrompt,
    mode: session2.mode
  };
  void runLoop(refreshedSession, resumeArgs, {
    startIdx,
    initialHistory
  }).catch(async (err) => {
    console.error(`[autoresearch] resume ${session2.id} fatal:`, err);
    await db.update(autoresearchSessions).set({
      status: "error",
      errorMessage: err.message,
      stoppedAt: /* @__PURE__ */ new Date()
    }).where(eq3(autoresearchSessions.id, session2.id));
  });
  return refreshedSession;
}
function isContinuable(status) {
  return status === "paused" || status === "done" || status === "aborted";
}
async function runLoop(session2, args, options) {
  const ctx = {
    goal: args.goal,
    pair: { symbol: args.pairSymbol },
    timeframe: args.timeframe,
    lookbackBars: args.lookbackBars,
    regime: args.regime
  };
  const candles = await getBinance().fetchCandles({
    symbol: args.pairSymbol,
    timeframe: args.timeframe,
    limit: args.lookbackBars
  });
  if (candles.length < 50) {
    throw new Error(`exchange returned only ${candles.length} candles, need at least 50`);
  }
  const seeded = {
    ...DEFAULT_PARAMS,
    ...session2.seedParams ?? {}
  };
  let currentParams = { ...seeded };
  let bestParams = { ...seeded };
  let bestScore = -Infinity;
  let bestIterationId = null;
  let totalCostUsd = 0;
  const history = [...options.initialHistory];
  if (options.startIdx > 0 && history.length > 0) {
    const highest = history.reduce(
      (best, it) => it.score > best.score ? it : best
    );
    bestScore = highest.score;
    bestParams = { ...highest.params };
    currentParams = { ...highest.params };
  }
  for (let idx = options.startIdx; idx < args.maxIterations; idx++) {
    if (stopFlags.get(session2.id)) {
      stopFlags.delete(session2.id);
      await markPaused(session2.id);
      return;
    }
    const isBaseline = idx === 0 && options.startIdx === 0;
    let proposedParams;
    let rationale = "";
    let llmInputTokens = 0;
    let llmOutputTokens = 0;
    let llmCost = 0;
    if (isBaseline) {
      proposedParams = currentParams;
      rationale = "baseline";
    } else {
      try {
        const messages = buildMessages({
          ctx,
          history,
          currentParams: bestParams,
          isBaseline: false,
          // Read the prompt from the session row, NOT a module-level
          // constant. The operator's confirmed/edited prompt at start
          // time is what runs.
          systemPrompt: session2.systemPrompt,
          mode: args.mode
        });
        const response = await chat({
          model: args.model,
          messages,
          responseFormat: "json_object",
          temperature: 0.7
        });
        llmInputTokens = response.inputTokens;
        llmOutputTokens = response.outputTokens;
        llmCost = response.costUsd;
        totalCostUsd += llmCost;
        const parsed = parseLLMResponse(response.text);
        proposedParams = clampParams(parsed.params);
        rationale = parsed.rationale;
      } catch (err) {
        const isPermanent = err.isPermanent === true;
        const errorMessage = err.message;
        await persistIteration({
          sessionId: session2.id,
          idx,
          params: currentParams,
          score: 0,
          trades: 0,
          winRate: 0,
          netPnl: 0,
          maxDrawdownPct: 0,
          barsEvaluated: 0,
          entriesTaken: 0,
          rejectionTop: null,
          status: "crash",
          narration: narrateIteration({
            idx,
            isBaseline: false,
            prevParams: bestParams,
            newParams: currentParams,
            prevScore: bestScore,
            newScore: 0,
            trades: 0,
            status: "crash",
            crashReason: errorMessage
          }),
          rationale: `LLM call failed: ${errorMessage}`,
          inputTokens: 0,
          outputTokens: 0,
          costUsd: 0
        });
        await db.update(autoresearchSessions).set({
          iterationsRun: idx + 1,
          totalCostUsd: totalCostUsd.toFixed(6)
        }).where(eq3(autoresearchSessions.id, session2.id));
        if (isPermanent) {
          await db.update(autoresearchSessions).set({
            status: "error",
            errorMessage,
            stoppedAt: /* @__PURE__ */ new Date()
          }).where(eq3(autoresearchSessions.id, session2.id));
          console.error(
            `[autoresearch] aborting session ${session2.id} on permanent error: ${errorMessage}`
          );
          return;
        }
        continue;
      }
    }
    const backtestResult = runBacktest({
      candles,
      regime: args.regime,
      startingCapital: 1e4,
      warmupCandles: 100,
      config: {
        riskPercentPerTrade: 1,
        minRiskRewardRatio: proposedParams.minRiskRewardRatio,
        minLevelRank: proposedParams.minLevelRank,
        maxConcurrentPositions: proposedParams.maxConcurrentPositions,
        dailyDrawdownLimitPct: 3,
        weeklyDrawdownLimitPct: 6
      },
      levelConfig: {
        swingLookback: proposedParams.swingLookback,
        equalTolerancePct: proposedParams.equalTolerancePct,
        mergeTolerancePct: proposedParams.mergeTolerancePct,
        minTouches: proposedParams.minTouches
      },
      sweepConfig: {
        minWickProtrusionPct: proposedParams.minWickProtrusionPct
      },
      proposalConfig: {
        targetDistanceMultiplier: proposedParams.targetDistanceMultiplier
      }
    });
    const score = scoreBacktest2(backtestResult);
    let status;
    if (isBaseline) {
      status = "baseline";
      bestScore = score;
      bestParams = proposedParams;
      currentParams = proposedParams;
    } else if (args.mode === "discover") {
      status = "sampled";
      currentParams = proposedParams;
    } else if (score > bestScore) {
      status = "keep";
      bestScore = score;
      bestParams = proposedParams;
      currentParams = proposedParams;
    } else {
      status = "discard";
      currentParams = bestParams;
    }
    const rejectionTop = topRejections(backtestResult.diagnostic.rejections, 6);
    const narration = narrateIteration({
      idx,
      isBaseline,
      prevParams: idx === 0 ? null : bestParams,
      newParams: proposedParams,
      prevScore: idx === 0 ? null : bestScore - (status === "keep" ? score - bestScore : 0),
      newScore: score,
      trades: backtestResult.trades,
      winRate: backtestResult.winRate,
      netPnl: backtestResult.netPnl,
      status
    });
    const iterationRow = await persistIteration({
      sessionId: session2.id,
      idx,
      params: proposedParams,
      score,
      trades: backtestResult.trades,
      winRate: backtestResult.winRate,
      netPnl: backtestResult.netPnl,
      maxDrawdownPct: backtestResult.maxDrawdown,
      barsEvaluated: backtestResult.diagnostic.barsEvaluated,
      entriesTaken: backtestResult.diagnostic.entriesTaken,
      rejectionTop,
      status,
      narration,
      rationale,
      inputTokens: llmInputTokens,
      outputTokens: llmOutputTokens,
      costUsd: llmCost
    });
    history.push({
      idx,
      params: proposedParams,
      score,
      trades: backtestResult.trades,
      winRate: backtestResult.winRate,
      netPnl: backtestResult.netPnl,
      rejectionTop,
      status,
      rationale
    });
    if (args.mode === "tune" && (status === "keep" || status === "baseline")) {
      bestIterationId = iterationRow.id;
    }
    await db.update(autoresearchSessions).set({
      iterationsRun: idx + 1,
      bestScore: args.mode === "tune" ? bestScore.toFixed(6) : null,
      bestIterationId,
      totalCostUsd: totalCostUsd.toFixed(6)
    }).where(eq3(autoresearchSessions.id, session2.id));
  }
  await db.update(autoresearchSessions).set({ status: "paused" }).where(eq3(autoresearchSessions.id, session2.id));
}
async function markPaused(sessionId) {
  await db.update(autoresearchSessions).set({ status: "paused" }).where(eq3(autoresearchSessions.id, sessionId));
}
async function persistIteration(args) {
  const [row] = await db.insert(autoresearchIterations).values({
    sessionId: args.sessionId,
    idx: args.idx,
    params: args.params,
    score: args.score.toFixed(6),
    trades: args.trades,
    winRate: args.winRate.toFixed(4),
    netPnl: args.netPnl.toFixed(2),
    maxDrawdownPct: args.maxDrawdownPct.toFixed(2),
    barsEvaluated: args.barsEvaluated,
    entriesTaken: args.entriesTaken,
    rejectionTop: args.rejectionTop,
    status: args.status,
    narration: args.narration,
    rationale: args.rationale,
    inputTokens: args.inputTokens,
    outputTokens: args.outputTokens,
    costUsd: args.costUsd.toFixed(6)
  }).returning();
  return row;
}
function scoreBacktest2(r) {
  if (r.trades < 3) return 0;
  const sharpe = r.sharpe ?? 0;
  const tradesPenalty = Math.min(1, r.trades / 20);
  const winBonus = r.winRate;
  return Math.max(0, sharpe * tradesPenalty + winBonus);
}
function topRejections(rejections, n) {
  const sorted = Object.entries(rejections).sort((a, b) => b[1] - a[1]);
  const top = {};
  for (const [k, v] of sorted.slice(0, n)) {
    top[k] = v;
  }
  return top;
}
function clampParams(p) {
  return {
    minLevelRank: clamp(Math.round(p.minLevelRank), 1, 5),
    minRiskRewardRatio: clamp(p.minRiskRewardRatio, 0.5, 5),
    maxConcurrentPositions: clamp(Math.round(p.maxConcurrentPositions), 1, 10),
    swingLookback: clamp(Math.round(p.swingLookback), 2, 20),
    equalTolerancePct: clamp(p.equalTolerancePct, 1e-3, 1),
    mergeTolerancePct: clamp(p.mergeTolerancePct, 0.01, 1),
    minTouches: clamp(Math.round(p.minTouches), 1, 5),
    minWickProtrusionPct: clamp(p.minWickProtrusionPct, 1e-3, 1),
    targetDistanceMultiplier: clamp(p.targetDistanceMultiplier, 0.5, 5)
  };
}
function clamp(v, lo, hi) {
  if (!Number.isFinite(v)) return lo;
  return Math.max(lo, Math.min(hi, v));
}

// server/routes.ts
init_schema();
import { eq as eq4 } from "drizzle-orm";
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
  app2.get("/api/tenant", isAuthenticated, async (req, res) => {
    const u = getUser(req);
    const tenant = await storage.getOrCreateTenantForUser(u.id);
    const config = await storage.getTenantConfig(tenant.id);
    res.json({ tenant, config });
  });
  app2.get("/api/tenant/trades", isAuthenticated, async (req, res) => {
    const u = getUser(req);
    const tenant = await storage.getOrCreateTenantForUser(u.id);
    const rows = await storage.listTrades(tenant.id);
    res.json(rows);
  });
  app2.get("/api/tenant/regime-history", isAuthenticated, async (req, res) => {
    const u = getUser(req);
    const tenant = await storage.getOrCreateTenantForUser(u.id);
    const rows = await storage.listRegimeChanges(tenant.id);
    res.json(rows);
  });
  app2.post("/api/tenant/regime", isAuthenticated, async (req, res) => {
    const parsed = regimeChangeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "invalid" });
    }
    const u = getUser(req);
    const tenant = await storage.getOrCreateTenantForUser(u.id);
    const { fromRegime, toRegime } = await storage.setTenantRegime(
      tenant.id,
      parsed.data.toRegime,
      u.id
    );
    audit({
      userId: u.id,
      tenantId: tenant.id,
      action: "regime_change",
      resourceType: "tenant",
      resourceId: tenant.id,
      outcome: "success",
      detail: { fromRegime, toRegime },
      ipAddress: getIp(req)
    });
    const profile = getRegimeProfile(toRegime);
    res.json({ ok: true, fromRegime, toRegime, profile });
  });
  app2.get("/api/tenant/decisions", isAuthenticated, async (req, res) => {
    const u = getUser(req);
    const tenant = await storage.getOrCreateTenantForUser(u.id);
    res.json(await storage.listBotDecisions(tenant.id));
  });
  app2.get("/api/tenant/experiments", isAuthenticated, async (req, res) => {
    const u = getUser(req);
    const tenant = await storage.getOrCreateTenantForUser(u.id);
    res.json(await storage.listExperiments(tenant.id));
  });
  app2.post("/api/tenant/experiments", isAuthenticated, async (req, res) => {
    const schema = z2.object({
      name: z2.string().min(2).max(200),
      kind: z2.enum(["diagnostic", "param_sweep", "comparison"]),
      config: z2.record(z2.string(), z2.unknown())
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "invalid", issues: parsed.error.issues });
    }
    const u = getUser(req);
    const tenant = await storage.getOrCreateTenantForUser(u.id);
    const row = await storage.createExperiment({
      tenantId: tenant.id,
      name: parsed.data.name,
      kind: parsed.data.kind,
      config: parsed.data.config,
      createdByUserId: u.id
    });
    audit({
      userId: u.id,
      tenantId: tenant.id,
      action: "create_experiment",
      resourceType: "experiment",
      resourceId: row.id,
      outcome: "success",
      detail: { name: row.name, kind: row.kind },
      ipAddress: getIp(req)
    });
    res.json(row);
  });
  app2.patch("/api/tenant/experiments/:id", isAuthenticated, async (req, res) => {
    const id = pid(req, "id");
    const { enabled } = z2.object({ enabled: z2.boolean() }).parse(req.body);
    const u = getUser(req);
    const tenant = await storage.getOrCreateTenantForUser(u.id);
    const exp = await storage.getExperiment(id);
    if (!exp || exp.tenantId !== tenant.id) {
      return res.status(404).json({ error: "not_found" });
    }
    await storage.setExperimentEnabled(id, enabled);
    res.json({ ok: true });
  });
  app2.delete("/api/tenant/experiments/:id", isAuthenticated, async (req, res) => {
    const id = pid(req, "id");
    const u = getUser(req);
    const tenant = await storage.getOrCreateTenantForUser(u.id);
    const exp = await storage.getExperiment(id);
    if (!exp || exp.tenantId !== tenant.id) {
      return res.status(404).json({ error: "not_found" });
    }
    await storage.deleteExperiment(id);
    audit({
      userId: u.id,
      tenantId: tenant.id,
      action: "delete_experiment",
      resourceType: "experiment",
      resourceId: id,
      outcome: "success",
      ipAddress: getIp(req)
    });
    res.json({ ok: true });
  });
  app2.post("/api/tenant/experiments/:id/run", isAuthenticated, async (req, res) => {
    const id = pid(req, "id");
    const u = getUser(req);
    const tenant = await storage.getOrCreateTenantForUser(u.id);
    const exp = await storage.getExperiment(id);
    if (!exp || exp.tenantId !== tenant.id) {
      return res.status(404).json({ error: "not_found" });
    }
    const config = await storage.getTenantConfig(tenant.id);
    if (!config) return res.status(404).json({ error: "no_tenant_config" });
    const expConfig = exp.config;
    if (!expConfig.pairId) return res.status(400).json({ error: "experiment_missing_pairId" });
    const pair = await storage.getMarketPair(expConfig.pairId);
    if (!pair) return res.status(404).json({ error: "pair_not_found" });
    const symbol = `${pair.baseAsset}${pair.quoteAsset}`;
    const timeframe = expConfig.timeframe ?? "15m";
    const lookback = expConfig.lookbackBars ?? 300;
    const candles = await getBinance().fetchCandles({
      symbol,
      timeframe,
      limit: lookback
    });
    const live = {
      riskPercentPerTrade: Number(config.riskPercentPerTrade),
      minRiskRewardRatio: Number(config.minRiskRewardRatio),
      minLevelRank: config.minLevelRank,
      maxConcurrentPositions: config.maxConcurrentPositions,
      dailyDrawdownLimitPct: Number(config.dailyDrawdownLimitPct),
      weeklyDrawdownLimitPct: Number(config.weeklyDrawdownLimitPct),
      startingCapital: Number(config.paperStartingCapital ?? 1e4)
    };
    let metrics;
    let recommendation;
    if (exp.kind === "diagnostic") {
      const out = runDiagnostic({
        config: exp.config,
        candles,
        regime: tenant.activeRegime,
        live
      });
      metrics = out.metrics;
      recommendation = out.recommendation;
    } else if (exp.kind === "param_sweep") {
      const out = runParamSweep({
        config: exp.config,
        candles,
        regime: tenant.activeRegime,
        live
      });
      metrics = out.metrics;
      recommendation = out.recommendation;
    } else if (exp.kind === "comparison") {
      const out = runComparison({
        config: exp.config,
        candles,
        regime: tenant.activeRegime,
        live
      });
      metrics = out.metrics;
      recommendation = out.recommendation;
    } else {
      return res.status(400).json({ error: `unknown_kind: ${exp.kind}` });
    }
    const verdict = recommendation.diff ? "pending" : "no_action";
    const run = await storage.insertExperimentRun({
      tenantId: tenant.id,
      experimentId: exp.id,
      baselineConfig: live,
      proposedConfig: recommendation.diff ? { [recommendation.diff.paramKey]: recommendation.diff.toValue } : {},
      metrics,
      recommendation,
      verdict
    });
    res.json(run);
  });
  app2.get("/api/tenant/experiment-runs", isAuthenticated, async (req, res) => {
    const u = getUser(req);
    const tenant = await storage.getOrCreateTenantForUser(u.id);
    res.json(await storage.listExperimentRunsForTenant(tenant.id));
  });
  app2.get("/api/tenant/recommendations/pending", isAuthenticated, async (req, res) => {
    const u = getUser(req);
    const tenant = await storage.getOrCreateTenantForUser(u.id);
    res.json(await storage.listPendingRecommendations(tenant.id));
  });
  app2.post(
    "/api/tenant/recommendations/:id/:action",
    isAuthenticated,
    async (req, res) => {
      const id = pid(req, "id");
      const action = pid(req, "action");
      if (!["approve", "reject", "defer", "apply"].includes(action)) {
        return res.status(400).json({ error: "invalid_action" });
      }
      const u = getUser(req);
      const tenant = await storage.getOrCreateTenantForUser(u.id);
      const run = await storage.getExperimentRun(id);
      if (!run || run.tenantId !== tenant.id) {
        return res.status(404).json({ error: "not_found" });
      }
      if (action === "apply") {
        const result = await applyRecommendation({
          runId: id,
          operatorUserId: u.id,
          ipAddress: getIp(req)
        });
        if (!result.ok) return res.status(400).json({ error: result.reason });
        return res.json(result);
      }
      const verdictMap = {
        approve: "approved",
        reject: "rejected",
        defer: "deferred"
      };
      await storage.setRunVerdict(id, verdictMap[action], u.id);
      audit({
        userId: u.id,
        tenantId: tenant.id,
        action: `recommendation_${action}`,
        resourceType: "experiment_run",
        resourceId: id,
        outcome: "success",
        ipAddress: getIp(req)
      });
      res.json({ ok: true });
    }
  );
  app2.get("/api/tenant/experiments/appliable-keys", isAuthenticated, (_req, res) => {
    res.json(APPLIABLE_PARAM_KEYS);
  });
  app2.get("/api/autoresearch/capabilities", isAuthenticated, (_req, res) => {
    res.json({ available: isOpenAIConfigured() });
  });
  app2.get("/api/autoresearch/default-system-prompt", isAuthenticated, (req, res) => {
    const mode = req.query.mode === "discover" ? "discover" : "tune";
    const prompt = mode === "discover" ? DEFAULT_DISCOVER_PROMPT : DEFAULT_SYSTEM_PROMPT;
    res.type("text/plain").send(prompt);
  });
  app2.post("/api/autoresearch/sessions", isAuthenticated, async (req, res) => {
    if (!isOpenAIConfigured()) {
      return res.status(400).json({
        error: "openai_not_configured",
        message: "OPENAI_API_KEY not set. Add it to Doppler dev: doppler secrets set OPENAI_API_KEY=sk-... --config dev"
      });
    }
    const schema = z2.object({
      goal: z2.string().min(5).max(500),
      pairId: z2.string().uuid(),
      timeframe: z2.enum(["15m", "1h", "4h", "12h", "1d"]),
      lookbackBars: z2.number().int().min(100).max(1e3),
      regime: z2.enum([
        "no_trade",
        "ranging",
        "trending",
        "breakout",
        "high_volatility",
        "low_liquidity",
        "accumulation_distribution"
      ]),
      model: z2.enum(["gpt-4o", "gpt-4o-mini"]),
      maxIterations: z2.number().int().min(5).max(200),
      mode: z2.enum(["tune", "discover"]).default("tune"),
      // Operator-confirmed system prompt. Required — the client always
      // submits the textarea contents (pre-populated from
      // /api/autoresearch/default-system-prompt and editable). Capped
      // at 20k chars so a runaway paste can't blow the column.
      systemPrompt: z2.string().min(50).max(2e4),
      // Optional seed params for the baseline iteration. Used by the
      // "Continue from this iteration" flow. Must be a JSON object of
      // numeric values; missing keys fall back to DEFAULT_PARAMS in the
      // orchestrator. We don't strictly validate the shape here because
      // the orchestrator clamps + merges defensively.
      seedParams: z2.record(z2.string(), z2.number()).optional()
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "invalid", issues: parsed.error.issues });
    }
    const u = getUser(req);
    const tenant = await storage.getOrCreateTenantForUser(u.id);
    const pair = await storage.getMarketPair(parsed.data.pairId);
    if (!pair) return res.status(404).json({ error: "pair_not_found" });
    const existing = await storage.findRunningAutoresearchSession(tenant.id);
    if (existing) {
      return res.status(409).json({
        error: "session_already_running",
        sessionId: existing.id
      });
    }
    try {
      const session2 = await startSession({
        tenantId: tenant.id,
        userId: u.id,
        goal: parsed.data.goal,
        pairId: parsed.data.pairId,
        pairSymbol: `${pair.baseAsset}${pair.quoteAsset}`,
        timeframe: parsed.data.timeframe,
        lookbackBars: parsed.data.lookbackBars,
        regime: parsed.data.regime,
        model: parsed.data.model,
        maxIterations: parsed.data.maxIterations,
        systemPrompt: parsed.data.systemPrompt,
        mode: parsed.data.mode,
        seedParams: parsed.data.seedParams
      });
      audit({
        userId: u.id,
        tenantId: tenant.id,
        action: "autoresearch_session_started",
        resourceType: "autoresearch_session",
        resourceId: session2.id,
        outcome: "success",
        detail: {
          goal: parsed.data.goal,
          model: parsed.data.model,
          maxIterations: parsed.data.maxIterations
        },
        ipAddress: getIp(req)
      });
      res.json(session2);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app2.post(
    "/api/autoresearch/sessions/:id/pause",
    isAuthenticated,
    async (req, res) => {
      const id = pid(req, "id");
      const u = getUser(req);
      const tenant = await storage.getOrCreateTenantForUser(u.id);
      const session2 = await storage.getAutoresearchSession(id);
      if (!session2 || session2.tenantId !== tenant.id) {
        return res.status(404).json({ error: "not_found" });
      }
      requestStop(id);
      audit({
        userId: u.id,
        tenantId: tenant.id,
        action: "autoresearch_session_paused",
        resourceType: "autoresearch_session",
        resourceId: id,
        outcome: "success",
        ipAddress: getIp(req)
      });
      res.json({ ok: true });
    }
  );
  app2.post(
    "/api/autoresearch/sessions/:id/continue",
    isAuthenticated,
    async (req, res) => {
      const id = pid(req, "id");
      const u = getUser(req);
      const tenant = await storage.getOrCreateTenantForUser(u.id);
      const session2 = await storage.getAutoresearchSession(id);
      if (!session2 || session2.tenantId !== tenant.id) {
        return res.status(404).json({ error: "not_found" });
      }
      const extra = typeof req.body?.extra === "number" && req.body.extra > 0 ? Math.min(200, Math.floor(req.body.extra)) : void 0;
      try {
        const resumed = await resumeSession({ sessionId: id, extraIterations: extra });
        audit({
          userId: u.id,
          tenantId: tenant.id,
          action: "autoresearch_session_continued",
          resourceType: "autoresearch_session",
          resourceId: id,
          outcome: "success",
          detail: { extra, newMaxIterations: resumed.maxIterations },
          ipAddress: getIp(req)
        });
        res.json(resumed);
      } catch (err) {
        res.status(400).json({ error: err.message });
      }
    }
  );
  app2.post(
    "/api/autoresearch/sessions/:id/done",
    isAuthenticated,
    async (req, res) => {
      const id = pid(req, "id");
      const u = getUser(req);
      const tenant = await storage.getOrCreateTenantForUser(u.id);
      const session2 = await storage.getAutoresearchSession(id);
      if (!session2 || session2.tenantId !== tenant.id) {
        return res.status(404).json({ error: "not_found" });
      }
      if (session2.status === "running") {
        return res.status(400).json({
          error: "pause_first",
          message: "Pause the session before marking it Done."
        });
      }
      await db.update(autoresearchSessions).set({ status: "stopped", stoppedAt: /* @__PURE__ */ new Date() }).where(eq4(autoresearchSessions.id, id));
      audit({
        userId: u.id,
        tenantId: tenant.id,
        action: "autoresearch_session_done",
        resourceType: "autoresearch_session",
        resourceId: id,
        outcome: "success",
        ipAddress: getIp(req)
      });
      res.json({ ok: true });
    }
  );
  app2.get("/api/autoresearch/sessions", isAuthenticated, async (req, res) => {
    const u = getUser(req);
    const tenant = await storage.getOrCreateTenantForUser(u.id);
    const sessions2 = await storage.listAutoresearchSessions(tenant.id);
    res.json(sessions2);
  });
  app2.get("/api/autoresearch/active", isAuthenticated, async (req, res) => {
    const u = getUser(req);
    const tenant = await storage.getOrCreateTenantForUser(u.id);
    const active = await storage.findRunningAutoresearchSession(tenant.id);
    res.json(active);
  });
  app2.get("/api/autoresearch/sessions/:id", isAuthenticated, async (req, res) => {
    const id = pid(req, "id");
    const u = getUser(req);
    const tenant = await storage.getOrCreateTenantForUser(u.id);
    const session2 = await storage.getAutoresearchSession(id);
    if (!session2 || session2.tenantId !== tenant.id) {
      return res.status(404).json({ error: "not_found" });
    }
    res.json(session2);
  });
  app2.get(
    "/api/autoresearch/sessions/:id/iterations",
    isAuthenticated,
    async (req, res) => {
      const id = pid(req, "id");
      const u = getUser(req);
      const tenant = await storage.getOrCreateTenantForUser(u.id);
      const session2 = await storage.getAutoresearchSession(id);
      if (!session2 || session2.tenantId !== tenant.id) {
        return res.status(404).json({ error: "not_found" });
      }
      const iterations = await storage.listAutoresearchIterations(id);
      res.json(iterations);
    }
  );
  app2.get(
    "/api/autoresearch/sessions/:id/candles",
    isAuthenticated,
    async (req, res) => {
      const id = pid(req, "id");
      const u = getUser(req);
      const tenant = await storage.getOrCreateTenantForUser(u.id);
      const session2 = await storage.getAutoresearchSession(id);
      if (!session2 || session2.tenantId !== tenant.id) {
        return res.status(404).json({ error: "not_found" });
      }
      const pair = await storage.getMarketPair(session2.pairId);
      if (!pair) return res.status(404).json({ error: "pair_not_found" });
      const symbol = `${pair.baseAsset}${pair.quoteAsset}`;
      const candles = await getBinance().fetchCandles({
        symbol,
        timeframe: session2.timeframe,
        limit: session2.lookbackBars
      });
      const seeded = {
        ...DEFAULT_PARAMS,
        ...session2.seedParams ?? {}
      };
      const levels = identifyLevels(candles, {
        swingLookback: seeded.swingLookback,
        equalTolerancePct: seeded.equalTolerancePct,
        mergeTolerancePct: seeded.mergeTolerancePct,
        minTouches: seeded.minTouches
      });
      const iterations = await storage.listAutoresearchIterations(id);
      const profitable = iterations.filter(
        (i) => i.trades > 0 && Number(i.netPnl) > 0
      );
      const trades2 = [];
      for (const it of profitable) {
        const p = {
          ...DEFAULT_PARAMS,
          ...it.params
        };
        const result = runBacktest({
          candles,
          regime: session2.regime,
          startingCapital: 1e4,
          warmupCandles: 100,
          config: {
            riskPercentPerTrade: 1,
            minRiskRewardRatio: p.minRiskRewardRatio,
            minLevelRank: p.minLevelRank,
            maxConcurrentPositions: p.maxConcurrentPositions,
            dailyDrawdownLimitPct: 3,
            weeklyDrawdownLimitPct: 6
          },
          levelConfig: {
            swingLookback: p.swingLookback,
            equalTolerancePct: p.equalTolerancePct,
            mergeTolerancePct: p.mergeTolerancePct,
            minTouches: p.minTouches
          },
          sweepConfig: { minWickProtrusionPct: p.minWickProtrusionPct },
          proposalConfig: { targetDistanceMultiplier: p.targetDistanceMultiplier }
        });
        for (const t of result.tradeLog) {
          if (t.realisedPnl > 0) {
            trades2.push({
              openedAt: t.openedAt,
              closedAt: t.closedAt,
              side: t.side,
              entry: t.entry,
              realisedPnl: t.realisedPnl,
              outcome: t.outcome,
              iterationIdx: it.idx,
              triggerPrice: t.triggerPrice,
              triggerSide: t.triggerSide
            });
          }
        }
      }
      res.json({ candles, levels, trades: trades2 });
    }
  );
  app2.post(
    "/api/autoresearch/iterations/:id/install",
    isAuthenticated,
    async (req, res) => {
      const id = pid(req, "id");
      const u = getUser(req);
      const tenant = await storage.getOrCreateTenantForUser(u.id);
      const iteration = await storage.getAutoresearchIteration(id);
      if (!iteration) return res.status(404).json({ error: "not_found" });
      const session2 = await storage.getAutoresearchSession(iteration.sessionId);
      if (!session2 || session2.tenantId !== tenant.id) {
        return res.status(404).json({ error: "not_found" });
      }
      const params = iteration.params;
      const errors = [];
      const requireRange = (key, lo, hi) => {
        const v = params[key];
        if (typeof v !== "number" || !Number.isFinite(v) || v < lo || v > hi) {
          errors.push(`${key}: ${v} not in [${lo}, ${hi}]`);
        }
      };
      requireRange("minLevelRank", 1, 5);
      requireRange("minRiskRewardRatio", 0.5, 5);
      requireRange("maxConcurrentPositions", 1, 10);
      requireRange("swingLookback", 2, 20);
      requireRange("equalTolerancePct", 1e-3, 1);
      requireRange("mergeTolerancePct", 0.01, 1);
      requireRange("minTouches", 1, 5);
      requireRange("minWickProtrusionPct", 1e-3, 1);
      requireRange("targetDistanceMultiplier", 0.5, 5);
      if (errors.length > 0) {
        return res.status(400).json({ error: "invalid_params", details: errors });
      }
      await storage.updateTenantConfig(tenant.id, {
        minLevelRank: Math.round(params.minLevelRank),
        minRiskRewardRatio: String(params.minRiskRewardRatio),
        maxConcurrentPositions: Math.round(params.maxConcurrentPositions),
        strategyParams: {
          swingLookback: Math.round(params.swingLookback),
          equalTolerancePct: params.equalTolerancePct,
          mergeTolerancePct: params.mergeTolerancePct,
          minTouches: Math.round(params.minTouches),
          minWickProtrusionPct: params.minWickProtrusionPct,
          targetDistanceMultiplier: params.targetDistanceMultiplier
        },
        // Switch portfolio_tier to manual so the auto-tier logic doesn't
        // overwrite the operator's choice on next capital change.
        portfolioTier: "manual"
      });
      audit({
        userId: u.id,
        tenantId: tenant.id,
        action: "install_autoresearch_iteration",
        resourceType: "autoresearch_iteration",
        resourceId: iteration.id,
        outcome: "success",
        detail: {
          sessionId: iteration.sessionId,
          iterationIdx: iteration.idx,
          params
        },
        ipAddress: getIp(req)
      });
      res.json({ ok: true, iterationId: iteration.id });
    }
  );
  app2.get("/api/tenant/costs", isAuthenticated, async (req, res) => {
    const u = getUser(req);
    const tenant = await storage.getOrCreateTenantForUser(u.id);
    res.json(await storage.getTenantCosts(tenant.id));
  });
  app2.patch("/api/tenant/config", isAuthenticated, async (req, res) => {
    const schema = z2.object({
      paperStartingCapital: z2.string().optional(),
      riskPercentPerTrade: z2.string().optional(),
      maxConcurrentPositions: z2.number().int().min(1).max(10).optional(),
      dailyDrawdownLimitPct: z2.string().optional(),
      weeklyDrawdownLimitPct: z2.string().optional(),
      minRiskRewardRatio: z2.string().optional(),
      minLevelRank: z2.number().int().min(1).max(5).optional(),
      tradingTimeframe: z2.enum(["15m", "1h", "4h", "12h", "1d"]).optional()
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "invalid" });
    const u = getUser(req);
    const tenant = await storage.getOrCreateTenantForUser(u.id);
    const config = await storage.getTenantConfig(tenant.id);
    let patch = parsed.data;
    if (parsed.data.paperStartingCapital && config?.portfolioTier === "auto") {
      const newCapital = Number(parsed.data.paperStartingCapital);
      const newTier = tierFor(newCapital);
      patch = { ...patch, ...tierDefaults(newTier) };
    } else if (parsed.data.riskPercentPerTrade || parsed.data.maxConcurrentPositions || parsed.data.minRiskRewardRatio || parsed.data.minLevelRank || parsed.data.dailyDrawdownLimitPct || parsed.data.weeklyDrawdownLimitPct) {
      patch = { ...patch, portfolioTier: "manual" };
    }
    await storage.updateTenantConfig(tenant.id, patch);
    audit({
      userId: u.id,
      tenantId: tenant.id,
      action: "update_tenant_config",
      outcome: "success",
      detail: patch,
      ipAddress: getIp(req)
    });
    res.json({ ok: true });
  });
  app2.patch("/api/tenant/portfolio-tier", isAuthenticated, async (req, res) => {
    const { tier } = z2.object({ tier: z2.enum(["auto", "tiny", "small", "medium", "large"]) }).parse(req.body);
    const u = getUser(req);
    const tenant = await storage.getOrCreateTenantForUser(u.id);
    const config = await storage.getTenantConfig(tenant.id);
    if (!config) return res.status(404).json({ error: "no_config" });
    const capital = Number(config.paperStartingCapital);
    const resolvedTier = tier === "auto" ? tierFor(capital) : tier;
    const defaults = tierDefaults(resolvedTier);
    await storage.applyPortfolioTier(
      tenant.id,
      tier === "auto" ? "auto" : resolvedTier,
      defaults
    );
    audit({
      userId: u.id,
      tenantId: tenant.id,
      action: "apply_portfolio_tier",
      outcome: "success",
      detail: { requestedTier: tier, resolvedTier, capital },
      ipAddress: getIp(req)
    });
    res.json({ ok: true, resolvedTier, defaults });
  });
  app2.patch("/api/tenant/pair", isAuthenticated, async (req, res) => {
    const { pairId } = z2.object({ pairId: z2.string().uuid().nullable() }).parse(req.body);
    const u = getUser(req);
    const tenant = await storage.getOrCreateTenantForUser(u.id);
    await storage.setActivePair(tenant.id, pairId);
    audit({
      userId: u.id,
      tenantId: tenant.id,
      action: "set_active_pair",
      outcome: "success",
      detail: { pairId },
      ipAddress: getIp(req)
    });
    res.json({ ok: true });
  });
  app2.patch("/api/tenant/autopilot", isAuthenticated, async (req, res) => {
    const { autopilot } = z2.object({ autopilot: z2.boolean() }).parse(req.body);
    const u = getUser(req);
    const tenant = await storage.getOrCreateTenantForUser(u.id);
    await storage.setAutopilot(tenant.id, autopilot);
    audit({
      userId: u.id,
      tenantId: tenant.id,
      action: "set_autopilot_regime",
      outcome: "success",
      detail: { autopilot },
      ipAddress: getIp(req)
    });
    res.json({ ok: true });
  });
  app2.patch("/api/tenant/bot-status", isAuthenticated, async (req, res) => {
    const { status } = z2.object({ status: z2.enum(["off", "active", "paused"]) }).parse(req.body);
    const u = getUser(req);
    const tenant = await storage.getOrCreateTenantForUser(u.id);
    if (status === "active" && tenant.activeRegime === "no_trade" && !tenant.autopilotRegime) {
      return res.status(400).json({ error: "regime_required" });
    }
    await storage.setBotStatus(tenant.id, status);
    audit({
      userId: u.id,
      tenantId: tenant.id,
      action: "set_bot_status",
      outcome: "success",
      detail: { status },
      ipAddress: getIp(req)
    });
    res.json({ ok: true });
  });
  app2.get("/api/tenant/exchange-keys", isAuthenticated, async (req, res) => {
    const u = getUser(req);
    const tenant = await storage.getOrCreateTenantForUser(u.id);
    res.json(await storage.listExchangeKeyMetadata(tenant.id));
  });
  app2.post("/api/tenant/exchange-keys", isAuthenticated, async (req, res) => {
    const schema = z2.object({
      exchange: z2.enum(["binance", "bybit"]),
      apiKey: z2.string().min(10).max(256),
      apiSecret: z2.string().min(10).max(256)
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "invalid" });
    const u = getUser(req);
    const tenant = await storage.getOrCreateTenantForUser(u.id);
    await storage.saveExchangeKey({ ...parsed.data, tenantId: tenant.id });
    audit({
      userId: u.id,
      tenantId: tenant.id,
      action: "save_exchange_key",
      resourceType: "exchange_key",
      outcome: "success",
      detail: { exchange: parsed.data.exchange },
      ipAddress: getIp(req)
    });
    res.json({ ok: true });
  });
  app2.post("/api/tenant/emergency-exit", isAuthenticated, async (req, res) => {
    const u = getUser(req);
    const tenant = await storage.getOrCreateTenantForUser(u.id);
    const result = await emergencyMarketExit(tenant.id, u.id);
    audit({
      userId: u.id,
      tenantId: tenant.id,
      action: "emergency_exit",
      outcome: "success",
      detail: result,
      ipAddress: getIp(req)
    });
    res.json(result);
  });
  app2.get("/api/markets", isAuthenticated, async (_req, res) => {
    res.json(await storage.listEnabledPairs());
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
  app2.get("/api/admin/invites", isAuthenticated, isAdmin, async (_req, res) => {
    res.json(await storage.listInvites());
  });
  app2.post("/api/admin/invites", isAuthenticated, isAdmin, async (req, res) => {
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
  });
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
  app2.patch("/api/admin/pairs/:id", isAuthenticated, isAdmin, async (req, res) => {
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
  });
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
  app2.delete("/api/admin/pairs/:id", isAuthenticated, isAdmin, async (req, res) => {
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
  });
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
