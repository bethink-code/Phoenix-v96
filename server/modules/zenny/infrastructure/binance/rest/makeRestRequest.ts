// Core REST request helper.
// Wraps every Binance REST call with: rate limit budget check, circuit breaker gate,
// exponential backoff retry. All dependencies are injected so the function is
// fully testable with a fake fetch + fake clock.

import type { TokenBucketState } from "../../rateLimiter/types";
import { tryConsume } from "../../rateLimiter/tryConsume";
import type { BreakerState } from "../../circuitBreaker/types";
import { advanceBreaker } from "../../circuitBreaker/advanceBreaker";
import { canRequest } from "../../circuitBreaker/canRequest";
import { recordFailure } from "../../circuitBreaker/recordFailure";
import { recordSuccess } from "../../circuitBreaker/recordSuccess";
import {
  type BackoffConfig,
  calculateBackoffDelay,
  shouldRetry,
  DEFAULT_BACKOFF_CONFIG,
} from "../../backoff/exponentialBackoff";
import type { ApiCallRecord } from "../../types";
import {
  RestRequestError,
  CircuitOpenError,
} from "./restErrors";

export interface RestDeps {
  fetchFn: typeof fetch;
  nowMs: () => number;
  sleep: (ms: number) => Promise<void>;
  // Mutable references that this function reads from and writes to.
  // The caller owns the state — this function is the only place that mutates them
  // for I/O calls, which is acceptable because it's the boundary layer.
  rateLimiter: { state: TokenBucketState };
  breaker: { state: BreakerState };
  onApiCall?: (record: ApiCallRecord) => void;
}

export interface RestRequestInput {
  url: string;
  method?: "GET" | "POST" | "DELETE" | "PUT";
  headers?: Record<string, string>;
  body?: string;
  weightCost: number;
  endpoint: string; // canonical endpoint name for logging (e.g. "GET /fapi/v1/klines")
  backoffConfig?: BackoffConfig;
}

// Error classes live in ./restErrors.ts — import them there if needed.
// Re-exported here for consumers that expect them alongside makeRestRequest.
export { RestRequestError, CircuitOpenError, WeightBudgetExceededError } from "./restErrors";

export async function makeRestRequest<T = unknown>(
  input: RestRequestInput,
  deps: RestDeps,
): Promise<T> {
  const backoffConfig = input.backoffConfig ?? DEFAULT_BACKOFF_CONFIG;
  let attempt = 0;
  let lastError: unknown;

  while (true) {
    attempt += 1;

    // Refresh circuit breaker state (open → half_open transition) before every attempt.
    deps.breaker.state = advanceBreaker(deps.breaker.state, deps.nowMs());

    if (!canRequest(deps.breaker.state)) {
      throw new CircuitOpenError(input.endpoint);
    }

    // Reserve weight (waits naturally between retries via the backoff loop)
    const reservation = tryConsume({
      state: deps.rateLimiter.state,
      cost: input.weightCost,
      nowMs: deps.nowMs(),
    });
    if (!reservation.granted) {
      // Wait for the rate limiter to recover, then retry the same attempt.
      await deps.sleep(reservation.msUntilAvailable);
      deps.rateLimiter.state = reservation.state;
      attempt -= 1; // not a real retry, just a wait
      continue;
    }
    deps.rateLimiter.state = reservation.state;

    const startMs = deps.nowMs();
    let success = false;
    let responseCode: number | null = null;
    let errorMessage: string | null = null;

    try {
      const response = await deps.fetchFn(input.url, {
        method: input.method ?? "GET",
        headers: input.headers,
        body: input.body,
      });
      responseCode = response.status;

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        // 429 / 418 → record failure, retry with backoff
        if (response.status === 429 || response.status === 418) {
          deps.breaker.state = recordFailure(deps.breaker.state, deps.nowMs());
          throw new RestRequestError(
            `Rate limited: ${response.status} ${text}`,
            input.endpoint,
            response.status,
          );
        }
        // 5xx → also retry
        if (response.status >= 500) {
          deps.breaker.state = recordFailure(deps.breaker.state, deps.nowMs());
          throw new RestRequestError(
            `Server error: ${response.status} ${text}`,
            input.endpoint,
            response.status,
          );
        }
        // 4xx other → permanent, do not retry
        throw new RestRequestError(
          `Client error: ${response.status} ${text}`,
          input.endpoint,
          response.status,
        );
      }

      const data = (await response.json()) as T;
      deps.breaker.state = recordSuccess(deps.breaker.state);
      success = true;
      return data;
    } catch (e) {
      lastError = e;
      errorMessage = e instanceof Error ? e.message : String(e);

      // Permanent client errors (4xx other than 429/418) — don't retry
      if (e instanceof RestRequestError && e.status !== null && e.status >= 400 && e.status < 500 && e.status !== 429 && e.status !== 418) {
        throw e;
      }

      if (!shouldRetry(attempt, backoffConfig)) {
        throw new RestRequestError(
          `Exhausted ${attempt} attempts: ${errorMessage}`,
          input.endpoint,
          responseCode,
          e,
        );
      }

      const delay = calculateBackoffDelay(attempt, backoffConfig);
      await deps.sleep(delay);
    } finally {
      const durationMs = deps.nowMs() - startMs;
      if (deps.onApiCall) {
        deps.onApiCall({
          endpoint: input.endpoint,
          method: input.method ?? "GET",
          weightCost: input.weightCost,
          startMs,
          durationMs,
          success,
          responseCode,
          errorMessage,
        });
      }
    }
  }
}
