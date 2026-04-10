import type { Candle, Level, LevelType } from "./types";

// PRD §5.2 Level identification. Pure functions — no I/O, no state.
// Input: chronologically ordered OHLCV candles (oldest first).
// Output: ranked levels sorted by rank desc, price asc.
//
// The strategy looks for liquidity clusters: places where stops pile up.
// Those are swing points, equal highs/lows, previous-period extremes, and
// session extremes. Confluence (multiple types near the same price) boosts
// rank.

export interface LevelConfig {
  swingLookback: number; // candles on each side for swing detection
  equalTolerancePct: number; // % tolerance to consider two highs "equal"
  mergeTolerancePct: number; // % tolerance to merge nearby levels of diff types
  minTouches: number;
}

export const DEFAULT_LEVEL_CONFIG: LevelConfig = {
  swingLookback: 5,
  equalTolerancePct: 0.05, // 5 bps — tight for crypto
  mergeTolerancePct: 0.1, // 10 bps
  minTouches: 1,
};

// ---------- Swing points ----------

export function findSwingHighs(
  candles: Candle[],
  lookback = DEFAULT_LEVEL_CONFIG.swingLookback
): Level[] {
  const out: Level[] = [];
  for (let i = lookback; i < candles.length - lookback; i++) {
    const c = candles[i];
    let isSwing = true;
    for (let j = 1; j <= lookback; j++) {
      if (candles[i - j].high >= c.high || candles[i + j].high >= c.high) {
        isSwing = false;
        break;
      }
    }
    if (isSwing) {
      out.push(level("swing_high", "resistance", c.high, c.openTime));
    }
  }
  return out;
}

export function findSwingLows(
  candles: Candle[],
  lookback = DEFAULT_LEVEL_CONFIG.swingLookback
): Level[] {
  const out: Level[] = [];
  for (let i = lookback; i < candles.length - lookback; i++) {
    const c = candles[i];
    let isSwing = true;
    for (let j = 1; j <= lookback; j++) {
      if (candles[i - j].low <= c.low || candles[i + j].low <= c.low) {
        isSwing = false;
        break;
      }
    }
    if (isSwing) {
      out.push(level("swing_low", "support", c.low, c.openTime));
    }
  }
  return out;
}

// ---------- Equal highs / lows ----------
//
// "Equal" means within a small % tolerance. Groups of 2+ touches at the same
// price form equal-high/low levels — classic stop cluster zones.

export function findEqualHighs(candles: Candle[], tolerancePct: number): Level[] {
  return clusterByPrice(
    candles.map((c) => ({ price: c.high, at: c.openTime })),
    tolerancePct
  ).map((g) =>
    level(
      "equal_high",
      "resistance",
      average(g.map((p) => p.price)),
      g[0].at,
      g[g.length - 1].at,
      g.length
    )
  );
}

export function findEqualLows(candles: Candle[], tolerancePct: number): Level[] {
  return clusterByPrice(
    candles.map((c) => ({ price: c.low, at: c.openTime })),
    tolerancePct
  ).map((g) =>
    level(
      "equal_low",
      "support",
      average(g.map((p) => p.price)),
      g[0].at,
      g[g.length - 1].at,
      g.length
    )
  );
}

// ---------- Previous period extremes ----------

export function findPrevDayLevels(candles: Candle[]): Level[] {
  const byDay = groupByDay(candles);
  const out: Level[] = [];
  const days = Array.from(byDay.keys()).sort();
  if (days.length < 2) return out;
  // Only keep the most recent completed day
  const prev = byDay.get(days[days.length - 2])!;
  const high = Math.max(...prev.map((c) => c.high));
  const low = Math.min(...prev.map((c) => c.low));
  const at = prev[0].openTime;
  out.push(level("prev_day_high", "resistance", high, at));
  out.push(level("prev_day_low", "support", low, at));
  return out;
}

export function findPrevWeekLevels(candles: Candle[]): Level[] {
  const byWeek = groupByWeek(candles);
  const out: Level[] = [];
  const weeks = Array.from(byWeek.keys()).sort();
  if (weeks.length < 2) return out;
  const prev = byWeek.get(weeks[weeks.length - 2])!;
  const high = Math.max(...prev.map((c) => c.high));
  const low = Math.min(...prev.map((c) => c.low));
  const at = prev[0].openTime;
  out.push(level("prev_week_high", "resistance", high, at));
  out.push(level("prev_week_low", "support", low, at));
  return out;
}

// ---------- Pipeline ----------
//
// Runs every detector, merges nearby levels into confluence-ranked groups,
// returns sorted output. This is what the strategy engine calls.

