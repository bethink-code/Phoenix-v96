// Wire angle pass — answers Q1 of the regime layer: which pattern are we in.
//
// FORMULA (deviation from spec §1.2, 2026-05-08):
//
//   angle_deg = atan(pct_change_over_N / (k · σ · √N)) × (180/π)
//
//   pct_change = (smoothed[0] − smoothed[N-1]) / smoothed[N-1] × 100
//   σ          = std deviation of per-bar % returns over the lookback
//   √N · σ     = expected % move over N bars (random-walk scaling)
//   k          = volatility-normalisation constant (default 1.0; tunable)
//   N          = 14 (matches RSI/ROC/ADX/Wilder convention across all TFs)
//
// The slope is the **Z-score** of the smoothed move — "how many standard
// deviations did price travel over N bars." With k=1 and N=14 this gives:
//   45°   ↔ ~1σ move (a "typical" 14-bar excursion)
//   63.75° ↔ ~2σ move (statistically uncommon — breakout territory)
//
// Why the spec's `pct/N` was wrong: it normalised by bar count, not by the
// asset's typical move size. Result: 14-bar moves on Daily produced
// reasonable angles (the calibration TF) but on 15m/4H most moves
// collapsed below the NO_TRADE threshold because the same bar count
// covers very different % moves on different TFs. Z-score normalisation
// makes the degree thresholds genuinely TF-invariant. Cross-checked
// against RSI/ADX/Wilder/linreg-slope conventions, none of which divide
// by N — they normalise by other measures of expected move. See research
// in this conversation 2026-05-08.
//
// SMOOTHING is unchanged: 5-tap [1,2,3,2,1]/9 kernel applied to closes
// before measuring pct_change. The volatility σ is computed on the
// raw closes (not smoothed) — smoothing the input we're trying to
// measure variance of would understate σ.
//
// Brackets use |angle|; sign of angle is preserved for trade direction.
//
// Multi-TF: the same computation runs against every analysed timeframe in
// the stack — including dwell + per-bar history. Each TF gets its own
// independent gate (deviation from spec §2.9: the user overrode the
// "primary TF is the only gate" rule on 2026-05-08 — see memory note
// `zenny_wire_angle`). A setup is tradeable if its OWN TF's gate is open
// AND locked. HTF agreement remains a conviction signal, not a gate input.
//
// Dwell / hysteresis: every bar in the visible window has a bracket. The
// CANDIDATE bracket is the right-edge bar's. The LOCKED bracket is the most
// recent bracket that has held for >= dwellBarsRequired consecutive bars.
// Decision module reads `dwell.lockedBracket` for the gate; the candidate
// is what the operator sees as "where we're heading." Stops the regime
// from flickering at the fixed thresholds.

import type { Candle, Timeframe } from "../../../../../shared/zennyTypes";
import type { PassRunInput, WireAnglePassConfig } from "./types";

export type GannBracket =
  | "NO_TRADE"
  | "ACCUMULATION"
  | "RANGING"
  | "TRENDING"
  | "BREAKOUT";

export type WireDirection = "up" | "down" | "flat";

