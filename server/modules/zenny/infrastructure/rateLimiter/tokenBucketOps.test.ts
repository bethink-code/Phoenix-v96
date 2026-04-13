import { describe, it, expect } from "vitest";
import { createTokenBucket } from "./createTokenBucket";
import { advance } from "./advance";
import { tryConsume } from "./tryConsume";

describe("tokenBucket", () => {
  describe("createTokenBucket", () => {
    it("starts full when no initialTokens provided", () => {
      const state = createTokenBucket({
        capacity: 2400,
        refillPerMinute: 2400,
        nowMs: 1000,
      });
      expect(state.capacity).toBe(2400);
      expect(state.tokens).toBe(2400);
      expect(state.lastRefillMs).toBe(1000);
    });

    it("respects initialTokens override", () => {
      const state = createTokenBucket({
        capacity: 2400,
        refillPerMinute: 2400,
        initialTokens: 100,
        nowMs: 0,
      });
      expect(state.tokens).toBe(100);
    });

    it("computes refillPerMs correctly", () => {
      const state = createTokenBucket({
        capacity: 2400,
        refillPerMinute: 2400,
        nowMs: 0,
      });
      // 2400 per minute = 40 per second = 0.04 per ms
      expect(state.refillPerMs).toBeCloseTo(0.04);
    });
  });

  describe("advance", () => {
    it("refills tokens proportionally to elapsed time", () => {
      const state = createTokenBucket({
        capacity: 2400,
        refillPerMinute: 2400,
        initialTokens: 0,
        nowMs: 0,
      });
      const after1Sec = advance({ state, nowMs: 1000 });
      // 0.04 tokens/ms × 1000 ms = 40 tokens
      expect(after1Sec.tokens).toBeCloseTo(40);
    });

    it("caps at capacity even with long elapsed time", () => {
      const state = createTokenBucket({
        capacity: 100,
        refillPerMinute: 600,
        initialTokens: 50,
        nowMs: 0,
      });
      // 600/min over 1 hour = 36000 tokens of refill, but cap is 100
      const after1Hour = advance({ state, nowMs: 3_600_000 });
      expect(after1Hour.tokens).toBe(100);
    });

    it("does not refill on zero elapsed time", () => {
      const state = createTokenBucket({
        capacity: 100,
        refillPerMinute: 600,
        initialTokens: 50,
        nowMs: 1000,
      });
      const same = advance({ state, nowMs: 1000 });
      expect(same.tokens).toBeCloseTo(50);
    });

    it("treats negative elapsed time as zero (clock skew protection)", () => {
      const state = createTokenBucket({
        capacity: 100,
        refillPerMinute: 600,
        initialTokens: 50,
        nowMs: 1000,
      });
      const earlier = advance({ state, nowMs: 500 });
      expect(earlier.tokens).toBeCloseTo(50);
    });
  });

  describe("tryConsume", () => {
    it("grants when tokens available", () => {
      const state = createTokenBucket({
        capacity: 100,
        refillPerMinute: 600,
        nowMs: 0,
      });
      const result = tryConsume({ state, cost: 10, nowMs: 0 });
      expect(result.granted).toBe(true);
      expect(result.state.tokens).toBeCloseTo(90);
      expect(result.shortfall).toBe(0);
      expect(result.msUntilAvailable).toBe(0);
    });

    it("denies when not enough tokens", () => {
      const state = createTokenBucket({
        capacity: 100,
        refillPerMinute: 600,
        initialTokens: 5,
        nowMs: 0,
      });
      const result = tryConsume({ state, cost: 10, nowMs: 0 });
      expect(result.granted).toBe(false);
      expect(result.state.tokens).toBeCloseTo(5);
      expect(result.shortfall).toBeCloseTo(5);
      expect(result.msUntilAvailable).toBeGreaterThan(0);
    });

    it("estimates correct wait time when denied", () => {
      const state = createTokenBucket({
        capacity: 100,
        refillPerMinute: 600,
        initialTokens: 0,
        nowMs: 0,
      });
      // 0.01 tokens/ms refill, need 10 tokens, should be ~1000 ms
      const result = tryConsume({ state, cost: 10, nowMs: 0 });
      expect(result.granted).toBe(false);
      expect(result.msUntilAvailable).toBeGreaterThanOrEqual(999);
      expect(result.msUntilAvailable).toBeLessThanOrEqual(1001);
    });

    it("applies refill before checking on tryConsume", () => {
      const state = createTokenBucket({
        capacity: 100,
        refillPerMinute: 600,
        initialTokens: 0,
        nowMs: 0,
      });
      // Wait 5 seconds → 5 × 10 = 50 tokens
      const result = tryConsume({ state, cost: 30, nowMs: 5000 });
      expect(result.granted).toBe(true);
      expect(result.state.tokens).toBeCloseTo(20);
    });

    it("boundary: cost exactly equals tokens", () => {
      const state = createTokenBucket({
        capacity: 100,
        refillPerMinute: 600,
        initialTokens: 10,
        nowMs: 0,
      });
      const result = tryConsume({ state, cost: 10, nowMs: 0 });
      expect(result.granted).toBe(true);
      expect(result.state.tokens).toBeCloseTo(0);
    });
  });
});
