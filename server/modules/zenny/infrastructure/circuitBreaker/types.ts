// Circuit breaker — shared types.

export type BreakerStatus = "closed" | "open" | "half_open";

export interface BreakerState {
  status: BreakerStatus;
  consecutiveFailures: number;
  failureThreshold: number;
  openedAtMs: number | null;
  openDurationMs: number;
  halfOpenAttemptsRemaining: number;
  halfOpenAttemptBudget: number;
}
