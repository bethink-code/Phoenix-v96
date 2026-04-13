// canRequest — gate function: should a request be permitted in current state?
// Pure boolean test.

import type { BreakerState } from "./types";

export function canRequest(state: BreakerState): boolean {
  if (state.status === "closed") return true;
  if (state.status === "open") return false;
  // half_open
  return state.halfOpenAttemptsRemaining > 0;
}