// The wire-angle pass answers Q1 of the regime layer: which pattern are we
// in. Whether a setup is *tradeable* is a separate composite question
// answered by the regime/assessment module, which combines this bracket
// with arm pull, HTF agreement, market quality, and other inputs. Don't
// add a `tradePermitted` flag here — the bracket itself routes; the
// tradeable question lives downstream.
export interface WireAnglePassInfo {
  angleDeg: number; // signed
  gannBracket: GannBracket; // based on |angle|
  direction: WireDirection; // sign of angle
  lookback: number; // N
  smoothedClose: number; // smoothed close at right edge
  smoothedCloseNAgo: number; // smoothed close N-1 bars ago
  pctChange: number; // for debugging / Now badge breakdown
  // Vol-normalisation transparency — surface the σ used in the slope so
  // the operator can see "what counts as a typical move on this TF" and
  // why a given pct produced a given angle.
  realizedVolPct: number; // per-bar σ of returns, expressed as %
  expectedWindowMovePct: number; // σ × √N — "typical" % move over N bars
  zScore: number; // pct_change / expectedWindowMovePct — slope before atan
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
//
// candleOpenTime is the openTime of the candle this entry corresponds to
// (on whichever TF the history was computed for). Used by regime-history
// computation to align HTF bars to primary timestamps for as-of-bar HTF
// agreement.
export interface PerBarRegime {
  candleIndex: number;
  candleOpenTime: number;
  angleDeg: number;
  bracket: GannBracket;
  direction: WireDirection;
}

// Locked vs candidate state (primary TF only). The decision module gates
// on `lockedBracket` (and the regime/assessment module decides tradeability
// using lockedBracket + many other inputs); the operator UI shows
// candidate alongside so they can see a flip about to happen.
export interface WireAngleDwell {
  lockedBracket: GannBracket;
  candidateBracket: GannBracket;
  candidateBarsObserved: number;
  dwellBarsRequired: number;
  pendingFlip: boolean;
}

// Per-TF regime state — every analysed TF carries its own info + dwell +
// history. The decision module reads `dwell.lockedBracket` per TF and
// gates trades independently per TF.
export interface TfRegime {
  info: WireAnglePassInfo;
  dwell: WireAngleDwell;
  history: PerBarRegime[];
}

export interface WireAnglePassResult {
  // Sparse — TFs without enough candles for the lookback window are
  // absent. Caller indexes by `primaryTimeframe` for the chart-level
  // primary regime, or iterates the entries for cross-TF views.
  perTimeframe: Partial<Record<Timeframe, TfRegime>>;
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
  const k = config.volNormalisationK > 0 ? config.volNormalisationK : 1;

  // Every TF computes its own regime independently — info, history, dwell.
  // TFs without enough candles for the lookback window are simply absent
  // from the output; downstream code treats absent as "no regime data."
  const perTimeframe: Partial<Record<Timeframe, TfRegime>> = {};
  for (const [tf, candles] of input.perTfCandles) {
    const info = computeAngleFor(candles, N, k);
    if (info === null) continue;
    const history = computePerBarRegime(candles, N, k);
    const dwell = computeDwell(history, dwellBarsRequired);
    perTimeframe[tf] = { info, dwell, history };
  }

  // Primary TF must have computed for the regime card to render. If it
  // didn't (insufficient candles on the primary), bail — there's nothing
  // sensible to show.
  if (!perTimeframe[input.primaryTimeframe]) return null;

  const agreement = computeAgreement(
    perTimeframe[input.primaryTimeframe]!.info,
    input.primaryTimeframe,
    perTimeframe,
  );

