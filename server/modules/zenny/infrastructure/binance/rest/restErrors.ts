// REST error classes — thrown by makeRestRequest and its callers.

export class RestRequestError extends Error {
  constructor(
    message: string,
    public readonly endpoint: string,
    public readonly status: number | null,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "RestRequestError";
  }
}

export class CircuitOpenError extends RestRequestError {
  constructor(endpoint: string) {
    super(`Circuit breaker open for ${endpoint}`, endpoint, null);
    this.name = "CircuitOpenError";
  }
}

export class WeightBudgetExceededError extends RestRequestError {
  constructor(endpoint: string, msUntilAvailable: number) {
    super(
      `Weight budget exceeded for ${endpoint}, retry in ~${msUntilAvailable}ms`,
      endpoint,
      null,
    );
    this.name = "WeightBudgetExceededError";
  }
}
