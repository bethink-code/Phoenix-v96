// ScoreVolumeProfile — 0-15 points based on VPVR percentile rank.
// Top 10% = 15, top 20% = 10, top 40% = 5, below = 0.
// Pure. Spec §2.6.

export function scoreVolumeProfile(volumePercentile: number): number {
  if (volumePercentile >= 0.9) return 15;
  if (volumePercentile >= 0.8) return 10;
  if (volumePercentile >= 0.6) return 5;
  return 0;
}
