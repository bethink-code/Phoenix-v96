// Shared types for the Zenny engine.
// Server imports relative (../shared/zennyTypes); client uses @shared/zennyTypes.

export type Timeframe = "15m" | "1H" | "4H" | "12H" | "D" | "W" | "M";

// The full multi-TF stack analysed in one run (Phase 2 refactor).
// 12H is kept in the type for backwards-compat but is no longer in the
// default analysis stack — Weekly + Monthly matter more for level detection
// than a half-day intermediate.
export const DEFAULT_TIMEFRAME_STACK: Timeframe[] = [
  "15m",
  "1H",
  "4H",
  "D",
  "W",
  "M",
];

// The "trader's four" — these contribute to confluence scoring.
// 15m and 1H are execution-only; their lines render but don't factor
// into confluence count.
export const CONFLUENCE_TIMEFRAMES: Timeframe[] = ["4H", "D", "W", "M"];

// Expected duration of one bar on each timeframe, in milliseconds.
// Used for candle-freshness checks (feedHealth): if the most recent
// candle's openTime is older than ~2× this duration, the feed is
// considered degraded. M is approximated at 30 days.
export const TF_BAR_DURATION_MS: Record<Timeframe, number> = {
  "15m": 15 * 60 * 1000,
  "1H": 60 * 60 * 1000,
  "4H": 4 * 60 * 60 * 1000,
  "12H": 12 * 60 * 60 * 1000,
  D: 24 * 60 * 60 * 1000,
  W: 7 * 24 * 60 * 60 * 1000,
  M: 30 * 24 * 60 * 60 * 1000,
};

export interface Candle {
  openTime: number; // ms epoch, candle open
  closeTime: number; // ms epoch, candle close (exclusive)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type PoolType = "RESISTANCE" | "SUPPORT";
export type PoolStatus = "active" | "dead" | "flipped";
export type DeathReason = "engulfing" | "sustained_break" | "score_exhaustion";

export interface PoolBoundaries {
  wickHigh: number;
  wickLow: number;
  centreLine: number;
}

export interface ScoreBreakdown {
  freshness: number; // 0-25
  departure: number; // 0-20
  depth: number; // 0-15
  volume: number; // 0-15
  liquidation: number; // 0-15
  timeframeConfluence: number; // 0-10
  touchQuality: number; // -5 to +5
  total: number; // sum, max 100 (effective range -5 to 105)
}

export interface Pool {
  id: string;
  tenantId: string;
  symbol: string;
  timeframe: Timeframe;
  type: PoolType;
  boundaries: PoolBoundaries;
  birthCandleTime: number; // ms epoch
  deathCandleTime: number | null;
  deathReason: DeathReason | null;
  status: PoolStatus;
  sEffective: number;
  scoreBreakdown: ScoreBreakdown;
  polarityFlippedFromPoolId: string | null;
}

export interface Level {
  id: string;
  tenantId: string;
  symbol: string;
  timeframe: Timeframe;
  price: number;
  side: "RESISTANCE" | "SUPPORT";
  swingCandleTime: number; // ms epoch
  touchCountInWindow: number;
  source: "extrema" | "tick" | "both";
  poolId: string | null; // FK if graduated to pool
  expiredAt: number | null;
}
