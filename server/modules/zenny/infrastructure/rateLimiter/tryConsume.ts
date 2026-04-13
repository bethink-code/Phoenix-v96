// tryConsume — attempt to spend N tokens from a bucket.
// Pure. Refresh first via advance(); if granted, the new state has
// the cost deducted. If denied, the state is the post-refresh value
// (caller still sees up-to-date token count) plus a wait estimate.

import type { TokenBucketState } from "./types";
import { advance } from "./advance";

export interface TryConsumeInput {
  state: TokenBucketState;
  cost: number;
  nowMs: number;
}

export interface TryConsumeResult {
  granted: boolean;
  state: TokenBucketState;
  shortfall: number;
  msUntilAvailable: number;
}

export function tryConsume(input: TryConsumeInput): TryConsumeResult {
  const refreshed = advance({ state: input.state, nowMs: input.nowMs });
  if (refreshed.tokens >= input.cost) {
    return {
      granted: true,
      state: { ...refreshed, tokens: refreshed.tokens - input.cost },
      shortfall: 0,
      msUntilAvailable: 0,
    };
  }
  const shortfall = input.cost - refreshed.tokens;
  const msUntilAvailable =
    refreshed.refillPerMs > 0
      ? Math.ceil(shortfall / refreshed.refillPerMs)
      : Infinity;
  return {
    granted: false,
    state: refreshed,
    shortfall,
    msUntilAvailable,
  };
}
