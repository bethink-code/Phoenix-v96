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
  botDecisions: () => botDecisions,
  botStatusEnum: () => botStatusEnum,
  exchangeKeys: () => exchangeKeys,
  experimentRuns: () => experimentRuns,
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
  riskPercentPerTrade: numeric("risk_percent_per_trade", { precision: 5, scale: 3 }).notNull().default("1.000"),
  maxConcurrentPositions: integer("max_concurrent_positions").notNull().default(2),
  dailyDrawdownLimitPct: numeric("daily_drawdown_limit_pct", { precision: 5, scale: 2 }).notNull().default("3.00"),
  weeklyDrawdownLimitPct: numeric("weekly_drawdown_limit_pct", { precision: 5, scale: 2 }).notNull().default("6.00"),
  minRiskRewardRatio: numeric("min_risk_reward_ratio", { precision: 4, scale: 2 }).notNull().default("2.00"),
  minLevelRank: integer("min_level_rank").notNull().default(2),
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
var experimentRuns = pgTable("experiment_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  week: varchar("week", { length: 10 }).notNull(),
  // ISO week e.g. 2026-W15
  baselineConfig: jsonb("baseline_config").notNull(),
  proposedConfig: jsonb("proposed_config").notNull(),
  metrics: jsonb("metrics").notNull(),
  verdict: varchar("verdict", { length: 16 }).notNull(),
  // kept/discarded/pending_review
  reviewedByUserId: uuid("reviewed_by_user_id").references(() => users.id),
  reviewedAt: timestamp("reviewed_at"),
  appliedAt: timestamp("applied_at"),
  createdAt: timestamp("created_at").notNull().defaultNow()
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
import { eq, and, desc, gte, sql as sql2 } from "drizzle-orm";

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

// server/modules/emergencyExit.ts
import { eq as eq2 } from "drizzle-orm";

// server/modules/exchange/binance.ts
var TIMEFRAME_MAP = {
  "1m": "1m",
  "5m": "5m",
  "15m": "15m",
  "1h": "1h",
  "4h": "4h",
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
      minLevelRank: z2.number().int().min(1).max(5).optional()
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "invalid" });
    const u = getUser(req);
    const tenant = await storage.getOrCreateTenantForUser(u.id);
    await storage.updateTenantConfig(tenant.id, parsed.data);
    audit({
      userId: u.id,
      tenantId: tenant.id,
      action: "update_tenant_config",
      outcome: "success",
      detail: parsed.data,
      ipAddress: getIp(req)
    });
    res.json({ ok: true });
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
    async (_req, res) => {
      try {
        const symbols = await getBinance().fetchSymbols();
        res.json(symbols);
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
    windowMs: 15 * 60 * 1e3,
    max: 200,
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
