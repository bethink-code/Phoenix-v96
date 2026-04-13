// describeBreaker — human-readable status string for telemetry / Panel 6.
// Pure formatter.

import type { BreakerState } from "./types";

export function describeBreaker(state: BreakerState): string {
  if (state.status === "closed") {
    return `closed (${state.consecutiveFailures}/${state.failureThreshold} failures)`;
  }
  if (state.status === "open") {
    return `open (${state.consecutiveFailures} failures)`;
  }
  return `half_open (${state.halfOpenAttemptsRemaining}/${state.halfOpenAttemptBudget} attempts)`;
}
