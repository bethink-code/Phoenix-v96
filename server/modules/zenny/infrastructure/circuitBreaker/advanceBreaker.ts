// advanceBreaker — tick the breaker forward in time.
// Pure: handles open → half_open transitions when timeout elapses.

import type { BreakerState } from "./types";

export function advanceBreaker(state: BreakerState, nowMs: number): BreakerState {
  if (state.status === "open" && state.openedAtMs !== null) {
    const elapsed = nowMs - state.openedAtMs;
    if (elapsed >= state.openDurationMs) {
      return {
        ...state,
        status: "half_open",
        halfOpenAttemptsRemaining: state.halfOpenAttemptBudget,
      };
    }
  }
  return state;
}
