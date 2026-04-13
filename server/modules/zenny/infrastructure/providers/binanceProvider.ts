// BinanceProvider — real MarketDataProvider implementation.
// Wires together: REST client (with rate limiter / circuit breaker / backoff),
// candle cache, and any future stream / depth / funding integrations.
//
// Cache strategy: try cache first; on miss, fetch from Binance REST and write back.

import type { Candle, Timeframe } from "../../../../../shared/zennyTypes";
import type { MarketDataProvider, CandleQuery } from "./providerInterface";
import { CandleCache } from "../cache/candleCache";
import { fetchKlinesRest } from "../binance/rest/fetchKlinesRest";
import {
  createTokenBucket,
  type TokenBucketState,
} from "../rateLimiter/tokenBucket";
import {
  createBreaker,
  type BreakerState,
} from "../circuitBreaker/breakerState";
import type {
  ApiCallRecord,
  InfrastructureConfig,
} from "../types";
import type { RestDeps } from "../binance/rest/makeRestRequest";

export class BinanceProvider implements MarketDataProvider {
  readonly name = "binance" as const;
  private cache: CandleCache;
  private rateLimiter: { state: TokenBucketState };
  private breaker: { state: BreakerState };
  private restDeps: RestDeps;
  private apiCallLog: ApiCallRecord[] = [];

  constructor(config: InfrastructureConfig) {
    this.cache = new CandleCache();
    this.rateLimiter = {
      state: createTokenBucket({
        capacity: Math.floor(
          config.binanceWeightBudgetPerMinute * config.weightBudgetUtilizationCap,
        ),
        refillPerMinute: Math.floor(
          config.binanceWeightBudgetPerMinute * config.weightBudgetUtilizationCap,
        ),
        nowMs: Date.now(),
      }),
    };
    this.breaker = {
      state: createBreaker({
        failureThreshold: config.circuitBreakerFailureThreshold,
        openDurationMs: config.circuitBreakerOpenDurationMs,
        halfOpenAttemptBudget: config.circuitBreakerHalfOpenAttempts,
      }),
    };
    this.restDeps = {
      fetchFn: globalThis.fetch.bind(globalThis),
      nowMs: () => Date.now(),
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
      rateLimiter: this.rateLimiter,
      breaker: this.breaker,
      onApiCall: (rec) => {
        this.apiCallLog.push(rec);
        // Cap log at last 1000 entries to bound memory
        if (this.apiCallLog.length > 1000) {
          this.apiCallLog.splice(0, this.apiCallLog.length - 1000);
        }
      },
    };
  }

  async getCandles(query: CandleQuery): Promise<Candle[]> {
    // Try cache first
    const cached = this.cache.read(query.symbol, query.timeframe, query.count);
    if (cached !== null) return cached;

    // Cache miss — fetch from Binance
    const fresh = await fetchKlinesRest(
      {
        symbol: query.symbol,
        timeframe: query.timeframe,
        limit: query.count,
        endTimeMs: query.endTimeMs,
      },
      this.restDeps,
    );
    this.cache.write(query.symbol, query.timeframe, fresh);
    return fresh;
  }

  // Diagnostics for Panel 6
  getApiCallLog(): ReadonlyArray<ApiCallRecord> {
    return this.apiCallLog;
  }
  getRateLimiterState(): Readonly<TokenBucketState> {
    return this.rateLimiter.state;
  }
  getBreakerState(): Readonly<BreakerState> {
    return this.breaker.state;
  }
}
