// Per-bar regime assessment — runs the full playbook composite at every
// historical primary-TF candle so the timeline strip can show "what
// playbook (if any) applied here, with what strength."
//
// Visual back-testing is the validation method: eye on chart = test. The
// strip has to honestly reflect the playbook output at each bar, not just
// the wire-angle bracket, otherwise we miss the structural setups the
// operator's eye reads (clear pools + arms + retest geometry that the
// raw slope misses).
//
// Caching: per-bar regime is immutable historical data. Once computed
// for (symbol, tf, candleOpenTime) it never changes. Module-level Map
// caches forever (process lifetime). Each run only computes new bars.
//
// Pure function. No DB. No side effects beyond the in-memory cache.
//
// v1 simplifications (flagged for future tightening):
//   - HTF agreement uses the current snapshot for every historical bar.
//     Doing it as-of-bar-i would require per-TF candle openTime arrays
//     so we can find each TF's bracket at primary[i].openTime. Listed
//     in the rebuild requirements as a follow-up.
//   - polarityFlips count uses current snapshot (level passes only run
//     once at right edge).
//   - feedHealth + liquidationProximity remain unavailable historically.

import type { Candle, Timeframe } from "../../../../../shared/zennyTypes";
import {
  ARM_MINIMUM_PULL,
  extractArms,
  type ExtractedArms,
} from "../arms/extractArms";
import type { AnalysisLevel, AnalysisPool } from "../orchestrator";
import {
  DEFAULT_PULL_PASS_CONFIG,
  computeCandlesMovingAway,
  sEffectiveStandIn,
  type PoolPull,
} from "../pool/pullPass";
import type {
  GannBracket,
  PerBarRegime,
  TfRegime,
  WireAnglePassResult,
} from "../passes/wireAnglePass";
import { computeDwell } from "../passes/wireAnglePass";
import {
  assessAccumulation,
  assessBreakout,
  assessRanging,
  assessTrending,
} from "./assessPlaybooks";
import {
  extractAbsorption,
  extractArmPull,
  extractBoundaryDistance,
  extractCancelPullRatio,
  extractDepth,
  extractDwell,
  extractFeedHealth,
  extractHtfAgreement,
  extractLiquidationProximity,
  extractOFI,
  extractPolarityFlips,
  extractPoolStrength,
  extractRealizedVolatility,
  extractRecency,
  extractSpread,
  extractTickDensity,
  extractTouchQuality,
  extractVolumeDelta,
} from "./extractInputs";

// Re-export for clarity at the import site.
export { ARM_MINIMUM_PULL };
import type {
  Playbook,
  PlaybookAssessment,
  RegimeInput,
  RegimeInputs,
  AngleInputValue,
} from "./types";

// One row per primary candle that has enough data to compute. Lightweight —
// the strip + tooltips only need this much; the full input snapshot is
// retained for the present-moment card via `regimeAssessment` separately.
export interface BarRegimeSnapshot {
  candleIndex: number; // primary index AT COMPUTE TIME (recompute as needed)
  candleOpenTime: number; // immutable cache key
  bracket: GannBracket;
  recommended: { playbook: Playbook; strength: number } | null;
  // Per-playbook strengths so the strip can later vary opacity / stripe by
  // strength, or surface "second-best playbook" on hover.
  playbookStrengths: Record<Playbook, number>;
}

// Module-level cache. Grows for the process lifetime. Keys are
// "{symbol}|{tf}|{candleOpenTime}" so they're stable across bar-index
// shifts when a new candle closes.
const CACHE = new Map<string, BarRegimeSnapshot>();

export interface ComputeRegimeHistoryInput {
  symbol: string;
  primaryTimeframe: Timeframe;
  primaryCandles: Candle[];
  pools: AnalysisPool[];
  levels: AnalysisLevel[];
  wireAngle: WireAnglePassResult;
}

