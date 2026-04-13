import { describe, it, expect, vi } from "vitest";
import { makeRestRequest, type RestDeps } from "./makeRestRequest";
import { CircuitOpenError, RestRequestError } from "./restErrors";
import { createTokenBucket } from "../../rateLimiter/createTokenBucket";
import { createBreaker } from "../../circuitBreaker/createBreaker";

// ─── Test harness — fake deps the function depends on ─────────────────

function mkFakeDeps(overrides: Partial<RestDeps> = {}): RestDeps {
  return {
    fetchFn: vi.fn() as unknown as typeof fetch,
    nowMs: () => 1000,
    sleep: vi.fn(async () => {}),
    rateLimiter: {
      state: createTokenBucket({
        capacity: 2400,
        refillPerMinute: 2400,
        nowMs: 0,
      }),
    },
    breaker: {
      state: createBreaker({
        failureThreshold: 5,
        openDurationMs: 30_000,
        halfOpenAttemptBudget: 1,
      }),
    },
    ...overrides,
  };
}

function mkJsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

// ─── Tests ────────────────────────────────────────────────────────────

describe("makeRestRequest — happy path", () => {
  it("returns parsed JSON on 200", async () => {
    const deps = mkFakeDeps({
      fetchFn: vi
        .fn()
        .mockResolvedValue(mkJsonResponse({ result: "ok" })) as unknown as typeof fetch,
    });
    const result = await makeRestRequest(
      {
        url: "https://example.test/api",
        weightCost: 1,
        endpoint: "GET /test",
      },
      deps,
    );
    expect(result).toEqual({ result: "ok" });
  });

  it("calls fetch exactly once on success", async () => {
    const fetchFn = vi.fn().mockResolvedValue(mkJsonResponse({ ok: true }));
    const deps = mkFakeDeps({ fetchFn: fetchFn as unknown as typeof fetch });
    await makeRestRequest(
      { url: "x", weightCost: 1, endpoint: "GET /x" },
      deps,
    );
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("consumes weight from the rate limiter on success", async () => {
    const deps = mkFakeDeps({
      fetchFn: vi
        .fn()
        .mockResolvedValue(mkJsonResponse({})) as unknown as typeof fetch,
    });
    const tokensBefore = deps.rateLimiter.state.tokens;
    await makeRestRequest(
      { url: "x", weightCost: 10, endpoint: "GET /x" },
      deps,
    );
    expect(deps.rateLimiter.state.tokens).toBe(tokensBefore - 10);
  });

  it("logs the call via onApiCall", async () => {
    const onApiCall = vi.fn();
    const deps = mkFakeDeps({
      fetchFn: vi
        .fn()
        .mockResolvedValue(mkJsonResponse({})) as unknown as typeof fetch,
      onApiCall,
    });
    await makeRestRequest(
      { url: "x", weightCost: 2, endpoint: "GET /test" },
      deps,
    );
    expect(onApiCall).toHaveBeenCalledTimes(1);
    expect(onApiCall.mock.calls[0][0]).toMatchObject({
      endpoint: "GET /test",
      weightCost: 2,
      success: true,
      responseCode: 200,
    });
  });
});

describe("makeRestRequest — circuit breaker", () => {
  it("throws CircuitOpenError when breaker is open", async () => {
    const deps = mkFakeDeps();
    // Force the breaker open by recording 5 failures
    deps.breaker.state = {
      ...deps.breaker.state,
      status: "open",
      consecutiveFailures: 5,
      openedAtMs: 1000,
    };
    await expect(
      makeRestRequest(
        { url: "x", weightCost: 1, endpoint: "GET /x" },
        deps,
      ),
    ).rejects.toBeInstanceOf(CircuitOpenError);
  });

  it("does not call fetch when breaker is open", async () => {
    const fetchFn = vi.fn();
    const deps = mkFakeDeps({ fetchFn: fetchFn as unknown as typeof fetch });
    deps.breaker.state = {
      ...deps.breaker.state,
      status: "open",
      consecutiveFailures: 5,
      openedAtMs: 1000,
    };
    await makeRestRequest(
      { url: "x", weightCost: 1, endpoint: "GET /x" },
      deps,
    ).catch(() => {});
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe("makeRestRequest — retries and failures", () => {
  it("retries on 5xx and eventually returns success", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(mkJsonResponse({ error: "boom" }, 500))
      .mockResolvedValueOnce(mkJsonResponse({ result: "ok" }, 200));
    const deps = mkFakeDeps({
      fetchFn: fetchFn as unknown as typeof fetch,
      sleep: vi.fn(async () => {}), // don't actually wait
    });
    const result = await makeRestRequest(
      {
        url: "x",
        weightCost: 1,
        endpoint: "GET /x",
        backoffConfig: {
          initialDelayMs: 1,
          maxDelayMs: 1,
          multiplier: 1,
          maxAttempts: 5,
        },
      },
      deps,
    );
    expect(result).toEqual({ result: "ok" });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry on 400 (permanent client error)", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(mkJsonResponse({ error: "bad input" }, 400));
    const deps = mkFakeDeps({
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    await expect(
      makeRestRequest(
        { url: "x", weightCost: 1, endpoint: "GET /x" },
        deps,
      ),
    ).rejects.toBeInstanceOf(RestRequestError);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("retries on 429 (rate limit) and records failure", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(mkJsonResponse({ error: "too many" }, 429))
      .mockResolvedValueOnce(mkJsonResponse({ result: "ok" }, 200));
    const deps = mkFakeDeps({
      fetchFn: fetchFn as unknown as typeof fetch,
      sleep: vi.fn(async () => {}),
    });
    await makeRestRequest(
      {
        url: "x",
        weightCost: 1,
        endpoint: "GET /x",
        backoffConfig: {
          initialDelayMs: 1,
          maxDelayMs: 1,
          multiplier: 1,
          maxAttempts: 5,
        },
      },
      deps,
    );
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("eventually gives up after maxAttempts retries", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(mkJsonResponse({ error: "boom" }, 500));
    const deps = mkFakeDeps({
      fetchFn: fetchFn as unknown as typeof fetch,
      sleep: vi.fn(async () => {}),
    });
    await expect(
      makeRestRequest(
        {
          url: "x",
          weightCost: 1,
          endpoint: "GET /x",
          backoffConfig: {
            initialDelayMs: 1,
            maxDelayMs: 1,
            multiplier: 1,
            maxAttempts: 3,
          },
        },
        deps,
      ),
    ).rejects.toBeInstanceOf(RestRequestError);
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });
});

describe("makeRestRequest — rate limiter", () => {
  it("waits when not enough tokens, then proceeds once refilled", async () => {
    // Mutable virtual clock: sleep() advances it, so the rate limiter
    // "sees" time pass even though the test runs instantly.
    let now = 0;
    const sleep = vi.fn(async (ms: number) => {
      now += ms;
    });
    const fetchFn = vi.fn().mockResolvedValue(mkJsonResponse({}));

    const deps: RestDeps = {
      fetchFn: fetchFn as unknown as typeof fetch,
      nowMs: () => now,
      sleep,
      rateLimiter: {
        state: createTokenBucket({
          capacity: 100,
          refillPerMinute: 6000, // 100/sec
          initialTokens: 0, // empty
          nowMs: 0,
        }),
      },
      breaker: {
        state: createBreaker({
          failureThreshold: 5,
          openDurationMs: 30_000,
          halfOpenAttemptBudget: 1,
        }),
      },
    };

    await makeRestRequest(
      { url: "x", weightCost: 5, endpoint: "GET /x" },
      deps,
    );
    expect(sleep).toHaveBeenCalled();
    expect(fetchFn).toHaveBeenCalledTimes(1);
    // After the request, the cost should have been deducted
    expect(deps.rateLimiter.state.tokens).toBeLessThan(100);
  });
});
