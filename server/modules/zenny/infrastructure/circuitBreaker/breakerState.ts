// Circuit breaker state machine — pure.
// Tracks consecutive failures; opens after a threshold; tries half-open after a timeout.
// All transitions are pure: takes state + event, returns new state. No timers, no I/O.

export type BreakerStatus = "closed" | "open" | "half_open";

export interface BreakerState {
  status: BreakerStatus;
  consecutiveFailures: number;
  failureThreshold: number;
  openedAtMs: number | null;
  openDurationMs: number;
  halfOpenAttemptsRemaining: number;
  halfOpenAttemptBudget: number;
}

export interface CreateBreakerInput {
  failureThreshold: number; // default 5
  openDurationMs: number; // default 30000
  halfOpenAttemptBudget: number; // default 1
}

export function createBreaker(input: CreateBreakerInput): BreakerState {
  return {
    status: "closed",
    consecutiveFailures: 0,
    failureThreshold: input.failureThreshold,
    openedAtMs: null,
    openDurationMs: input.openDurationMs,
    halfOpenAttemptsRemaining: 0,
    halfOpenAttemptBudget: input.halfOpenAttemptBudget,
  };
}

// Tick the breaker forward in time — mainly responsible for moving "open" → "half_open"
// after the timeout has elapsed. Pure.
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

// Returns true if a request should be permitted in the current state.
// In half_open mode, returns true only while there are attempts remaining;
// the caller is expected to call recordSuccess or recordFailure afterwards.
export function canRequest(state: BreakerState): boolean {
  if (state.status === "closed") return true;
  if (state.status === "open") return false;
  // half_open
  return state.halfOpenAttemptsRemaining > 0;
}

export function recordSuccess(state: BreakerState): BreakerState {
  // Any success resets to closed and zeroes the failure count.
  return {
    ...state,
    status: "closed",
    consecutiveFailures: 0,
    openedAtMs: null,
    halfOpenAttemptsRemaining: 0,
  };
}

export function recordFailure(state: BreakerState, nowMs: number): BreakerState {
  const failures = state.consecutiveFailures + 1;

  // Half-open failure → straight back to open (don't wait for threshold)
  if (state.status === "half_open") {
    return {
      ...state,
      status: "open",
      consecutiveFailures: failures,
      openedAtMs: nowMs,
      halfOpenAttemptsRemaining: 0,
    };
  }

  // Closed failures accumulate; open at threshold
  if (failures >= state.failureThreshold) {
    return {
      ...state,
      status: "open",
      consecutiveFailures: failures,
      openedAtMs: nowMs,
    };
  }

  return { ...state, consecutiveFailures: failures };
}

// Useful for telemetry / Panel 6 display
export function describeBreaker(state: BreakerState): string {
  if (state.status === "closed") return `closed (${state.consecutiveFailures}/${state.failureThreshold} failures)`;
  if (state.status === "open") return `open (${state.consecutiveFailures} failures)`;
  return `half_open (${state.halfOpenAttemptsRemaining}/${state.halfOpenAttemptBudget} attempts)`;
}
