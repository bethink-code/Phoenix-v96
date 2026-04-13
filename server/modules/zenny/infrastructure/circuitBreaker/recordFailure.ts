// recordFailure — increment consecutive failures, open at threshold,
// re-open immediately on a half_open failure. Pure state transition.

import type { BreakerState } from "./types";

export function recordFailure(state: BreakerState, nowMs: number): BreakerState {
  const failures = state.consecutiveFailures + 1;

  // Half-open failure → straight back to open
  if (state.status === "half_open") {
    return {
      ...state,
      status: "open",
      consecutiveFailures: failures,
      openedAtMs: nowMs,
      halfOpenAttemptsRemaining: 0,
    };
  }

  // Closed failures accumulate; open at threshold
  if (failures >= state.failureThreshold) {
    return {
      ...state,
      status: "open",
      consecutiveFailures: failures,
      openedAtMs: nowMs,
    };
  }

  return { ...state, consecutiveFailures: failures };
}
