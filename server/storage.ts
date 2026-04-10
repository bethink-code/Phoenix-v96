import { db } from "./db";
import { eq, and, desc, sql } from "drizzle-orm";
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

  async setTenantRegime(tenantId: string, toRegime: Regime, userId: string) {
    const [tenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.id, tenantId));
    if (!tenant) throw new Error("tenant not found");
    const fromRegime = tenant.activeRegime;
    await db
      .update(tenants)
      .set({ activeRegime: toRegime })
      .where(eq(tenants.id, tenantId));
    await db.insert(regimeChanges).values({
      tenantId,
      fromRegime,
      toRegime,
      changedByUserId: userId,
    });
    return { fromRegime, toRegime };
  },

  async setBotStatus(
    tenantId: string,
    status: "off" | "active" | "paused" | "halted" | "error",
    reason?: string
  ) {
    await db
      .update(tenants)
      .set({
        botStatus: status,
        lastHaltedAt:
          status === "halted" || status === "error" ? new Date() : undefined,
        lastHaltReason: reason,
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
