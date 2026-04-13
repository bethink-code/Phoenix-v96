// createTokenBucket — initialise a fresh token-bucket state.
// Pure constructor — no side effects.

import type { TokenBucketState } from "./types";

export interface CreateTokenBucketInput {
  capacity: number;
  refillPerMinute: number;
  initialTokens?: number; // defaults to capacity (start full)
  nowMs: number;
}

export function createTokenBucket(
  input: CreateTokenBucketInput,
): TokenBucketState {
  return {
    capacity: input.capacity,
    tokens: input.initialTokens ?? input.capacity,
    refillPerMs: input.refillPerMinute / 60_000,
    lastRefillMs: input.nowMs,
  };
}
