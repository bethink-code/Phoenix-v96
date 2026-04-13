import { describe, it, expect } from "vitest";
import {
  createBreaker,
  advanceBreaker,
  canRequest,
  recordSuccess,
  recordFailure,
} from "./breakerState";

describe("breakerState", () => {
  const config = {
    failureThreshold: 5,
    openDurationMs: 30_000,
    halfOpenAttemptBudget: 1,
  };

  describe("createBreaker", () => {
    it("starts closed with zero failures", () => {
      const state = createBreaker(config);
      expect(state.status).toBe("closed");
      expect(state.consecutiveFailures).toBe(0);
      expect(canRequest(state)).toBe(true);
    });
  });

  describe("recordFailure", () => {
    it("accumulates failures while below threshold", () => {
      let state = createBreaker(config);
      for (let i = 0; i < 4; i++) {
        state = recordFailure(state, i * 1000);
      }
      expect(state.status).toBe("closed");
      expect(state.consecutiveFailures).toBe(4);
      expect(canRequest(state)).toBe(true);
    });

    it("opens at exact threshold (boundary)", () => {
      let state = createBreaker(config);
      for (let i = 0; i < 5; i++) {
        state = recordFailure(state, i * 1000);
      }
      expect(state.status).toBe("open");
      expect(state.consecutiveFailures).toBe(5);
      expect(canRequest(state)).toBe(false);
    });

    it("denies requests when open", () => {
      let state = createBreaker(config);
      for (let i = 0; i < 5; i++) state = recordFailure(state, 0);
      expect(canRequest(state)).toBe(false);
    });
  });

  describe("advanceBreaker", () => {
    it("transitions open → half_open after timeout", () => {
      let state = createBreaker(config);
      for (let i = 0; i < 5; i++) state = recordFailure(state, 0);
      const advanced = advanceBreaker(state, 30_000);
      expect(advanced.status).toBe("half_open");
      expect(advanced.halfOpenAttemptsRemaining).toBe(1);
      expect(canRequest(advanced)).toBe(true);
    });

    it("does not transition before timeout", () => {
      let state = createBreaker(config);
      for (let i = 0; i < 5; i++) state = recordFailure(state, 0);
      const advanced = advanceBreaker(state, 29_999);
      expect(advanced.status).toBe("open");
    });

    it("is a no-op on closed state", () => {
      const state = createBreaker(config);
      const advanced = advanceBreaker(state, 1_000_000);
      expect(advanced).toEqual(state);
    });
  });

  describe("recordSuccess", () => {
    it("resets to closed from any state", () => {
      let state = createBreaker(config);
      for (let i = 0; i < 5; i++) state = recordFailure(state, 0);
      state = advanceBreaker(state, 30_000); // half_open
      const resolved = recordSuccess(state);
      expect(resolved.status).toBe("closed");
      expect(resolved.consecutiveFailures).toBe(0);
    });

    it("resets failure count even from closed-with-failures", () => {
      let state = createBreaker(config);
      state = recordFailure(state, 0);
      state = recordFailure(state, 0);
      const resolved = recordSuccess(state);
      expect(resolved.consecutiveFailures).toBe(0);
    });
  });

  describe("half_open behaviour", () => {
    it("a failure in half_open immediately re-opens", () => {
      let state = createBreaker(config);
      for (let i = 0; i < 5; i++) state = recordFailure(state, 0);
      state = advanceBreaker(state, 30_000); // half_open
      const reopened = recordFailure(state, 31_000);
      expect(reopened.status).toBe("open");
      expect(reopened.openedAtMs).toBe(31_000);
      expect(canRequest(reopened)).toBe(false);
    });

    it("consumes attempt budget", () => {
      let state = createBreaker({ ...config, halfOpenAttemptBudget: 2 });
      for (let i = 0; i < 5; i++) state = recordFailure(state, 0);
      state = advanceBreaker(state, 30_000);
      expect(state.halfOpenAttemptsRemaining).toBe(2);
      expect(canRequest(state)).toBe(true);
    });
  });
});
