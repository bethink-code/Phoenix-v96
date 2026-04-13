// ScoreOrderBookDepth — 0-15 points (relative to local background).
// ≥3× background = 15, 2× = 10, 1.5× = 5, ≤1× = 0.
// STUB for Phase 1 — order book stream not wired yet. Returns 0.
// Real implementation comes when WebSocket depth stream is online (Phase 6).

export function scoreOrderBookDepth(_relativeDepthRatio: number): number {
  // Stub. When depthCache is wired, restore:
  // if (relativeDepthRatio >= 3) return 15;
  // if (relativeDepthRatio >= 2) return 10;
  // if (relativeDepthRatio >= 1.5) return 5;
  // return 0;
  return 0;
}
