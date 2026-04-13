// Token bucket rate limiter — pure state machine.
// Used by the Binance REST client to ensure we never exceed the 2400 weight/min budget.
// Pure: takes state in, returns state out. No timers, no setTimeout. The orchestrator
// decides when to call advance() based on the wall clock, which makes this fully testable.

export interface TokenBucketState {
  capacity: number; // max tokens (e.g. 2400 for Binance futures weight budget)
  tokens: number; // current available tokens
  refillPerMs: number; // tokens added per ms (e.g. 2400/60000 = 0.04)
  lastRefillMs: number; // last time refill was applied (epoch ms)
}

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

export interface AdvanceInput {
  state: TokenBucketState;
  nowMs: number;
}

// Refill tokens based on elapsed time. Pure — returns new state.
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

export interface TryConsumeInput {
  state: TokenBucketState;
  cost: number;
  nowMs: number;
}

export interface TryConsumeResult {
  granted: boolean;
  state: TokenBucketState;
  shortfall: number; // tokens we would still need (0 if granted)
  msUntilAvailable: number; // estimated wait for the cost to be available
}

// Try to consume `cost` tokens. Returns the new state plus whether the consumption
// succeeded. If denied, the state is unchanged but refill is applied so the caller
// sees the up-to-date token count.
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
    refreshed.refillPerMs > 0 ? Math.ceil(shortfall / refreshed.refillPerMs) : Infinity;
  return {
    granted: false,
    state: refreshed,
    shortfall,
    msUntilAvailable,
  };
}
