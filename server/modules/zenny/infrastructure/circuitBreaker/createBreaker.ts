// createBreaker — initialise a closed circuit breaker. Pure constructor.

import type { BreakerState } from "./types";

export interface CreateBreakerInput {
  failureThreshold: number; // typically 5
  openDurationMs: number; // typically 30_000
  halfOpenAttemptBudget: number; // typically 1
}

export function createBreaker(input: CreateBreakerInput): BreakerState {
  return {
    status: "closed",
    consecutiveFailures: 0,
    failureThreshold: input.failureThreshold,
    openedAtMs: null,
    openDurationMs: input.openDurationMs,
    halfOpenAttemptsRemaining: 0,
    halfOpenAttemptBudget: input.halfOpenAttemptBudget,
  };
}
