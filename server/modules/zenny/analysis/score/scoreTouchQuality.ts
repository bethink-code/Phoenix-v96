// ScoreTouchQuality — modifier in range -5 to +5.
// Strong rejections (>70 quality) add up to 5; weak touches (<30) subtract up to 5.
// Symmetric per session 2026-04-13 decision.

export interface TouchQualityInput {
  qualityScores: number[]; // each touch's 0-100 rejection quality
}

export function scoreTouchQuality(input: TouchQualityInput): number {
  if (input.qualityScores.length === 0) return 0;

  const strongCount = input.qualityScores.filter((q) => q > 70).length;
  const weakCount = input.qualityScores.filter((q) => q < 30).length;
  const total = input.qualityScores.length;

  const strongFraction = strongCount / total;
  const weakFraction = weakCount / total;

  // Linear: 100% strong → +5, 100% weak → -5, mixed → in between
  return Math.round(strongFraction * 5 - weakFraction * 5);
}

// Helper: classify a single touch's rejection quality.
// Used by validation and scoring functions when they have the touch data.
export function classifyTouchQuality(input: {
  rejectionDistance: number; // how far price moved away after the touch
  poolWidth: number;
  rejectionSpeedCandles: number; // candles to move away
}): number {
  if (input.poolWidth === 0) return 0;
  // Distance ratio: 0 = same as pool width, 5+ = strong rejection
  const distanceRatio = input.rejectionDistance / input.poolWidth;
  // Speed: fewer candles = stronger
  const speedScore = Math.max(0, 50 - input.rejectionSpeedCandles * 5);
  return Math.min(100, distanceRatio * 10 + speedScore);
}
