// Shared types for the strategy engine. Kept in one file to avoid a web of
// cross-module imports as level ID, sweep detection, and entry/exit grow.

export interface Candle {
  openTime: number; // ms epoch
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
}

export type LevelType =
  | "swing_high"
  | "swing_low"
  | "equal_high"
  | "equal_low"
  | "prev_day_high"
  | "prev_day_low"
  | "prev_week_high"
  | "prev_week_low"
  | "session_high"
  | "session_low";

export type LevelSide = "resistance" | "support";

export interface Level {
  id: string; // stable-ish id derived from type + price
  type: LevelType;
  side: LevelSide;
  price: number;
  rank: number; // 1 = weakest, 5 = strongest; confluence boosts this
  touches: number; // how many candles interacted with this level
  firstSeenAt: number; // ms
  lastSeenAt: number; // ms
  components?: LevelType[]; // if this level was merged from multiple types
}

export type SweepDirection = "up" | "down";

export interface SweepEvent {
  candleIndex: number;
  candleTime: number;
  direction: SweepDirection; // up = wick through a high; down = wick through a low
  level: Level;
  wickExtreme: number; // the high (up) or low (down) of the sweeping candle
  closeBackPrice: number; // the close of the sweeping candle
  closedBack: boolean; // true if close returned inside the level (Mode B confirmation)
}
