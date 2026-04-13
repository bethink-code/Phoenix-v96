// advance — refill a token bucket based on elapsed time.
// Pure: takes state in, returns new state. No clock dependency
// — the caller passes the current time. Negative elapsed is clamped
// to zero (clock skew protection).

import type { TokenBucketState } from "./types";

export interface AdvanceInput {
  state: TokenBucketState;
  nowMs: number;
}

export function advance(input: AdvanceInput): TokenBucketState {
  const elapsed = Math.max(0, input.nowMs - input.state.lastRefillMs);
  const refilled = Math.min(
    input.state.capacity,
    input.state.tokens + elapsed * input.state.refillPerMs,
  );
  return {
    ...input.state,
    tokens: refilled,
    lastRefillMs: input.nowMs,
  };
}
