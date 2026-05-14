import type { Express, Request } from "express";
import { z } from "zod";
import { storage } from "./storage";
import { isAuthenticated, isAdmin } from "./auth";
import { audit } from "./auditLog";
import {
  insertAccessRequestSchema,
  insertInviteSchema,
  insertMarketPairSchema,
} from "../shared/schema";
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

  app.post("/api/request-access", async (req, res) => {
    const parsed = insertAccessRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "invalid", issues: parsed.error.issues });
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
    },
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
    },
  );

  app.get(
    "/api/admin/invites",
    isAuthenticated,
    isAdmin,
    async (_req, res) => {
      res.json(await storage.listInvites());
    },
  );

  app.post(
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
        ipAddress: getIp(req),
      });
      res.json(row);
    },
  );

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
    },
  );

  app.get(
    "/api/admin/access-requests",
    isAuthenticated,
    isAdmin,
    async (_req, res) => {
      res.json(await storage.listAccessRequests());
    },
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
    },
  );

  app.get(
    "/api/admin/audit-logs",
    isAuthenticated,
    isAdmin,
    async (_req, res) => {
      res.json(await storage.listAuditLogs(500));
    },
  );

  app.get(
    "/api/admin/security-overview",
    isAuthenticated,
    isAdmin,
    async (_req, res) => {
      res.json(await storage.securityOverview());
    },
  );

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

  app.patch(
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
        ipAddress: getIp(req),
      });
      res.json({ ok: true });
    },
  );

  app.get(
    "/api/admin/exchanges/binance/symbols",
    isAuthenticated,
    isAdmin,
    async (req, res) => {
      const quote =
        typeof req.query.quote === "string"
          ? req.query.quote.toUpperCase()
          : null;
      const filter = (rows: Array<{ quoteAsset: string }>) =>
        quote ? rows.filter((s) => s.quoteAsset === quote) : rows;

      const cached = await storage.getCachedSymbols("binance");
      if (cached) {
        return res.json({
          symbols: filter(cached.symbols as Array<{ quoteAsset: string }>),
          refreshedAt: cached.refreshedAt,
        });
      }

      try {
        const symbols = await getBinance().fetchSymbols();
        await storage.writeCachedSymbols("binance", symbols);
        res.json({ symbols: filter(symbols), refreshedAt: new Date() });
      } catch (err) {
        res.status(502).json({ error: (err as Error).message });
      }
    },
  );

  app.delete(
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
        ipAddress: getIp(req),
      });
      res.json({ ok: true });
    },
  );
}
