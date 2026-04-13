// Shared types for the Zenny engine.
// Server imports relative (../shared/zennyTypes); client uses @shared/zennyTypes.

export type Timeframe = "15m" | "1H" | "4H" | "12H" | "D";

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
