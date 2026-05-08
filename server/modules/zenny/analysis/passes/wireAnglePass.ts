// Wire angle pass — global to the primary timeframe, not per-level.
//
// Implements zenny_math.docx §1.2 (MeasureWireAngle), §1.3 (Gann brackets),
// §1.5 (SmoothWire). Output lives in passInfo.wireAngle, consumed by the
// Now badge and downstream by the pull/arm/tendency passes.
//
// The wire angle is the spec's first regime gate: trades are only permitted
// when |angle| ≥ 26.25° (RANGING bracket and above). NO_TRADE and
// ACCUMULATION suppress decisions globally.
//
//   angle_deg = atan(pct_change / N) × (180/π)
//     pct_change = (close[0] − close[N-1]) / close[N-1] × 100
//     N = 14 (matches RSI/ROC/ADX standard lookback per spec)
//
// Brackets use |angle|; sign of angle is preserved for trade direction.
//
// Multi-TF: the same computation runs against every analysed timeframe in
// the stack. The primary TF drives the spec's RegimeGuard (tradePermitted).
// Higher timeframes contribute a confluence/conviction signal — captured
// in `agreement` — but never act as a separate gate. The decision module
// can read `agreement.htfConfirms` to size or weight a trade, but the
// permit boundary stays at the primary TF.
//
// Dwell / hysteresis (primary TF only): every bar in the visible window
// has a bracket. The CANDIDATE bracket is the right-edge bar's. The LOCKED
// bracket is the most recent bracket that has held for >= dwellBarsRequired
// consecutive bars. Decision module reads `primaryDwell.lockedBracket` for
// the gate; the candidate is what the operator sees as "where we're
// heading." Stops the regime from flickering at the fixed thresholds.

import type { Candle, Timeframe } from "../../../../../shared/zennyTypes";
import type { PassRunInput, WireAnglePassConfig } from "./types";

export type GannBracket =
  | "NO_TRADE"
  | "ACCUMULATION"
  | "RANGING"
  | "TRENDING"
  | "BREAKOUT";

export type WireDirection = "up" | "down" | "flat";

export interface WireAnglePassInfo {
  angleDeg: number; // signed
  gannBracket: GannBracket; // based on |angle|
  direction: WireDirection; // sign of angle
  tradePermitted: boolean; // |angle| ≥ 26.25 per spec §2.9 RegimeGuard
  lookback: number; // N
  smoothedClose: number; // smoothed close at right edge
  smoothedCloseNAgo: number; // smoothed close N-1 bars ago
  pctChange: number; // for debugging / Now badge breakdown
}

// Multi-TF agreement summary. Derived once per run from the per-TF angles
// so the renderer + decision module don't reimplement the comparison logic.
export interface WireAngleAgreement {
  matchingDirectionCount: number;
  totalAnalysed: number;
  matchingDirectionRatio: number;
  alignedTradePermittedCount: number;
  weakestAlignedBracket: GannBracket | null;
  htfConfirms: "yes" | "mixed" | "no";
}

// Per-bar regime classification for the canvas overlay. One entry per
// PRIMARY-TF candle index that has enough lookback to compute an angle.
// Bars before the first viable index simply don't appear — the renderer
// treats them as "no data" (no strip drawn) and leaves the chart blank.
export interface PerBarRegime {
  candleIndex: number;
  angleDeg: number;
  bracket: GannBracket;
  direction: WireDirection;
}

// Locked vs candidate state (primary TF only). The decision module gates
// on `lockedBracket` / `lockedTradePermitted`; the operator UI shows
// candidate alongside so they can see a flip about to happen.
export interface WireAngleDwell {
  lockedBracket: GannBracket;
  lockedTradePermitted: boolean;
  candidateBracket: GannBracket;
  candidateBarsObserved: number;
  dwellBarsRequired: number;
  pendingFlip: boolean;
}

export interface WireAnglePassResult {
  primary: WireAnglePassInfo;
  primaryDwell: WireAngleDwell;
  // Aligned to primary candle indices — sparse on the left edge.
  primaryHistory: PerBarRegime[];
  // Per-TF candidate classification. HTF dwell is intentionally NOT
  // computed: HTFs are a conviction signal, not a gate, so flicker on
  // higher TFs is harmless and the cost of dwell-tracking everywhere is
  // wasted complexity.
  perTimeframe: Partial<Record<Timeframe, WireAnglePassInfo>>;
  agreement: WireAngleAgreement;
}

// Spec-fixed thresholds. These come straight from §1.3 and are not tunables —
// the whole point of normalising by % change is that the bracket math is
// timeframe-invariant. If you change these you've changed the strategy.
const BRACKET_NO_TRADE = 14;
const BRACKET_ACCUMULATION = 26.25;
const BRACKET_RANGING = 45;
const BRACKET_TRENDING = 63.75;

const FLAT_EPSILON_DEG = 0.5; // below this magnitude, direction = "flat"

const BRACKET_RANK: Record<GannBracket, number> = {
  NO_TRADE: 0,
  ACCUMULATION: 1,
  RANGING: 2,
  TRENDING: 3,
  BREAKOUT: 4,
};

