// ScoreTimeframeConfluence — 0-10 points.
// 1 TF=2, 2=5, 3=7, 4=9, 5=10. Max stays at 10 to preserve scoring total.
// STUB for Phase 1 — only Daily timeframe is being analysed.
// Returns 2 (1-TF baseline) until multi-TF is wired in Phase 2.

export function scoreTimeframeConfluence(visibleTimeframeCount: number): number {
  if (visibleTimeframeCount >= 5) return 10;
  if (visibleTimeframeCount === 4) return 9;
  if (visibleTimeframeCount === 3) return 7;
  if (visibleTimeframeCount === 2) return 5;
  if (visibleTimeframeCount === 1) return 2;
  return 0;
}
