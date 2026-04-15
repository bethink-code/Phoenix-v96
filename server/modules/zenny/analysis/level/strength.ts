// Level strength — confluence-driven in the Phase 2 refactor.
//
// Primary signal is MULTI-TIMEFRAME CONFLUENCE. A level where multiple TFs
// agree is structurally significant; that's the whole point of the method.
//
// Secondary signal: recency. A very recent pivot that's not yet confluent
// still matters because it's untaken liquidity — stops are sitting there.
//
// Combined = max of the two dimensions. Pure.

export type LevelStrength =
  | "trivial"
  | "weak"
  | "medium"
  | "strong"
  | "very_strong";

export const STRENGTH_RANK: Record<LevelStrength, number> = {
  trivial: 0,
  weak: 1,
  medium: 2,
  strong: 3,
  very_strong: 4,
};

// Map confluence count (how many of the "trader's four" TFs agree) to strength.
// 1 TF  = weak       (local level only, no agreement)
// 2 TFs = medium     (multi-TF swing, e.g. 4H + D)
// 3 TFs = strong     (structural level, e.g. 4H + D + W)
// 4 TFs = very_strong (cycle-defining megalevel, all four agree)
export function strengthFromConfluence(confluenceCount: number): LevelStrength {
  if (confluenceCount >= 4) return "very_strong";
  if (confluenceCount >= 3) return "strong";
  if (confluenceCount >= 2) return "medium";
  if (confluenceCount >= 1) return "weak";
  return "trivial";
}

// Map recency (0 = oldest in window, 1 = newest) to strength tier.
// Recent untested swings are "untaken liquidity" — targets for stop hunts.
// Last 5% → very_strong, last 15% → strong, last 30% → medium, last 60% → weak.
export function strengthFromRecency(recency: number): LevelStrength {
  if (recency >= 0.95) return "very_strong";
  if (recency >= 0.85) return "strong";
  if (recency >= 0.7) return "medium";
  if (recency >= 0.4) return "weak";
  return "trivial";
}

// Combined = max of confluence tier, recency tier, and (optionally) a
// primary-TF floor. The TF you're viewing always shows its own structure
// at minimum "weak" so its pivots aren't rendered into nothing.
export function combinedLevelStrength(
  confluenceCount: number,
  recency: number,
  isPrimaryTimeframe: boolean = false,
): LevelStrength {
  const a = strengthFromConfluence(confluenceCount);
  const b = strengthFromRecency(recency);
  const max = STRENGTH_RANK[a] >= STRENGTH_RANK[b] ? a : b;
  if (isPrimaryTimeframe && STRENGTH_RANK[max] < STRENGTH_RANK.weak) {
    return "weak";
  }
  return max;
}
