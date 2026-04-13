// ScoreLiquidationCluster — 0-15 points based on Coinglass cluster proximity.
// Within 0.5% = 15, within 1% = 10, within 2% = 4, beyond = 0.
// STUB for Phase 1 — Coinglass not wired yet. Returns 0.
// Pool scores cap at 85/100 until this is real.

export interface LiquidationClusterDistance {
  distancePct: number; // distance from pool centre to nearest cluster
}

export function scoreLiquidationCluster(_distance: LiquidationClusterDistance | null): number {
  // Stub. When Coinglass is wired:
  // if (distance === null) return 0;
  // if (distance.distancePct <= 0.005) return 15;
  // if (distance.distancePct <= 0.01) return 10;
  // if (distance.distancePct <= 0.02) return 4;
  // return 0;
  return 0;
}