export function runWireAnglePass(
  input: PassRunInput,
  config: WireAnglePassConfig,
): WireAnglePassResult | null {
  if (!config.enabled) return null;

  const N = Math.max(2, Math.floor(config.lookbackCandles));
  const dwellBarsRequired = Math.max(1, Math.floor(config.dwellBarsRequired));

  const primary = computeAngleFor(input.primaryCandles, N);
  if (primary === null) return null;

  const perTimeframe: Partial<Record<Timeframe, WireAnglePassInfo>> = {};
  for (const [tf, candles] of input.perTfCandles) {
    const info =
      tf === input.primaryTimeframe ? primary : computeAngleFor(candles, N);
    if (info !== null) perTimeframe[tf] = info;
  }

  const primaryHistory = computePerBarRegime(input.primaryCandles, N);
  const primaryDwell = computeDwell(primaryHistory, dwellBarsRequired);

  const agreement = computeAgreement(
    primary,
    input.primaryTimeframe,
    perTimeframe,
  );

  return { primary, primaryDwell, primaryHistory, perTimeframe, agreement };
}

// Pure helper: candles + lookback → WireAnglePassInfo or null when there
// aren't enough smoothed values for the lookback window. Right-edge bar
// only. Used for the per-TF candidate state.
export function computeAngleFor(
  candles: Candle[],
  N: number,
): WireAnglePassInfo | null {
  const smoothed = smoothCloses(candles);
  if (smoothed.length < N) return null;

  const closeNow = smoothed[smoothed.length - 1];
  const closeNAgo = smoothed[smoothed.length - N];
  if (closeNAgo === 0) return null;

  return makeInfo(closeNow, closeNAgo, N);
}

// Per-bar regime history for the primary TF. Computes an angle/bracket at
// every bar index that has enough smoothed lookback. The first viable
// candle index is `(N + 1)` because the [1,2,3,2,1]/9 kernel discards 2
// bars at each end, and the lookback then needs (N-1) more bars.
//
// Output is in candle-index space (not smoothed-array space) so the canvas
// renderer can align the strip to the visible candles directly.
export function computePerBarRegime(
  candles: Candle[],
  N: number,
): PerBarRegime[] {
  const smoothed = smoothCloses(candles);
  if (smoothed.length < N) return [];

  const out: PerBarRegime[] = [];
  // Walk every position in the smoothed array that has N smoothed values
  // available behind it. smoothed[i] corresponds to candle[i + 2] because
  // smoothCloses chops 2 from the left.
  for (let s = N - 1; s < smoothed.length; s++) {
    const closeNow = smoothed[s];
    const closeNAgo = smoothed[s - (N - 1)];
    if (closeNAgo === 0) continue;
    const info = makeInfo(closeNow, closeNAgo, N);
    out.push({
      candleIndex: s + 2,
      angleDeg: info.angleDeg,
      bracket: info.gannBracket,
      direction: info.direction,
    });
  }
  return out;
}

// Walks the per-bar history backwards from the right edge to determine
// the locked bracket. Locked = most recent bracket that holds for >=
// dwellBarsRequired consecutive bars at any point in the history;
// transitions in progress (run length < required) leave the previous
// locked state intact while marking pendingFlip = true.
//
// Examples (dwellBarsRequired = 3):
//   [R, R, R]               → locked=R, candidate=R, observed=3, no pending
//   [R, R, R, T]            → locked=R, candidate=T, observed=1, pending
//   [R, R, R, T, T, T]      → locked=T, candidate=T, observed=3, no pending
//   [T, T, T, T, R, T]      → locked=T (last fully-locked run), candidate=T,
//                             observed=1 (last R broke the run), pending=false
//                             because candidate matches locked
export function computeDwell(
  history: PerBarRegime[],
  dwellBarsRequired: number,
): WireAngleDwell {
  if (history.length === 0) {
    // Defensive default — only reachable if the pass was called with
    // insufficient candles, but runWireAnglePass returns null in that case
    // so this branch is mostly for type completeness.
    return {
      lockedBracket: "NO_TRADE",
      lockedTradePermitted: false,
      candidateBracket: "NO_TRADE",
      candidateBarsObserved: 0,
      dwellBarsRequired,
      pendingFlip: false,
    };
  }

  const candidate = history[history.length - 1];

  // Count consecutive bars at the right edge sharing the candidate bracket.
  let observed = 1;
  for (let i = history.length - 2; i >= 0; i--) {
    if (history[i].bracket === candidate.bracket) observed++;
    else break;
  }

  // Walk backwards to find the most recent run of length >= required.
  // Start with the candidate run; if it qualifies, that's locked.
  // Otherwise, skip it and look at the run before it.
  let lockedBracket: GannBracket = candidate.bracket;
  let lockedAngleDeg = candidate.angleDeg;

  if (observed >= dwellBarsRequired) {
    // Candidate run already qualifies — locked == candidate.
    // Use the angle at the lock-bar (the bar that completed dwell, i.e.
    // dwellBarsRequired bars back from the end of the run start).
    const lockBarIdx = history.length - observed + (dwellBarsRequired - 1);
    lockedAngleDeg = history[lockBarIdx].angleDeg;
  } else {
    // Search prior runs.
    let i = history.length - observed - 1;
    while (i >= 0) {
      const runEnd = i;
      const runBracket = history[i].bracket;
      let runLen = 1;
      while (i - 1 >= 0 && history[i - 1].bracket === runBracket) {
        runLen++;
        i--;
      }
      if (runLen >= dwellBarsRequired) {
        lockedBracket = runBracket;
        // Lock-bar is the bar that completed dwell within this run.
        const runStart = runEnd - runLen + 1;
        lockedAngleDeg = history[runStart + (dwellBarsRequired - 1)].angleDeg;
        break;
      }
      i--;
    }
  }

  return {
    lockedBracket,
    lockedTradePermitted: Math.abs(lockedAngleDeg) >= BRACKET_ACCUMULATION,
    candidateBracket: candidate.bracket,
    candidateBarsObserved: observed,
    dwellBarsRequired,
    pendingFlip: lockedBracket !== candidate.bracket,
  };
}

