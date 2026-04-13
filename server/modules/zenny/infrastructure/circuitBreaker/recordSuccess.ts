// recordSuccess — any success closes the breaker and zeroes the failure count.
// Pure state transition.

import type { BreakerState } from "./types";

export function recordSuccess(state: BreakerState): BreakerState {
  return {
    ...state,
    status: "closed",
    consecutiveFailures: 0,
    openedAtMs: null,
    halfOpenAttemptsRemaining: 0,
  };
}
