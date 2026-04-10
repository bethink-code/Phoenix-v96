import type { Express, Request, Response } from "express";
import { z } from "zod";
import { storage } from "./storage";
import { isAuthenticated, isAdmin } from "./auth";
import { audit } from "./auditLog";
import {
  insertAccessRequestSchema,
  insertInviteSchema,
  insertMarketPairSchema,
  regimeChangeSchema,
} from "../shared/schema";
import { emergencyMarketExit } from "./modules/emergencyExit";
import { getRegimeProfile } from "./modules/regimeEngine";
import { getBinance } from "./modules/exchange/binance";

function getUser(req: Request) {
  return req.user as { id: string; email: string; isAdmin: boolean };
}

function getIp(req: Request): string {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string") return xff.split(",")[0].trim();
  if (Array.isArray(xff) && xff.length) return xff[0];
  return req.ip || "unknown";
}

function pid(req: Request, key: string): string {
  const v = (req.params as Record<string, string | string[]>)[key];
  return Array.isArray(v) ? v[0] : v;
}

export function registerRoutes(app: Express) {
  // ---------- Auth / current user ----------
  app.get("/api/auth/user", isAuthenticated, async (req, res) => {
    const u = getUser(req);
    const full = await storage.getUserById(u.id);
    res.json(full ?? null);
  });

  app.post("/api/user/accept-terms", isAuthenticated, async (req, res) => {
    const u = getUser(req);
    await storage.acceptTerms(u.id);
    audit({
      userId: u.id,
      action: "accept_terms",
      outcome: "success",
      ipAddress: getIp(req),
    });
    res.json({ ok: true });
  });

  // ---------- Public access request ----------
  app.post("/api/request-access", async (req, res) => {
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
      ipAddress: getIp(req),
    });
    res.json({ ok: true });
  });

  // ---------- Tenant self-service ----------
  app.get("/api/tenant", isAuthenticated, async (req, res) => {
    const u = getUser(req);
    const tenant = await storage.getOrCreateTenantForUser(u.id);
    const config = await storage.getTenantConfig(tenant.id);
    res.json({ tenant, config });
  });

  app.get("/api/tenant/trades", isAuthenticated, async (req, res) => {
    const u = getUser(req);
    const tenant = await storage.getOrCreateTenantForUser(u.id);
    const rows = await storage.listTrades(tenant.id);
    res.json(rows);
  });

  app.get("/api/tenant/regime-history", isAuthenticated, async (req, res) => {
    const u = getUser(req);
    const tenant = await storage.getOrCreateTenantForUser(u.id);
    const rows = await storage.listRegimeChanges(tenant.id);
    res.json(rows);
  });

  app.post("/api/tenant/regime", isAuthenticated, async (req, res) => {
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
      ipAddress: getIp(req),
    });
    const profile = getRegimeProfile(toRegime);
    res.json({ ok: true, fromRegime, toRegime, profile });
  });

  app.get("/api/tenant/decisions", isAuthenticated, async (req, res) => {
    const u = getUser(req);
    const tenant = await storage.getOrCreateTenantForUser(u.id);
    res.json(await storage.listBotDecisions(tenant.id));
  });

  app.get("/api/tenant/costs", isAuthenticated, async (req, res) => {
    const u = getUser(req);
    const tenant = await storage.getOrCreateTenantForUser(u.id);
    res.json(await storage.getTenantCosts(tenant.id));
  });

  app.patch("/api/tenant/config", isAuthenticated, async (req, res) => {
    const schema = z.object({
      paperStartingCapital: z.string().optional(),
      riskPercentPerTrade: z.string().optional(),
      maxConcurrentPositions: z.number().int().min(1).max(10).optional(),
      dailyDrawdownLimitPct: z.string().optional(),
      weeklyDrawdownLimitPct: z.string().optional(),
      minRiskRewardRatio: z.string().optional(),
      minLevelRank: z.number().int().min(1).max(5).optional(),
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
      ipAddress: getIp(req),
    });
    res.json({ ok: true });
  });

  app.patch("/api/tenant/pair", isAuthenticated, async (req, res) => {
    const { pairId } = z.object({ pairId: z.string().uuid().nullable() }).parse(req.body);
    const u = getUser(req);
    const tenant = await storage.getOrCreateTenantForUser(u.id);
    await storage.setActivePair(tenant.id, pairId);
    audit({
      userId: u.id,
      tenantId: tenant.id,
      action: "set_active_pair",
      outcome: "success",
      detail: { pairId },
      ipAddress: getIp(req),
    });
    res.json({ ok: true });
  });

  app.patch("/api/tenant/autopilot", isAuthenticated, async (req, res) => {
    const { autopilot } = z.object({ autopilot: z.boolean() }).parse(req.body);
    const u = getUser(req);
    const tenant = await storage.getOrCreateTenantForUser(u.id);
    await storage.setAutopilot(tenant.id, autopilot);
    audit({
      userId: u.id,
      tenantId: tenant.id,
      action: "set_autopilot_regime",
      outcome: "success",
      detail: { autopilot },
      ipAddress: getIp(req),
    });
    res.json({ ok: true });
  });

  app.patch("/api/tenant/bot-status", isAuthenticated, async (req, res) => {
    const { status } = z
      .object({ status: z.enum(["off", "active", "paused"]) })
      .parse(req.body);
    const u = getUser(req);
    const tenant = await storage.getOrCreateTenantForUser(u.id);
    // PRD §3.2 — switching ON requires a conscious regime decision. If the
    // user has autopilot on, the bot will pick one on its first tick, so
    // we let it start from NO TRADE. If autopilot is off, they must pick.
    if (
      status === "active" &&
      tenant.activeRegime === "no_trade" &&
      !tenant.autopilotRegime
    ) {
      return res.status(400).json({ error: "regime_required" });
    }
    await storage.setBotStatus(tenant.id, status);
    audit({
      userId: u.id,
      tenantId: tenant.id,
      action: "set_bot_status",
      outcome: "success",
      detail: { status },
      ipAddress: getIp(req),
    });
    res.json({ ok: true });
  });

  app.get("/api/tenant/exchange-keys", isAuthenticated, async (req, res) => {
    const u = getUser(req);
    const tenant = await storage.getOrCreateTenantForUser(u.id);
    res.json(await storage.listExchangeKeyMetadata(tenant.id));
  });

  app.post("/api/tenant/exchange-keys", isAuthenticated, async (req, res) => {
    const schema = z.object({
      exchange: z.enum(["binance", "bybit"]),
      apiKey: z.string().min(10).max(256),
      apiSecret: z.string().min(10).max(256),
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
      ipAddress: getIp(req),
    });
    res.json({ ok: true });
  });

  app.post("/api/tenant/emergency-exit", isAuthenticated, async (req, res) => {
    const u = getUser(req);
    const tenant = await storage.getOrCreateTenantForUser(u.id);
    const result = await emergencyMarketExit(tenant.id, u.id);
    audit({
      userId: u.id,
      tenantId: tenant.id,
      action: "emergency_exit",
      outcome: "success",
      detail: result,
      ipAddress: getIp(req),
    });
    res.json(result);
  });

  // ---------- Market registry (public to tenants, mutations admin) ----------
  app.get("/api/markets", isAuthenticated, async (_req, res) => {
    res.json(await storage.listEnabledPairs());
  });

  // ---------- Admin: users ----------
  app.get("/api/admin/users", isAuthenticated, isAdmin, async (_req, res) => {
    res.json(await storage.listUsers());
  });

  app.patch(
    "/api/admin/users/:id/admin",
    isAuthenticated,
    isAdmin,
    async (req, res) => {
      const { isAdmin: flag } = z
        .object({ isAdmin: z.boolean() })
        .parse(req.body);
      await storage.setAdmin(pid(req, "id"), flag);
      audit({
        userId: getUser(req).id,
        action: "set_admin",
        resourceType: "user",
        resourceId: pid(req, "id"),
        outcome: "success",
        detail: { isAdmin: flag },
        ipAddress: getIp(req),
      });
      res.json({ ok: true });
    }
  );

  app.patch(
    "/api/admin/users/:id/suspended",
    isAuthenticated,
    isAdmin,
    async (req, res) => {
      const { isSuspended } = z
        .object({ isSuspended: z.boolean() })
        .parse(req.body);
      await storage.setSuspended(pid(req, "id"), isSuspended);
      audit({
        userId: getUser(req).id,
        action: "set_suspended",
        resourceType: "user",
        resourceId: pid(req, "id"),
        outcome: "success",
        detail: { isSuspended },
        ipAddress: getIp(req),
      });
      res.json({ ok: true });
    }
  );

  // ---------- Admin: invites ----------
  app.get("/api/admin/invites", isAuthenticated, isAdmin, async (_req, res) => {
    res.json(await storage.listInvites());
  });

  app.post("/api/admin/invites", isAuthenticated, isAdmin, async (req, res) => {
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
      ipAddress: getIp(req),
    });
    res.json(row);
  });

  app.delete(
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
        ipAddress: getIp(req),
      });
      res.json({ ok: true });
    }
  );

  // ---------- Admin: access requests ----------
  app.get(
    "/api/admin/access-requests",
    isAuthenticated,
    isAdmin,
    async (_req, res) => {
      res.json(await storage.listAccessRequests());
    }
  );

  app.patch(
    "/api/admin/access-requests/:id",
    isAuthenticated,
    isAdmin,
    async (req, res) => {
      const { status } = z
        .object({ status: z.enum(["approved", "declined"]) })
        .parse(req.body);
      await storage.decideAccessRequest(pid(req, "id"), status, getUser(req).id);
      audit({
        userId: getUser(req).id,
        action: "decide_access_request",
        resourceType: "access_request",
        resourceId: pid(req, "id"),
        outcome: "success",
        detail: { status },
        ipAddress: getIp(req),
      });
      res.json({ ok: true });
    }
  );

  // ---------- Admin: audit logs + security ----------
  app.get(
    "/api/admin/audit-logs",
    isAuthenticated,
    isAdmin,
    async (_req, res) => {
      res.json(await storage.listAuditLogs(500));
    }
  );

  app.get(
    "/api/admin/security-overview",
    isAuthenticated,
    isAdmin,
    async (_req, res) => {
      res.json(await storage.securityOverview());
    }
  );

  // ---------- Admin: market registry ----------
  app.get("/api/admin/pairs", isAuthenticated, isAdmin, async (_req, res) => {
    res.json(await storage.listAllPairs());
  });

  app.post("/api/admin/pairs", isAuthenticated, isAdmin, async (req, res) => {
    const parsed = insertMarketPairSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "invalid" });
    const row = await storage.createPair({
      ...parsed.data,
      addedByUserId: getUser(req).id,
    });
    audit({
      userId: getUser(req).id,
      action: "create_pair",
      resourceType: "market_pair",
      resourceId: row.id,
      outcome: "success",
      detail: parsed.data,
      ipAddress: getIp(req),
    });
    res.json(row);
  });

  app.patch("/api/admin/pairs/:id", isAuthenticated, isAdmin, async (req, res) => {
    await storage.updatePair(pid(req, "id"), req.body);
    audit({
      userId: getUser(req).id,
      action: "update_pair",
      resourceType: "market_pair",
      resourceId: pid(req, "id"),
      outcome: "success",
      ipAddress: getIp(req),
    });
    res.json({ ok: true });
  });

  app.get(
    "/api/admin/exchanges/binance/symbols",
    isAuthenticated,
    isAdmin,
    async (_req, res) => {
      try {
        const symbols = await getBinance().fetchSymbols();
        res.json(symbols);
      } catch (err) {
        res.status(502).json({ error: (err as Error).message });
      }
    }
  );

  app.delete("/api/admin/pairs/:id", isAuthenticated, isAdmin, async (req, res) => {
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
      ipAddress: getIp(req),
    });
    res.json({ ok: true });
  });
}
