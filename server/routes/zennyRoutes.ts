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
}
