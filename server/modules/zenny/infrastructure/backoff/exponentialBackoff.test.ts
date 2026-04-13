import { describe, it, expect } from "vitest";
import {
  calculateBackoffDelay,
  shouldRetry,
  DEFAULT_BACKOFF_CONFIG,
} from "./exponentialBackoff";

describe("exponentialBackoff", () => {
  describe("calculateBackoffDelay", () => {
    it("returns initialDelay on attempt 1", () => {
      expect(calculateBackoffDelay(1)).toBe(1_000);
    });

    it("doubles on each subsequent attempt", () => {
      expect(calculateBackoffDelay(1)).toBe(1_000);
      expect(calculateBackoffDelay(2)).toBe(2_000);
      expect(calculateBackoffDelay(3)).toBe(4_000);
      expect(calculateBackoffDelay(4)).toBe(8_000);
      expect(calculateBackoffDelay(5)).toBe(16_000);
    });

    it("caps at maxDelayMs", () => {
      expect(calculateBackoffDelay(6)).toBe(30_000); // would be 32_000, capped
      expect(calculateBackoffDelay(10)).toBe(30_000);
      expect(calculateBackoffDelay(100)).toBe(30_000);
    });

    it("returns 0 for attempt < 1", () => {
      expect(calculateBackoffDelay(0)).toBe(0);
      expect(calculateBackoffDelay(-1)).toBe(0);
    });

    it("respects custom config", () => {
      const cfg = {
        initialDelayMs: 500,
        maxDelayMs: 60_000,
        multiplier: 3,
        maxAttempts: 5,
      };
      expect(calculateBackoffDelay(1, cfg)).toBe(500);
      expect(calculateBackoffDelay(2, cfg)).toBe(1_500);
      expect(calculateBackoffDelay(3, cfg)).toBe(4_500);
      expect(calculateBackoffDelay(4, cfg)).toBe(13_500);
      expect(calculateBackoffDelay(5, cfg)).toBe(40_500);
      expect(calculateBackoffDelay(6, cfg)).toBe(60_000); // capped
    });
  });

  describe("shouldRetry", () => {
    it("returns true while attempts remain", () => {
      expect(shouldRetry(1)).toBe(true);
      expect(shouldRetry(4)).toBe(true);
    });

    it("returns false at maxAttempts", () => {
      expect(shouldRetry(5)).toBe(false);
      expect(shouldRetry(6)).toBe(false);
    });

    it("returns true forever when maxAttempts is 0", () => {
      const cfg = { ...DEFAULT_BACKOFF_CONFIG, maxAttempts: 0 };
      expect(shouldRetry(100, cfg)).toBe(true);
    });
  });
});