export function computeRegimeHistory(
  input: ComputeRegimeHistoryInput,
): BarRegimeSnapshot[] {
  const primaryRegime = input.wireAngle.perTimeframe[input.primaryTimeframe];
  if (!primaryRegime) return [];

  // The wire-angle lookback (N) is part of the cache key — changing N
  // produces different brackets for the same bar, so cached entries
  // computed with a different N must not be returned. Read N from the
  // primary's TfRegime info (lookback was used to compute the history).
  const lookback = primaryRegime.info.lookback;

  const out: BarRegimeSnapshot[] = [];
  // primaryRegime.history covers every primary candle that has enough
  // wire-angle lookback. Bars before the first viable index are simply
  // absent — no fabricated assessment.
  for (const histEntry of primaryRegime.history) {
    const i = histEntry.candleIndex;
    if (i < 0 || i >= input.primaryCandles.length) continue;
    const candleOpenTime = input.primaryCandles[i].openTime;
    const cacheKey = `${input.symbol}|${input.primaryTimeframe}|${candleOpenTime}|n=${lookback}`;

    const cached = CACHE.get(cacheKey);
    if (cached) {
      // Refresh the candleIndex (shifts as the window slides) but reuse
      // the immutable verdict + strengths from cache.
      out.push({ ...cached, candleIndex: i });
      continue;
    }

    const snapshot = computeAtBar(input, i, candleOpenTime, histEntry, primaryRegime);
    CACHE.set(cacheKey, snapshot);
    out.push(snapshot);
  }
  return out;
}

// Compute the full regime assessment for a single historical bar. This is
// where the per-bar inputs get rebuilt: pools filtered to alive-at-i,
// arms re-extracted with closes[i] as price, dwell sliced to [0..i].
function computeAtBar(
  ctx: ComputeRegimeHistoryInput,
  i: number,
  candleOpenTime: number,
  histEntry: PerBarRegime,
  primaryRegime: TfRegime,
): BarRegimeSnapshot {
  const candlesUpToI = ctx.primaryCandles.slice(0, i + 1);
  const priceAtI = candlesUpToI[candlesUpToI.length - 1].close;

  // Pools alive at bar i: birthed by i, not yet dead/swept by i. The
  // pull on each pool needs to be recomputed against the as-of-bar-i
  // price + candle window — a pool's pull is wholly time-relative.
  const aliveAtI = filterPoolsAliveAt(ctx.pools, i);
  const enrichedAtI = enrichWithPullAtBar(aliveAtI, candlesUpToI, priceAtI);
  const armsAtI = extractArms({ pools: enrichedAtI, currentPrice: priceAtI });

  // Dwell as-of-bar-i: feed only the prefix of primaryHistory that ends
  // at or before bar i.
  const historyToI = primaryRegime.history.filter(
    (h) => h.candleIndex <= i,
  );
  const dwellAtI = computeDwell(historyToI, primaryRegime.dwell.dwellBarsRequired);

  // Build the input contract for bar i. Most extractors take the sliced
  // state directly. HTF agreement + polarityFlips fall back to current
  // snapshot (v1 simplifications).
  const inputs: RegimeInputs = {
    angle: extractAngleAtBar(histEntry),
    dwell: extractDwellViaTfRegime({ ...primaryRegime, dwell: dwellAtI }),
    boundaryDistance: extractBoundaryDistance({
      ...primaryRegime,
      info: { ...primaryRegime.info, angleDeg: histEntry.angleDeg, gannBracket: histEntry.bracket, direction: histEntry.direction },
    }),
    htfAgreement: extractHtfAgreement(ctx.wireAngle.agreement),
    armPull: extractArmPull(armsAtI),
    poolStrength: extractPoolStrength(enrichedAtI, priceAtI),
    polarityFlips: extractPolarityFlips(ctx.levels),
    touchQuality: extractTouchQuality(enrichedAtI, priceAtI),
    recency: extractRecency(enrichedAtI, priceAtI, candlesUpToI.length),
    feedHealth: extractFeedHealth(),
    liquidationProximity: extractLiquidationProximity(),
    spread: extractSpread(),
    depth: extractDepth(),
    ofi: extractOFI(),
    volumeDelta: extractVolumeDelta(),
    cancelPullRatio: extractCancelPullRatio(),
    realizedVolatility: extractRealizedVolatility(),
    tickDensity: extractTickDensity(),
    absorption: extractAbsorption(),
  };

  const playbooks = {
    accumulation: assessAccumulation(inputs),
    ranging: assessRanging(inputs),
    trending: assessTrending(inputs),
    breakout: assessBreakout(inputs),
  } satisfies Record<Playbook, PlaybookAssessment>;

  const recommended = pickRecommended(playbooks);
  const playbookStrengths: Record<Playbook, number> = {
    accumulation: playbooks.accumulation.strength,
    ranging: playbooks.ranging.strength,
    trending: playbooks.trending.strength,
    breakout: playbooks.breakout.strength,
  };

  return {
    candleIndex: i,
    candleOpenTime,
    bracket: histEntry.bracket,
    recommended,
    playbookStrengths,
  };
}

