// Token bucket rate limiter — shared types.

export interface TokenBucketState {
  capacity: number;
  tokens: number;
  refillPerMs: number;
  lastRefillMs: number;
}