  return { perTimeframe, agreement };
}

// Pure helper: candles + lookback → WireAnglePassInfo or null when there
// aren't enough smoothed values for the lookback window. Right-edge bar
// only. Used for the per-TF candidate state.
export function computeAngleFor(
  candles: Candle[],
  N: number,
  k = 1,
): WireAnglePassInfo | null {
  const smoothed = smoothCloses(candles);
  if (smoothed.length < N) return null;

  const closeNow = smoothed[smoothed.length - 1];
  const closeNAgo = smoothed[smoothed.length - N];
  if (closeNAgo === 0) return null;

  // Volatility from RAW closes over the same N-bar window — smoothing the
  // input we're measuring variance of would understate σ.
  const volPct = computeRealizedVolPct(candles, N);

  return makeInfo(closeNow, closeNAgo, N, volPct, k);
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
  k = 1,
): PerBarRegime[] {
  const smoothed = smoothCloses(candles);
  if (smoothed.length < N) return [];

  const out: PerBarRegime[] = [];
  // Walk every position in the smoothed array that has N smoothed values
  // available behind it. smoothed[i] corresponds to candle[i + 2] because
  // smoothCloses chops 2 from the left.
  //
  // Volatility for bar i is computed from the RAW close window ending at
  // candle[s + 2] (so as-of-bar-i, not look-ahead). This makes the
  // per-bar regime an honest "what would the gate have said at this bar."
  for (let s = N - 1; s < smoothed.length; s++) {
    const closeNow = smoothed[s];
    const closeNAgo = smoothed[s - (N - 1)];
    if (closeNAgo === 0) continue;
    const candleIndex = s + 2;
    const candlesUpToBar = candles.slice(0, candleIndex + 1);
    const volPct = computeRealizedVolPct(candlesUpToBar, N);
    const info = makeInfo(closeNow, closeNAgo, N, volPct, k);
    out.push({
      candleIndex,
      candleOpenTime: candles[candleIndex].openTime,
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

  if (observed < dwellBarsRequired) {
    // Search prior runs.
    let i = history.length - observed - 1;
    while (i >= 0) {
      const runBracket = history[i].bracket;
      let runLen = 1;
      while (i - 1 >= 0 && history[i - 1].bracket === runBracket) {
        runLen++;
        i--;
      }
      if (runLen >= dwellBarsRequired) {
        lockedBracket = runBracket;
        break;
      }
      i--;
    }
  }

  return {
    lockedBracket,
    candidateBracket: candidate.bracket,
    candidateBarsObserved: observed,
    dwellBarsRequired,
    pendingFlip: lockedBracket !== candidate.bracket,
  };
}

export function computeAgreement(
  primary: WireAnglePassInfo,
  primaryTf: Timeframe,
  perTimeframe: Partial<Record<Timeframe, TfRegime>>,
): WireAngleAgreement {
  const entries = Object.entries(perTimeframe) as Array<[Timeframe, TfRegime]>;
  const totalAnalysed = entries.length;

  let matchingDirectionCount = 0;
  let alignedTradePermittedCount = 0;
  let weakestAlignedBracket: GannBracket | null = null;

  for (const [, regime] of entries) {
    const info = regime.info;
    if (info.direction === "flat" || primary.direction === "flat") continue;
    if (info.direction !== primary.direction) continue;

    matchingDirectionCount += 1;
    // "Trade-strength bracket" = RANGING/TRENDING/BREAKOUT. Kept as a count
    // of aligned TFs at trade-strength angles so the regime/assessment
    // module can use it as a conviction multiplier; the regime layer no
    // longer treats this as a permit/block decision.
    if (
      info.gannBracket === "RANGING" ||
      info.gannBracket === "TRENDING" ||
      info.gannBracket === "BREAKOUT"
    ) {
      alignedTradePermittedCount += 1;
    }
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
    for (const [tf, regime] of entries) {
      if (tf === primaryTf) continue;
      if (regime.info.direction === "flat") continue;
      if (regime.info.direction === primary.direction) agreeCount += 1;
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
  volPct: number,
  k: number,
): WireAnglePassInfo {
  const pctChange = ((closeNow - closeNAgo) / closeNAgo) * 100;
  // Expected % move over N bars assuming random-walk scaling: σ × √N.
  // This is what we normalise against — the slope becomes the Z-score
  // of the actual move vs the expected move size on this TF.
  const expectedWindowMovePct = volPct * Math.sqrt(N);
  // Floor the denominator so a flat candle series (σ=0) doesn't divide
  // by zero. A tiny floor (0.01% per bar × √14 ≈ 0.037%) means flat
  // series produce NO_TRADE — the right answer.
  const denom = Math.max(0.01, k * expectedWindowMovePct);
  const zScore = pctChange / denom;
  const angleDeg = Math.atan(zScore) * (180 / Math.PI);
  return {
    angleDeg,
    gannBracket: classifyBracket(angleDeg),
    direction: classifyDirection(angleDeg),
    lookback: N,
    smoothedClose: closeNow,
    smoothedCloseNAgo: closeNAgo,
    pctChange,
    realizedVolPct: volPct,
    expectedWindowMovePct,
    zScore,
  };
}

// Realized volatility: standard deviation of per-bar % returns over the
// trailing N bars. Expressed as % (i.e., a typical 1% per-bar move shows
// as 1.0, not 0.01). Computed on RAW closes — smoothing the input we're
// trying to measure variance of would understate σ.
//
// Returns 0 when there isn't enough data — the caller treats that as
// "no volatility info, fall back to floor in the slope denominator."
export function computeRealizedVolPct(
  candles: Candle[],
  lookback: number,
): number {
  if (candles.length < lookback + 1) return 0;
  const startIdx = candles.length - lookback;
  const returns: number[] = [];
  for (let i = startIdx; i < candles.length; i++) {
    if (i === 0) continue;
    const prev = candles[i - 1].close;
    const curr = candles[i].close;
    if (prev === 0) continue;
    returns.push(((curr - prev) / prev) * 100);
  }
  if (returns.length === 0) return 0;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance =
    returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / returns.length;
  return Math.sqrt(variance);
}