export function identifyLevels(
  candles: Candle[],
  config: LevelConfig = DEFAULT_LEVEL_CONFIG
): Level[] {
  if (candles.length < config.swingLookback * 2 + 1) return [];

  const raw: Level[] = [
    ...findSwingHighs(candles, config.swingLookback),
    ...findSwingLows(candles, config.swingLookback),
    ...findEqualHighs(candles, config.equalTolerancePct),
    ...findEqualLows(candles, config.equalTolerancePct),
    ...findPrevDayLevels(candles),
    ...findPrevWeekLevels(candles),
  ];

  const merged = mergeConfluentLevels(raw, config.mergeTolerancePct);

  // Count touches after merging — how often did any candle interact
  // with the level's price.
  for (const lvl of merged) {
    lvl.touches = countTouches(candles, lvl.price, config.equalTolerancePct);
    lvl.rank = rankLevel(lvl);
  }

  return merged
    .filter((l) => l.touches >= config.minTouches)
    .sort((a, b) => b.rank - a.rank || a.price - b.price);
}

// ---------- Merging + ranking ----------

function mergeConfluentLevels(levels: Level[], tolerancePct: number): Level[] {
  const sorted = [...levels].sort((a, b) => a.price - b.price);
  const merged: Level[] = [];
  for (const l of sorted) {
    const last = merged[merged.length - 1];
    if (last && withinTolerance(last.price, l.price, tolerancePct)) {
      // Merge: accumulate components, keep earliest firstSeenAt, latest lastSeenAt
      last.components = [...(last.components ?? [last.type]), l.type];
      last.price = (last.price + l.price) / 2;
      last.firstSeenAt = Math.min(last.firstSeenAt, l.firstSeenAt);
      last.lastSeenAt = Math.max(last.lastSeenAt, l.lastSeenAt);
    } else {
      merged.push({ ...l, components: [l.type] });
    }
  }
  return merged;
}

function rankLevel(l: Level): number {
  // Base rank by type. Previous-period extremes are the most reliable.
  const baseByType: Record<LevelType, number> = {
    prev_week_high: 4,
    prev_week_low: 4,
    prev_day_high: 3,
    prev_day_low: 3,
    equal_high: 3,
    equal_low: 3,
    session_high: 2,
    session_low: 2,
    swing_high: 2,
    swing_low: 2,
  };
  const base = Math.max(...(l.components ?? [l.type]).map((t) => baseByType[t]));
  // Confluence bonus: each extra component type adds 1, capped at 5
  const confluence = new Set(l.components ?? [l.type]).size - 1;
  // Touch bonus: small multiplier, capped
  const touch = Math.min(2, Math.floor(l.touches / 3));
  return Math.min(5, base + confluence + touch);
}

// ---------- Helpers ----------

function level(
  type: LevelType,
  side: "resistance" | "support",
  price: number,
  firstSeenAt: number,
  lastSeenAt?: number,
  touches?: number
): Level {
  return {
    id: `${type}:${price.toFixed(2)}`,
    type,
    side,
    price,
    rank: 1,
    touches: touches ?? 1,
    firstSeenAt,
    lastSeenAt: lastSeenAt ?? firstSeenAt,
  };
}

function withinTolerance(a: number, b: number, tolerancePct: number): boolean {
  if (a === 0) return b === 0;
  return (Math.abs(a - b) / a) * 100 <= tolerancePct;
}

function clusterByPrice(
  points: { price: number; at: number }[],
  tolerancePct: number
): { price: number; at: number }[][] {
  const sorted = [...points].sort((a, b) => a.price - b.price);
  const groups: { price: number; at: number }[][] = [];
  for (const p of sorted) {
    const last = groups[groups.length - 1];
    if (last && withinTolerance(last[last.length - 1].price, p.price, tolerancePct)) {
      last.push(p);
    } else {
      groups.push([p]);
    }
  }
  return groups.filter((g) => g.length >= 2);
}

function countTouches(candles: Candle[], price: number, tolerancePct: number): number {
  let n = 0;
  for (const c of candles) {
    if (
      withinTolerance(c.high, price, tolerancePct) ||
      withinTolerance(c.low, price, tolerancePct) ||
      (c.low <= price && c.high >= price)
    ) {
      n++;
    }
  }
  return n;
}

function groupByDay(candles: Candle[]): Map<string, Candle[]> {
  const m = new Map<string, Candle[]>();
  for (const c of candles) {
    const d = new Date(c.openTime);
    const key = `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
    if (!m.has(key)) m.set(key, []);
    m.get(key)!.push(c);
  }
  return m;
}

function groupByWeek(candles: Candle[]): Map<string, Candle[]> {
  const m = new Map<string, Candle[]>();
  for (const c of candles) {
    const d = new Date(c.openTime);
    const year = d.getUTCFullYear();
    const week = isoWeek(d);
    const key = `${year}-W${week}`;
    if (!m.has(key)) m.set(key, []);
    m.get(key)!.push(c);
  }
  return m;
}

function isoWeek(d: Date): number {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function average(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}
