// ScoreFreshness — 0-25 points based on touch count.
// Untouched = 25; degrades steeply with each touch.
// Literature unanimously: fresh zones are stronger than retested.

export function scoreFreshness(touchCount: number): number {
  if (touchCount <= 0) return 25;
  if (touchCount === 1) return 18;
  if (touchCount === 2) return 10;
  if (touchCount === 3) return 3;
  return 0;
}
