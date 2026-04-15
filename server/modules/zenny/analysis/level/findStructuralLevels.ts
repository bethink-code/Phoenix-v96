// findStructuralLevels — ONE function that identifies the structurally
// significant peaks and troughs in a candle series via PEAK PROMINENCE.
//
// Replaces the previous filter-chain approach (findLocalExtrema +
// excursion filter + dedupeSwingPivots + cluster detection). One function,
// one concept, one set of tunables. The user's mental model is "find the
// patterns, mark their extremes" — pattern-first, top-down. This function
// encodes that directly instead of bottom-up pivot detection + filters.
//
// Why peak prominence: it's the standard topology metric for "how
// structurally significant is this peak". For each local extremum it
// measures how much you have to descend before reaching a MORE extreme
// peak. The global maximum has the highest prominence (you have to
// descend all the way to the global minimum); a tiny zigzag in chop has
// near-zero prominence (you only descend a few cents before reaching a
// nearby higher peak). Sorting by prominence and taking the top N gives
// you exactly the "structurally significant peaks/troughs" without any
// excursion filter, follow-through filter, or dedupe — those are all
// emergent properties of the prominence ranking.
//
// Pure. Operates on raw candles. Returns SwingExtremum entries so the
// orchestrator can flow them through the existing rendering pipeline.

import type { Candle } from "../../../../../shared/zennyTypes";
import type { SwingExtremum } from "../candle/findLocalExtrema";

export interface FindStructuralLevelsInput {
  candles: Candle[];
  topPerSide?: number; // default 3 — top 3 peaks + top 3 troughs
  minProminencePct?: number; // default 0 — minimum prominence as % of price
}

interface PromCandidate {
  index: number;
  bodyExtreme: number;
  prominence: number;
}

export function findStructuralLevels(
  input: FindStructuralLevelsInput,
): SwingExtremum[] {
  const candles = input.candles;
  if (candles.length < 3) return [];

  const topPerSide = input.topPerSide ?? 3;
  const minProminencePct = input.minProminencePct ?? 0;

  // Detection uses BODY extremes (max(open,close) for peaks,
  // min(open,close) for troughs). The user prefers body-based level
  // anchoring because bodies represent commitment, wicks are noise.
  const bodyTops = candles.map((c) => Math.max(c.open, c.close));
  const bodyBottoms = candles.map((c) => Math.min(c.open, c.close));

  const peaks = findProminentExtrema(bodyTops, "peak");
  const troughs = findProminentExtrema(bodyBottoms, "trough");

  // Optional minimum prominence floor (% of body extreme)
  const filteredPeaks = peaks.filter(
    (p) => p.prominence >= p.bodyExtreme * minProminencePct,
  );
  const filteredTroughs = troughs.filter(
    (t) => t.prominence >= t.bodyExtreme * minProminencePct,
  );

  const topPeaks = filteredPeaks.slice(0, topPerSide);
  const topTroughs = filteredTroughs.slice(0, topPerSide);

  // Convert to SwingExtremum format. Level price = close of the candle
  // (per the existing convention; bodies decide the swing, close anchors
  // the line).
  const result: SwingExtremum[] = [];
  for (const p of topPeaks) {
    const c = candles[p.index];
    result.push({
      index: p.index,
      candleOpenTime: c.openTime,
      price: c.close,
      wickPrice: c.high,
      type: "swing_high",
    });
  }
  for (const t of topTroughs) {
    const c = candles[t.index];
    result.push({
      index: t.index,
      candleOpenTime: c.openTime,
      price: c.close,
      wickPrice: c.low,
      type: "swing_low",
    });
  }

  // Return chronologically so downstream consumers can process oldest-first
  return result.sort((a, b) => a.index - b.index);
}

// ---------------------------------------------------------------------------
// Peak prominence — topology helper

function findProminentExtrema(
  values: number[],
  type: "peak" | "trough",
): PromCandidate[] {
  const result: PromCandidate[] = [];

  // Find every strict local extremum (vs immediate neighbours).
  // Prominence will rank them — most "noise" peaks score near zero.
  for (let i = 1; i < values.length - 1; i++) {
    const isLocal =
      type === "peak"
        ? values[i] > values[i - 1] && values[i] > values[i + 1]
        : values[i] < values[i - 1] && values[i] < values[i + 1];
    if (!isLocal) continue;

    result.push({
      index: i,
      bodyExtreme: values[i],
      prominence: computeProminence(values, i, type),
    });
  }

  // Most prominent first
  result.sort((a, b) => b.prominence - a.prominence);
  return result;
}

function computeProminence(
  values: number[],
  peakIdx: number,
  type: "peak" | "trough",
): number {
  const peakValue = values[peakIdx];

  // Walk LEFT until we find a more extreme peak; track the key col
  // (lowest value for peaks, highest for troughs) on the way.
  let leftKeyCol = peakValue;
  let leftFoundMoreExtreme = false;
  for (let j = peakIdx - 1; j >= 0; j--) {
    const isMoreExtreme =
      type === "peak" ? values[j] > peakValue : values[j] < peakValue;
    if (isMoreExtreme) {
      leftFoundMoreExtreme = true;
      break;
    }
    if (type === "peak") {
      if (values[j] < leftKeyCol) leftKeyCol = values[j];
    } else {
      if (values[j] > leftKeyCol) leftKeyCol = values[j];
    }
  }

  // Walk RIGHT — same logic, opposite direction.
  let rightKeyCol = peakValue;
  let rightFoundMoreExtreme = false;
  for (let j = peakIdx + 1; j < values.length; j++) {
    const isMoreExtreme =
      type === "peak" ? values[j] > peakValue : values[j] < peakValue;
    if (isMoreExtreme) {
      rightFoundMoreExtreme = true;
      break;
    }
    if (type === "peak") {
      if (values[j] < rightKeyCol) rightKeyCol = values[j];
    } else {
      if (values[j] > rightKeyCol) rightKeyCol = values[j];
    }
  }

  // Determine the key col. If neither side found a more extreme peak,
  // this is the global extremum and its prominence is anchored to the
  // opposite global extremum. Otherwise pick the HIGHER key col for peaks
  // (LOWER for troughs) — the harder side to descend on.
  let keyCol: number;
  if (!leftFoundMoreExtreme && !rightFoundMoreExtreme) {
    keyCol = type === "peak" ? Math.min(...values) : Math.max(...values);
  } else if (!leftFoundMoreExtreme) {
    keyCol = rightKeyCol;
  } else if (!rightFoundMoreExtreme) {
    keyCol = leftKeyCol;
  } else {
    keyCol =
      type === "peak"
        ? Math.max(leftKeyCol, rightKeyCol)
        : Math.min(leftKeyCol, rightKeyCol);
  }

  return type === "peak" ? peakValue - keyCol : keyCol - peakValue;
}