export function computeAgreement(
  primary: WireAnglePassInfo,
  primaryTf: Timeframe,
  perTimeframe: Partial<Record<Timeframe, WireAnglePassInfo>>,
): WireAngleAgreement {
  const entries = Object.entries(perTimeframe) as Array<
    [Timeframe, WireAnglePassInfo]
  >;
  const totalAnalysed = entries.length;

  let matchingDirectionCount = 0;
  let alignedTradePermittedCount = 0;
  let weakestAlignedBracket: GannBracket | null = null;

  for (const [, info] of entries) {
    if (info.direction === "flat" || primary.direction === "flat") continue;
    if (info.direction !== primary.direction) continue;

    matchingDirectionCount += 1;
    if (info.tradePermitted) alignedTradePermittedCount += 1;
    if (
      weakestAlignedBracket === null ||
      BRACKET_RANK[info.gannBracket] < BRACKET_RANK[weakestAlignedBracket]
    ) {
      weakestAlignedBracket = info.gannBracket;
    }
  }

  let htfConfirms: WireAngleAgreement["htfConfirms"] = "mixed";
  if (primary.direction !== "flat") {
    let agreeCount = 0;
    let opposeCount = 0;
    for (const [tf, info] of entries) {
      if (tf === primaryTf) continue;
      if (info.direction === "flat") continue;
      if (info.direction === primary.direction) agreeCount += 1;
      else opposeCount += 1;
    }
    if (agreeCount > 0 && opposeCount === 0) htfConfirms = "yes";
    else if (opposeCount > 0 && agreeCount === 0) htfConfirms = "no";
  }

  return {
    matchingDirectionCount,
    totalAnalysed,
    matchingDirectionRatio:
      totalAnalysed === 0 ? 0 : matchingDirectionCount / totalAnalysed,
    alignedTradePermittedCount,
    weakestAlignedBracket,
    htfConfirms,
  };
}

// 5-tap [1,2,3,2,1]/9 kernel — algebraically identical to a 3-period SMA
// applied twice (spec §1.5). Output is shorter than input by 4 (2 each end).
export function smoothCloses(candles: Candle[]): number[] {
  if (candles.length < 5) return [];
  const out: number[] = [];
  for (let i = 2; i < candles.length - 2; i++) {
    out.push(
      (candles[i - 2].close +
        2 * candles[i - 1].close +
        3 * candles[i].close +
        2 * candles[i + 1].close +
        candles[i + 2].close) /
        9,
    );
  }
  return out;
}

export function classifyBracket(angleDeg: number): GannBracket {
  const a = Math.abs(angleDeg);
  if (a < BRACKET_NO_TRADE) return "NO_TRADE";
  if (a < BRACKET_ACCUMULATION) return "ACCUMULATION";
  if (a < BRACKET_RANGING) return "RANGING";
  if (a < BRACKET_TRENDING) return "TRENDING";
  return "BREAKOUT";
}

export function classifyDirection(angleDeg: number): WireDirection {
  if (Math.abs(angleDeg) < FLAT_EPSILON_DEG) return "flat";
  return angleDeg > 0 ? "up" : "down";
}

function makeInfo(
  closeNow: number,
  closeNAgo: number,
  N: number,
): WireAnglePassInfo {
  const pctChange = ((closeNow - closeNAgo) / closeNAgo) * 100;
  const slope = pctChange / N;
  const angleDeg = Math.atan(slope) * (180 / Math.PI);
  return {
    angleDeg,
    gannBracket: classifyBracket(angleDeg),
    direction: classifyDirection(angleDeg),
    tradePermitted: Math.abs(angleDeg) >= BRACKET_ACCUMULATION,
    lookback: N,
    smoothedClose: closeNow,
    smoothedCloseNAgo: closeNAgo,
    pctChange,
  };
}