// === Helpers ===============================================================

function filterPoolsAliveAt(
  pools: AnalysisPool[],
  i: number,
): AnalysisPool[] {
  return pools.filter((p) => {
    if (p.birthCandleIndexOnPrimary < 0) return false; // before window
    if (p.birthCandleIndexOnPrimary > i) return false; // not yet born
    if (
      p.deathCandleIndexOnPrimary !== null &&
      p.deathCandleIndexOnPrimary <= i
    ) {
      return false; // already dead by bar i
    }
    if (
      p.sweptCandleIndexOnPrimary !== null &&
      p.sweptCandleIndexOnPrimary <= i
    ) {
      return false; // already swept by bar i
    }
    return true;
  });
}

// Recompute pull for each alive-at-i pool against the bar-i candle window.
// Mirrors runPullPass but inlined so we don't pull in candle slicing twice.
function enrichWithPullAtBar(
  pools: AnalysisPool[],
  candlesUpToI: Candle[],
  priceAtI: number,
): AnalysisPool[] {
  if (priceAtI <= 0 || pools.length === 0) return pools;

  const cfg = DEFAULT_PULL_PASS_CONFIG;
  const raws = new Map<string, number>();
  const dists = new Map<string, number>();
  const decayCounters = new Map<string, number>();
  for (const pool of pools) {
    const distancePct =
      (Math.abs(priceAtI - pool.centreLine) / priceAtI) * 100;
    const sEff = sEffectiveStandIn(pool.strength);
    const raw = sEff / (distancePct + cfg.distanceFloor);
    raws.set(pool.id, raw);
    dists.set(pool.id, distancePct);
    decayCounters.set(
      pool.id,
      computeCandlesMovingAway(pool, candlesUpToI),
    );
  }

  let maxRaw = 0;
  for (const v of raws.values()) if (v > maxRaw) maxRaw = v;
  if (maxRaw <= 0) return pools;

  return pools.map((pool) => {
    const raw = raws.get(pool.id) ?? 0;
    const normalized = (raw / maxRaw) * 100;
    const cma = decayCounters.get(pool.id) ?? 0;
    const decayed = Math.max(
      cfg.minPullFloor,
      normalized * Math.pow(cfg.decayRate, cma),
    );
    const pull: PoolPull = {
      raw,
      normalized,
      decayed,
      distancePct: dists.get(pool.id) ?? 0,
      candlesMovingAway: cma,
      sEffectiveStandIn: sEffectiveStandIn(pool.strength),
    };
    return { ...pool, pull };
  });
}

// Tiny adapter that mirrors extractInputs.extractAngle but consumes a
// PerBarRegime (not a TfRegime) — the per-bar history entries don't carry
// the full WireAnglePassInfo, just the three fields we need.
function extractAngleAtBar(h: PerBarRegime): RegimeInput<AngleInputValue> {
  return {
    available: true,
    value: {
      angleDeg: h.angleDeg,
      bracket: h.bracket,
      direction: h.direction,
    },
  };
}

// Re-uses the same dwell extractor signature; just keeps the call site
// readable in computeAtBar.
function extractDwellViaTfRegime(tfRegime: TfRegime) {
  return extractDwell(tfRegime);
}

function pickRecommended(
  playbooks: Record<Playbook, PlaybookAssessment>,
): BarRegimeSnapshot["recommended"] {
  let best: { playbook: Playbook; strength: number } | null = null;
  for (const [name, assessment] of Object.entries(playbooks) as Array<
    [Playbook, PlaybookAssessment]
  >) {
    if (!assessment.tradeable) continue;
    if (best === null || assessment.strength > best.strength) {
      best = { playbook: name, strength: assessment.strength };
    }
  }
  return best;
}

// Re-export for tests / introspection.
export { CACHE as REGIME_HISTORY_CACHE_FOR_TESTS };

// Test-only — let unit tests reset the module-level cache between runs.
export function _clearRegimeHistoryCacheForTests(): void {
  CACHE.clear();
}
