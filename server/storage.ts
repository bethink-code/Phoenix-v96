import { db } from "./db";
import { eq, and, desc, gte, sql } from "drizzle-orm";
import {
  users,
  tenants,
  tenantConfigs,
  invitedUsers,
  accessRequests,
  auditLogs,
  marketPairs,
  trades,
  botDecisions,
  exchangeKeys,
  llmUsage,
  regimeChanges,
  riskEvents,
  type User,
  type InsertUser,
  type Tenant,
  type Regime,
} from "../shared/schema";
import { encryptSecret } from "./cryptoUtil";

// Database query layer. All queries go through here — no inline SQL or Drizzle
// calls scattered across routes.ts.

export const storage = {
  // ---------- Users ----------
  async getUserById(id: string): Promise<User | undefined> {
    const [row] = await db.select().from(users).where(eq(users.id, id));
    return row;
  },

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [row] = await db.select().from(users).where(eq(users.email, email));
    return row;
  },

  async upsertUserFromGoogle(profile: {
    email: string;
    firstName?: string;
    lastName?: string;
    profileImageUrl?: string;
  }): Promise<User> {
    const existing = await this.getUserByEmail(profile.email);
    if (existing) {
      const [updated] = await db
        .update(users)
        .set({
          firstName: profile.firstName ?? existing.firstName,
          lastName: profile.lastName ?? existing.lastName,
          profileImageUrl: profile.profileImageUrl ?? existing.profileImageUrl,
          lastLoginAt: new Date(),
        })
        .where(eq(users.id, existing.id))
        .returning();
      return updated;
    }
    const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase();
    const isAdmin = adminEmail && profile.email.toLowerCase() === adminEmail;
    const [created] = await db
      .insert(users)
      .values({
        email: profile.email,
        firstName: profile.firstName,
        lastName: profile.lastName,
        profileImageUrl: profile.profileImageUrl,
        isAdmin: Boolean(isAdmin),
        lastLoginAt: new Date(),
      })
      .returning();
    return created;
  },

  async acceptTerms(userId: string): Promise<void> {
    await db
      .update(users)
      .set({ termsAcceptedAt: new Date() })
      .where(eq(users.id, userId));
  },

  async listUsers(): Promise<User[]> {
    return db.select().from(users).orderBy(desc(users.createdAt));
  },

  async setAdmin(userId: string, isAdmin: boolean): Promise<void> {
    await db.update(users).set({ isAdmin }).where(eq(users.id, userId));
  },

  async setSuspended(userId: string, isSuspended: boolean): Promise<void> {
    await db.update(users).set({ isSuspended }).where(eq(users.id, userId));
  },

  // ---------- Invites ----------
  async isEmailInvited(email: string): Promise<boolean> {
    const [row] = await db
      .select()
      .from(invitedUsers)
      .where(eq(invitedUsers.email, email.toLowerCase()));
    return Boolean(row);
  },

  async listInvites() {
    return db.select().from(invitedUsers).orderBy(desc(invitedUsers.createdAt));
  },

  async addInvite(email: string, invitedByUserId: string) {
    const [row] = await db
      .insert(invitedUsers)
      .values({ email: email.toLowerCase(), invitedByUserId })
      .onConflictDoNothing()
      .returning();
    return row;
  },

  async removeInvite(id: string) {
    await db.delete(invitedUsers).where(eq(invitedUsers.id, id));
  },

  // ---------- Access requests ----------
  async createAccessRequest(input: {
    name: string;
    email: string;
    cell?: string;
    reason?: string;
  }) {
    const [row] = await db
      .insert(accessRequests)
      .values({
        name: input.name,
        email: input.email.toLowerCase(),
        cell: input.cell,
        reason: input.reason,
      })
      .returning();
    return row;
  },

  async listAccessRequests() {
    return db.select().from(accessRequests).orderBy(desc(accessRequests.createdAt));
  },

  async decideAccessRequest(
    id: string,
    status: "approved" | "declined",
    adminId: string
  ) {
    await db
      .update(accessRequests)
      .set({ status, decidedAt: new Date(), decidedByUserId: adminId })
      .where(eq(accessRequests.id, id));
  },

  // ---------- Audit ----------
  async listAuditLogs(limit = 200) {
    return db
      .select()
      .from(auditLogs)
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit);
  },

  async securityOverview() {
    const [totalUsers] = await db.select({ n: sql<number>`count(*)::int` }).from(users);
    const [admins] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(users)
      .where(eq(users.isAdmin, true));
    const [suspended] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(users)
      .where(eq(users.isSuspended, true));
    const [pendingRequests] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(accessRequests)
      .where(eq(accessRequests.status, "pending"));
    return {
      totalUsers: totalUsers.n,
      admins: admins.n,
      suspended: suspended.n,
      pendingRequests: pendingRequests.n,
    };
  },

  // ---------- Tenants ----------
  async getOrCreateTenantForUser(userId: string): Promise<Tenant> {
    const [existing] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.userId, userId));
    if (existing) return existing;
    const [created] = await db
      .insert(tenants)
      .values({ userId, name: "Primary instance" })
      .returning();
    await db.insert(tenantConfigs).values({ tenantId: created.id });
    return created;
  },

  async getTenantConfig(tenantId: string) {
    const [row] = await db
      .select()
      .from(tenantConfigs)
      .where(eq(tenantConfigs.tenantId, tenantId));
    return row;
  },

  async setTenantRegime(
    tenantId: string,
    toRegime: Regime,
    userId: string,
    source: "manual" | "autopilot" = "manual"
  ) {
    const [tenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.id, tenantId));
    if (!tenant) throw new Error("tenant not found");
    const fromRegime = tenant.activeRegime;
    if (fromRegime === toRegime && tenant.activeRegimeSource === source) {
      return { fromRegime, toRegime, noop: true };
    }
    await db
      .update(tenants)
      .set({ activeRegime: toRegime, activeRegimeSource: source })
      .where(eq(tenants.id, tenantId));
    await db.insert(regimeChanges).values({
      tenantId,
      fromRegime,
      toRegime,
      changedByUserId: userId,
    });
    return { fromRegime, toRegime, noop: false };
  },

  async setAutopilot(tenantId: string, autopilot: boolean) {
    await db
      .update(tenants)
      .set({ autopilotRegime: autopilot })
      .where(eq(tenants.id, tenantId));
  },

  async writeRegimeSuggestion(input: {
    tenantId: string;
    regime: Regime;
    confidence: number;
    rationale: string[];
    signals: unknown;
  }) {
    await db
      .update(tenants)
      .set({
        suggestedRegime: input.regime,
        suggestedRegimeConfidence: String(input.confidence),
        suggestedRegimeAt: new Date(),
        suggestedRegimeRationale: input.rationale,
        suggestedRegimeSignals: input.signals as object,
      })
      .where(eq(tenants.id, input.tenantId));
  },

  async setBotStatus(
    tenantId: string,
    status: "off" | "active" | "paused" | "halted" | "error",
    reason?: string
  ) {
    const isHalt = status === "halted" || status === "error";
    // PRD §3.2: "Switching back ON requires regime selection — the bot does
    // not resume from a previous state, it requires a fresh deliberate
    // decision." Resetting regime to NO TRADE on any halt forces the
    // user to explicitly pick a regime before the next Start.
    await db
      .update(tenants)
      .set({
        botStatus: status,
        lastHaltedAt: isHalt ? new Date() : undefined,
        lastHaltReason: reason,
        ...(isHalt ? { activeRegime: "no_trade" as const } : {}),
      })
      .where(eq(tenants.id, tenantId));
  },

  async listRegimeChanges(tenantId: string, limit = 50) {
    return db
      .select()
      .from(regimeChanges)
      .where(eq(regimeChanges.tenantId, tenantId))
      .orderBy(desc(regimeChanges.createdAt))
      .limit(limit);
  },

  // ---------- Market pairs ----------
  async listEnabledPairs() {
    return db.select().from(marketPairs).where(eq(marketPairs.enabled, true));
  },

  async listAllPairs() {
    return db.select().from(marketPairs).orderBy(desc(marketPairs.createdAt));
  },

  async createPair(input: typeof marketPairs.$inferInsert) {
    const [row] = await db.insert(marketPairs).values(input).returning();
    return row;
  },

  async updatePair(id: string, patch: Partial<typeof marketPairs.$inferInsert>) {
    await db
      .update(marketPairs)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(marketPairs.id, id));
  },

  // ---------- Trades ----------
  async listTrades(tenantId: string, limit = 100) {
    return db
      .select()
      .from(trades)
      .where(eq(trades.tenantId, tenantId))
      .orderBy(desc(trades.openedAt))
      .limit(limit);
  },

  async listOpenTrades(tenantId: string) {
    return db
      .select()
      .from(trades)
      .where(and(eq(trades.tenantId, tenantId), eq(trades.status, "open")));
  },

  async closeTrade(input: {
    tradeId: string;
    exitPrice: number;
    realisedPnl: number;
    reason: "target" | "stop" | "emergency" | "timeout" | "manual";
  }) {
    await db
      .update(trades)
      .set({
        status: "closed",
        exitPrice: String(input.exitPrice),
        realisedPnl: String(input.realisedPnl),
        closedAt: new Date(),
        closeReason: input.reason,
      })
      .where(eq(trades.id, input.tradeId));
  },

  async recordRiskEvent(input: {
    tenantId: string;
    eventType: string;
    severity: "info" | "warn" | "critical";
    detail: unknown;
    triggeredByUserId?: string;
  }) {
    await db.insert(riskEvents).values({
      tenantId: input.tenantId,
      eventType: input.eventType,
      severity: input.severity,
      detail: input.detail as object,
      triggeredByUserId: input.triggeredByUserId,
    });
  },

  async touchTenantTick(tenantId: string) {
    await db
      .update(tenants)
      .set({ lastTickAt: new Date() })
      .where(eq(tenants.id, tenantId));
  },

  async incrementExchangeFailures(tenantId: string): Promise<number> {
    const [row] = await db
      .update(tenants)
      .set({
        consecutiveExchangeFailures: sql`${tenants.consecutiveExchangeFailures} + 1`,
      })
      .where(eq(tenants.id, tenantId))
      .returning({ n: tenants.consecutiveExchangeFailures });
    return row.n;
  },

  async resetExchangeFailures(tenantId: string) {
    await db
      .update(tenants)
      .set({ consecutiveExchangeFailures: 0 })
      .where(eq(tenants.id, tenantId));
  },

  async listBotDecisions(tenantId: string, limit = 50) {
    return db
      .select()
      .from(botDecisions)
      .where(eq(botDecisions.tenantId, tenantId))
      .orderBy(desc(botDecisions.createdAt))
      .limit(limit);
  },

  async updateTenantConfig(
    tenantId: string,
    patch: Partial<typeof tenantConfigs.$inferInsert>
  ) {
    await db
      .update(tenantConfigs)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(tenantConfigs.tenantId, tenantId));
  },

  async setActivePair(tenantId: string, pairId: string | null) {
    await db
      .update(tenants)
      .set({ activePairId: pairId })
      .where(eq(tenants.id, tenantId));
  },

  async saveExchangeKey(input: {
    tenantId: string;
    exchange: string;
    apiKey: string;
    apiSecret: string;
  }) {
    const keyBlob = encryptSecret(input.apiKey);
    const secretBlob = encryptSecret(input.apiSecret);
    // One key per tenant+exchange — replace if exists.
    await db
      .delete(exchangeKeys)
      .where(
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
      apiSecretAuthTag: secretBlob.authTag,
    });
  },

  // "What is this thing costing me?" — activity + spend summary for the
  // header strip. ticks come from bot_decisions (one row per tick), API
  // calls are estimated at 2 per tick (klines + ticker), LLM spend comes
  // from llm_usage for the current calendar month, infra spend is a
  // placeholder until Vercel's observability API is wired.
  async getTenantCosts(tenantId: string) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const startOfHour = new Date();
    startOfHour.setMinutes(0, 0, 0);
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [today] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(botDecisions)
      .where(
        and(
          eq(botDecisions.tenantId, tenantId),
          gte(botDecisions.createdAt, startOfDay)
        )
      );

    const [hour] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(botDecisions)
      .where(
        and(
          eq(botDecisions.tenantId, tenantId),
          gte(botDecisions.createdAt, startOfHour)
        )
      );

    const [llmMonth] = await db
      .select({ cost: sql<number>`coalesce(sum(cost_usd), 0)::float` })
      .from(llmUsage)
      .where(
        and(
          eq(llmUsage.tenantId, tenantId),
          gte(llmUsage.createdAt, startOfMonth)
        )
      );

    const [firstDecision] = await db
      .select({ at: botDecisions.createdAt })
      .from(botDecisions)
      .where(eq(botDecisions.tenantId, tenantId))
      .orderBy(botDecisions.createdAt)
      .limit(1);

    const [tenant] = await db
      .select({
        lastTickAt: tenants.lastTickAt,
        failures: tenants.consecutiveExchangeFailures,
      })
      .from(tenants)
      .where(eq(tenants.id, tenantId));

    return {
      ticksToday: today.n,
      ticksThisHour: hour.n,
      apiCallsToday: today.n * 2, // 1 klines + 1 ticker per tick
      llmCostMonth: llmMonth.cost,
      infraCostMonth: 0, // Vercel Hobby = free; wire observability API later
      firstSeenAt: firstDecision?.at ?? null,
      lastTickAt: tenant?.lastTickAt ?? null,
      consecutiveExchangeFailures: tenant?.failures ?? 0,
    };
  },

  async listExchangeKeyMetadata(tenantId: string) {
    // Return only metadata — NEVER decrypt for listing purposes.
    // PRD §12.3 — keys are never visible after entry.
    return db
      .select({
        id: exchangeKeys.id,
        exchange: exchangeKeys.exchange,
        permissionsValidatedAt: exchangeKeys.permissionsValidatedAt,
        createdAt: exchangeKeys.createdAt,
      })
      .from(exchangeKeys)
      .where(eq(exchangeKeys.tenantId, tenantId));
  },
};
