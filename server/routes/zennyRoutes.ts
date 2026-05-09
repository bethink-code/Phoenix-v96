// Zenny route module.
// Registers /api/zenny/* endpoints alongside the main routes.ts entry point.
// Per CLAUDE.md, routes are split by domain — this is the Zenny domain.

import type { Express, Request, Response } from "express";
import { isAuthenticated } from "../auth";
import { BinanceProvider } from "../modules/zenny/infrastructure/providers/binanceProvider";
import { DEFAULT_INFRASTRUCTURE_CONFIG } from "../modules/zenny/infrastructure/types";
import { runAnalysis } from "../modules/zenny/analysis/orchestrator";
import { fetchRecentLiquidations } from "../modules/zenny/analysis/data/fetchRecentLiquidations";
import type { PassConfig } from "../modules/zenny/analysis/passes/types";
import type { Timeframe } from "../../shared/zennyTypes";
import { getDefaultBraidCountForTimeframe } from "../../shared/zennyBraidDefaults";
import { runPaperTradeTick } from "../modules/zenny/runner/runPaperTradeTick";
import {
  listPositions,
  loadAccount,
} from "../modules/zenny/persistence/paperTradeStore";

// Pairs to tick on each cron run. Keep small in v0; extend later.
const PAPER_TRADE_WATCHLIST: Array<{ symbol: string; timeframe: Timeframe }> = [
  { symbol: "BTCUSDT", timeframe: "15m" },
];

// Single shared provider per process (Observer pattern — multi-tenant friendly).
// In Phase 6 this becomes per-symbol via createMarketDataService.
let sharedProvider: BinanceProvider | null = null;
function getProvider(): BinanceProvider {
  if (!sharedProvider) {
    sharedProvider = new BinanceProvider(DEFAULT_INFRASTRUCTURE_CONFIG);
  }
  return sharedProvider;
}

const VALID_TIMEFRAMES: ReadonlySet<Timeframe> = new Set([
  "15m",
  "1H",
  "4H",
  "12H",
  "D",
  "W",
  "M",
]);

export function registerZennyRoutes(app: Express) {
  // GET /api/zenny/braid-view-model?symbol=BTCUSDT&timeframe=1H&count=300
  // Runs the analysis pipeline and returns the AnalysisState as JSON.
  // Phase 1: Daily-only, no multi-TF confluence, no death detection.
  app.get(
    "/api/zenny/braid-view-model",
    isAuthenticated,
    async (req: Request, res: Response) => {
      try {
        const symbol = String(req.query.symbol || "BTCUSDT").toUpperCase();
        const timeframe = String(req.query.timeframe || "1H") as Timeframe;
        const defaultCount = VALID_TIMEFRAMES.has(timeframe)
          ? getDefaultBraidCountForTimeframe(timeframe)
          : getDefaultBraidCountForTimeframe("1H");
        const count = Math.min(
          1500,
          Math.max(
            50,
            parseInt(String(req.query.count || defaultCount), 10) ||
              defaultCount,
          ),
        );

        if (!VALID_TIMEFRAMES.has(timeframe)) {
          return res.status(400).json({
            error: "invalid_timeframe",
            allowed: Array.from(VALID_TIMEFRAMES),
          });
        }

        // passConfig is optional, JSON-encoded in the query string. Frontend
        // builds the config object and stringifies it. Absent or invalid
        // → orchestrator falls back to DEFAULT_PASS_CONFIG.
        let passConfig: PassConfig | undefined;
        if (typeof req.query.passConfig === "string") {
          try {
            passConfig = JSON.parse(req.query.passConfig) as PassConfig;
          } catch {
            // Silently fall back to default; bad config shouldn't 500.
          }
        }

        const provider = getProvider();
        // Fetch recent liquidations alongside analysis so the regime
        // layer's liquidationProximity input can light up. Failure here
        // shouldn't fail the whole analysis — the regime input will just
        // mark itself unavailable if events don't show up.
        let liquidations: Array<{ price: number; usdValue: number }> = [];
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
          liquidations,
        });

        res.json(state);
      } catch (err) {
        console.error("[zenny] braid-view-model failed", err);
        res.status(500).json({
          error: "analysis_failed",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    },
  );

  // GET /api/zenny/health — quick connectivity check for the infrastructure layer
  app.get(
    "/api/zenny/health",
    isAuthenticated,
    async (_req: Request, res: Response) => {
      const provider = getProvider();
      res.json({
        ok: true,
        provider: provider.name,
        rateLimiter: provider.getRateLimiterState(),
        breaker: provider.getBreakerState(),
        recentApiCalls: provider.getApiCallLog().slice(-20),
      });
    },
  );

  // POST /api/zenny/paper-trade-tick — Vercel Cron entrypoint.
  //
  // Auth: temporarily DISABLED (2026-05-08) so the GitHub Actions cron can
  // hit it during the weekend paper-trading run. The CRON_SECRET in Vercel
  // env doesn't match the Doppler-prd value and we ran out of time to
  // diagnose. Re-enable Monday — see TODO below.
  //
  // TODO(auth): restore Bearer CRON_SECRET check. Diagnose why
  //   `vercel env add CRON_SECRET` and dashboard-save both end up with a
  //   value that doesn't match what Doppler prd holds. Likely a Doppler-
  //   Vercel integration issue.
  //
  // Idempotent: hitting it twice in the same hour is safe (lookahead guard
  // in reduceStep skips already-evaluated bars).
  app.post(
    "/api/zenny/paper-trade-tick",
    async (_req: Request, res: Response) => {
      try {
        const provider = getProvider();
        const results = [];
        for (const watch of PAPER_TRADE_WATCHLIST) {
          try {
            const r = await runPaperTradeTick({
              provider,
              symbol: watch.symbol,
              timeframe: watch.timeframe,
            });
            results.push(r);
          } catch (e) {
            results.push({
              symbol: watch.symbol,
              timeframe: watch.timeframe,
              error: e instanceof Error ? e.message : String(e),
            });
          }
        }
        res.json({ ok: true, tickedAt: Date.now(), results });
      } catch (err) {
        console.error("[zenny] paper-trade-tick failed", err);
        res.status(500).json({
          error: "tick_failed",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    },
  );

  // GET /api/zenny/paper-trades — list paper-trading positions for review.
  // No auth in v0 — read-only, no PII; tighten when adding multi-tenant.
  app.get(
    "/api/zenny/paper-trades",
    async (req: Request, res: Response) => {
      try {
        const symbol = String(req.query.symbol || "BTCUSDT").toUpperCase();
        const timeframe = String(req.query.timeframe || "1H") as Timeframe;
        const limit = Math.min(
          500,
          Math.max(1, parseInt(String(req.query.limit || "100"), 10) || 100),
        );
        const [positions, account] = await Promise.all([
          listPositions(symbol, timeframe, limit),
          loadAccount(),
        ]);
        // Convenience PnL fields so callers don't have to compute.
        const pnlAbs = account.currentEquity - account.startingEquity;
        const pnlPct =
          account.startingEquity > 0
            ? (pnlAbs / account.startingEquity) * 100
            : 0;
        const closedPositions = positions.filter((p) => p.status === "CLOSED");
        const winners = closedPositions.filter(
          (p) => (p.realisedPnl ?? 0) > 0,
        ).length;
        const losers = closedPositions.filter(
          (p) => (p.realisedPnl ?? 0) < 0,
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
            winRate:
              closedPositions.length > 0
                ? winners / closedPositions.length
                : null,
          },
          positions,
        });
      } catch (err) {
        res.status(500).json({
          error: "fetch_failed",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    },
  );
}
