// findRdpLevels — THE level detector. Runs Ramer-Douglas-Peucker on the
// candle close series (1D price signal) and returns the N most structural
// turning points. Same algorithm that's been visually validated across
// six timeframes (M/W/D/4H/1H/15m) via the line-chart overlay. This is
// the server-side promotion — the authoritative source of levels for the
// entire analysis pipeline.
//
// Why this replaces everything before it (findLocalExtrema, excursion
// filter, dedupe, cluster detector, peak prominence, broken-pivot filter):
// RDP is a top-down, pattern-first algorithm that literally encodes
// "identify the trend segments and mark their extremes." The user's
// visual mental model is pattern-first; every previous bottom-up
// primitive (strict swing pivots, filters) was fighting against that.
// RDP on closes matches what the eye reads directly.
//
// Pure. Operates on raw candles, returns SwingExtremum entries so the
// orchestrator's downstream pipeline (confluence tagging, rendering)
// flows unchanged.

import type { Candle } from "../../../../../shared/zennyTypes";
import type { SwingExtremum } from "../candle/findLocalExtrema";

export interface FindRdpLevelsInput {
  candles: Candle[];
  // Leg-size threshold as a fraction of the most recent close — e.g. 0.20
  // on Monthly means "a leg counts as structural if its vertex deviates
  // from the surrounding trend-line by at least 20% of current price."
  // The number of resulting vertices is EMERGENT from the data, not set
  // directly. Minimum 2 (RDP always keeps the first and last points).
  // Larger value → fewer legs, big structural only. Smaller → more legs,
  // finer structure. Ignored if targetPoints is set.
  epsilonPct?: number;
  // Legacy: fixed target count via binary search. Retained for tests and
  // for callers that want a guaranteed vertex count. If both are set,
  // epsilonPct wins.
  targetPoints?: number;
}

export function findRdpLevels(input: FindRdpLevelsInput): SwingExtremum[] {
  const candles = input.candles;
  if (candles.length < 3) return [];

  // Use close as the signal, candle index as the x-axis. Same as client.
  const points: Array<[number, number]> = candles.map((c, i) => [i, c.close]);

  let simplified: Array<[number, number]>;

  if (input.epsilonPct !== undefined) {
    // Epsilon-driven mode: leg size threshold as % of current price.
    // Vertex count is emergent from the data.
    const currentPrice = candles[candles.length - 1].close;
    const epsilon = currentPrice * input.epsilonPct;
    simplified = simplifyRDP(points, epsilon);
  } else {
    // Target-count mode (legacy): binary search for a specific vertex count.
    const targetPoints = input.targetPoints ?? 15;
    let minP = candles[0].close;
    let maxP = candles[0].close;
    for (const c of candles) {
      if (c.close < minP) minP = c.close;
      if (c.close > maxP) maxP = c.close;
    }
    const priceRange = maxP - minP;
    simplified = simplifyToTargetCount(points, targetPoints, priceRange);
  }

  // Convert each vertex to a SwingExtremum using the FULL simplified list
  // (including endpoints) for type classification. We need the endpoints
  // as neighbors to correctly label the interior vertices as peaks/troughs.
  // Endpoints are stripped AFTER classification — they provide context but
  // don't appear in the output, because RDP's "first and last" are
  // artifacts of the data boundary, not real leg turning points.
  const typed: SwingExtremum[] = [];
  for (let i = 0; i < simplified.length; i++) {
    const [candleIdx, close] = simplified[i];
    const candle = candles[candleIdx];

    let type: "swing_high" | "swing_low";
    const prevY = i > 0 ? simplified[i - 1][1] : null;
    const nextY = i < simplified.length - 1 ? simplified[i + 1][1] : null;

    if (prevY !== null && nextY !== null) {
      type = close > prevY && close > nextY ? "swing_high" : "swing_low";
    } else if (prevY !== null) {
      type = close > prevY ? "swing_high" : "swing_low";
    } else if (nextY !== null) {
      type = close > nextY ? "swing_high" : "swing_low";
    } else {
      continue;
    }

    typed.push({
      index: candleIdx,
      candleOpenTime: candle.openTime,
      price: close,
      wickPrice: type === "swing_high" ? candle.high : candle.low,
      type,
    });
  }

  // Strip the first and last entries — those were the RDP-forced endpoints
  // used only for neighbor context during classification. What remains is
  // the interior leg-vertex set.
  if (typed.length >= 2) {
    return typed.slice(1, -1);
  }
  return [];
}

// ---------------------------------------------------------------------------
// RDP + target-count — mirrors client-side simplifyToTargetCount.

function simplifyToTargetCount(
  points: Array<[number, number]>,
  targetCount: number,
  priceRange: number,
): Array<[number, number]> {
  if (points.length <= targetCount) return points.slice();
  if (targetCount < 2) return [points[0], points[points.length - 1]];

  let lo = 0;
  let hi = priceRange;
  let best = simplifyRDP(points, (lo + hi) / 2);
  let bestDiff = Math.abs(best.length - targetCount);

  for (let iter = 0; iter < 30; iter++) {
    const mid = (lo + hi) / 2;
    const candidate = simplifyRDP(points, mid);
    const diff = Math.abs(candidate.length - targetCount);
    if (diff < bestDiff) {
      best = candidate;
      bestDiff = diff;
    }
    if (candidate.length === targetCount) return candidate;
    if (candidate.length > targetCount) {
      lo = mid;
    } else {
      hi = mid;
    }
    if (hi - lo < 1e-6) break;
  }
  return best;
}

function simplifyRDP(
  points: Array<[number, number]>,
  epsilon: number,
): Array<[number, number]> {
  if (points.length < 3) return points.slice();

  let maxDist = 0;
  let maxIdx = 0;
  const first = points[0];
  const last = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const d = verticalDistance(points[i], first, last);
    if (d > maxDist) {
      maxDist = d;
      maxIdx = i;
    }
  }

  if (maxDist > epsilon) {
    const left = simplifyRDP(points.slice(0, maxIdx + 1), epsilon);
    const right = simplifyRDP(points.slice(maxIdx), epsilon);
    return left.slice(0, -1).concat(right);
  }
  return [first, last];
}

// Vertical (price-axis) distance — see client comment for why perpendicular
// distance is wrong for price charts.
function verticalDistance(
  p: [number, number],
  a: [number, number],
  b: [number, number],
): number {
  const [px, py] = p;
  const [ax, ay] = a;
  const [bx, by] = b;
  if (bx === ax) return Math.abs(py - ay);
  const slope = (by - ay) / (bx - ax);
  const expectedY = ay + slope * (px - ax);
  return Math.abs(py - expectedY);
}
