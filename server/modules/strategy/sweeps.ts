import type { Candle, Level, SweepEvent } from "./types";

// PRD §5 liquidity sweep detection. Pure function.
//
// A "sweep" is a candle that:
//   - wicks through a liquidity level (high pokes above a resistance, or low
//     pokes below a support)
//   - and, for Mode B confirmation, closes back inside the level
//
// Mode A (survive the sweep): enter at the level, accept the wick stop-out.
// Mode B (trade the confirmation): wait for the close-back, then enter with
// a tighter structural stop beyond the wick.

export interface SweepConfig {
  // How far the wick must protrude beyond the level (as % of price) to count.
  // Tiny pokes from noise don't qualify.
  minWickProtrusionPct: number;
}

export const DEFAULT_SWEEP_CONFIG: SweepConfig = {
  minWickProtrusionPct: 0.02, // 2 bps — noise floor for crypto
};

// Returns sweeps that occurred inside the candle window against the supplied
// levels. Typically called on a rolling window — "did the last candle sweep
// anything?".
export function detectSweeps(
  candles: Candle[],
  levels: Level[],
  config: SweepConfig = DEFAULT_SWEEP_CONFIG
): SweepEvent[] {
  const out: SweepEvent[] = [];
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    for (const lvl of levels) {
      // Can't sweep a level that didn't exist yet
      if (lvl.firstSeenAt > c.openTime) continue;

      if (lvl.side === "resistance") {
        const protrusion = ((c.high - lvl.price) / lvl.price) * 100;
        if (c.high > lvl.price && protrusion >= config.minWickProtrusionPct) {
          out.push({
            candleIndex: i,
            candleTime: c.openTime,
            direction: "up",
            level: lvl,
            wickExtreme: c.high,
            closeBackPrice: c.close,
            closedBack: c.close < lvl.price, // closed back inside = Mode B valid
          });
        }
      } else {
        const protrusion = ((lvl.price - c.low) / lvl.price) * 100;
        if (c.low < lvl.price && protrusion >= config.minWickProtrusionPct) {
          out.push({
            candleIndex: i,
            candleTime: c.openTime,
            direction: "down",
            level: lvl,
            wickExtreme: c.low,
            closeBackPrice: c.close,
            closedBack: c.close > lvl.price,
          });
        }
      }
    }
  }
  return out;
}

// Just the sweep on the most recent candle, if any. This is what the bot
// runner uses on every tick.
export function detectLatestSweep(
  candles: Candle[],
  levels: Level[],
  config: SweepConfig = DEFAULT_SWEEP_CONFIG
): SweepEvent | null {
  if (candles.length === 0) return null;
  const last = candles.length - 1;
  const sweeps = detectSweeps(candles.slice(last), levels, config);
  // detectSweeps returned candleIndex=0 because we sliced; remap to real index
  if (sweeps.length === 0) return null;
  // Prefer the sweep against the highest-ranked level
  sweeps.sort((a, b) => b.level.rank - a.level.rank);
  return { ...sweeps[0], candleIndex: last };
}
