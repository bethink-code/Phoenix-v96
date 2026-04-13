// Exponential backoff calculator — pure function.
// Given attempt number and config, returns the delay before the next retry.
// Used by retryWithBackoff to gate retries after API failures.

export interface BackoffConfig {
  initialDelayMs: number; // first retry delay
  maxDelayMs: number; // cap on delay
  multiplier: number; // typically 2
  maxAttempts: number; // 0 means unlimited
}

export const DEFAULT_BACKOFF_CONFIG: BackoffConfig = {
  initialDelayMs: 1_000,
  maxDelayMs: 30_000,
  multiplier: 2,
  maxAttempts: 5,
};

// Returns the delay before the Nth retry attempt (1-indexed).
// attempt=1 → initialDelayMs
// attempt=2 → initialDelayMs * multiplier
// attempt=3 → initialDelayMs * multiplier^2
// ... capped at maxDelayMs.
export function calculateBackoffDelay(
  attempt: number,
  config: BackoffConfig = DEFAULT_BACKOFF_CONFIG,
): number {
  if (attempt < 1) return 0;
  const raw = config.initialDelayMs * Math.pow(config.multiplier, attempt - 1);
  return Math.min(raw, config.maxDelayMs);
}

export function shouldRetry(
  attempt: number,
  config: BackoffConfig = DEFAULT_BACKOFF_CONFIG,
): boolean {
  if (config.maxAttempts === 0) return true;
  return attempt < config.maxAttempts;
}
