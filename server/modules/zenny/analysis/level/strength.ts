// Level strength tiers — historical respect, recency, and combined.
//
// A level can be "strong" for two opposite reasons:
//   1. It's been tested many times and held → historical respect (high touches)
//   2. It's a recent untested swing → untaken liquidity (low touches + recent)
//
// Both are valid signals. The combined strength is the max of the two
// dimensions. Pure functions, all sweepable by the Karpathy harness later.

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

// Map touch count to historical-respect strength tier. Pure.
// Untouched (just the pivot) = trivial; 6+ touches = very_strong.
export function strengthFromTouches(touches: number): LevelStrength {
  if (touches >= 6) return "very_strong";
  if (touches >= 4) return "strong";
  if (touches >= 3) return "medium";
  if (touches >= 2) return "weak";
  return "trivial";
}

// Map recency (0 = oldest in window, 1 = newest) to strength tier. Pure.
// A recent untested swing is "untaken liquidity" — a magnet for stops.
// LuxAlgo / SMC concept.
export function strengthFromRecency(recency: number): LevelStrength {
  if (recency >= 0.95) return "very_strong";
  if (recency >= 0.85) return "strong";
  if (recency >= 0.7) return "medium";
  return "trivial";
}

// Combined level strength = max of the two dimensions.
// A level is strong if EITHER it's been heavily tested OR it's recent
// and untested. Both matter; render the higher tier.
export function combinedLevelStrength(
  touches: number,
  recency: number,
): LevelStrength {
  const a = strengthFromTouches(touches);
  const b = strengthFromRecency(recency);
  return STRENGTH_RANK[a] >= STRENGTH_RANK[b] ? a : b;
}
