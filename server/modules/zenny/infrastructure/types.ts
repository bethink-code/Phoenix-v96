// Infrastructure module types — InfrastructureConfig, runtime types.

export interface InfrastructureConfig {
  // Rate limiting
  binanceWeightBudgetPerMinute: number; // 2400 (Binance futures hard limit)
  weightBudgetUtilizationCap: number; // 0.80 — soft cap as fraction of budget
  weightBudgetAlertThreshold: number; // 0.70

  // Circuit breaker
  circuitBreakerFailureThreshold: number; // 5
  circuitBreakerOpenDurationMs: number; // 30000
  circuitBreakerHalfOpenAttempts: number; // 1

  // Backoff
  backoffInitialDelayMs: number; // 1000
  backoffMaxDelayMs: number; // 30000
  backoffMultiplier: number; // 2
  backoffMaxAttempts: number; // 5

  // WebSocket (Phase 6+)
  wsHeartbeatIntervalMs: number; // 20000
  wsMaxStreamsPerConnection: number; // 1024
  wsConnectionMaxLifetimeMs: number; // 82800000 (23h)
  wsReconnectInitialDelayMs: number; // 1000

  // Cache TTLs
  candleCacheTtlLiveMs: number; // 60000 (1 min for active candle)
  depthSnapshotRefreshMs: number; // 300000 (5 min)
  fundingCacheTtlMs: number; // 28800000 (8 h)
  exchangeInfoCacheTtlMs: number; // 3600000 (1 h)

  // Endpoint weight map (values from Binance docs)
  endpointWeights: Record<string, number>;

  // Symbol watchlist
  watchedSymbols: string[];

  // Provider selection
  activeProvider: "binance" | "replay" | "mock";
}

export const DEFAULT_INFRASTRUCTURE_CONFIG: InfrastructureConfig = {
  binanceWeightBudgetPerMinute: 2400,
  weightBudgetUtilizationCap: 0.8,
  weightBudgetAlertThreshold: 0.7,

  circuitBreakerFailureThreshold: 5,
  circuitBreakerOpenDurationMs: 30_000,
  circuitBreakerHalfOpenAttempts: 1,

  backoffInitialDelayMs: 1_000,
  backoffMaxDelayMs: 30_000,
  backoffMultiplier: 2,
  backoffMaxAttempts: 5,

  wsHeartbeatIntervalMs: 20_000,
  wsMaxStreamsPerConnection: 1024,
  wsConnectionMaxLifetimeMs: 82_800_000,
  wsReconnectInitialDelayMs: 1_000,

  candleCacheTtlLiveMs: 60_000,
  depthSnapshotRefreshMs: 300_000,
  fundingCacheTtlMs: 28_800_000,
  exchangeInfoCacheTtlMs: 3_600_000,

  // Binance Futures REST weights (https://binance-docs.github.io/apidocs/futures/en/)
  endpointWeights: {
    "GET /fapi/v1/klines": 2, // limit <= 100 = 1, > 100 = 2
    "GET /fapi/v1/depth": 10, // limit 500 = 10
    "GET /fapi/v1/fundingRate": 1,
    "GET /fapi/v1/exchangeInfo": 1,
  },

  watchedSymbols: ["BTCUSDT"],

  activeProvider: "binance",
};

export interface ApiCallRecord {
  endpoint: string;
  method: string;
  weightCost: number;
  startMs: number;
  durationMs: number;
  success: boolean;
  responseCode: number | null;
  errorMessage: string | null;
}
