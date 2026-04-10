import type { Regime } from "../../shared/schema";

// PRD §4.1 Regime Engine. Pure functions — no DB, no side effects. The
// active regime is stored on the tenant row and mutated via storage, but the
// *rules* of each regime live here and stay framework-free.

export type SetupMode = "mode_a" | "mode_b";

export interface RegimeProfile {
  regime: Regime;
  label: string;
  character: string;
  botBehaviour: string;
  permittedModes: SetupMode[];
  minRiskRewardRatio: number;
  sizeMultiplier: number;
  entrySuppressed: boolean;
  colour: string; // UI colour token
}

export const REGIME_PROFILES: Record<Regime, RegimeProfile> = {
  no_trade: {
    regime: "no_trade",
    label: "NO TRADE",
    character:
      "Unclear, transitional, or unclassified. Market does not fit a known pattern.",
    botBehaviour:
      "All entries suppressed. Existing positions managed to exit. Bot is silent.",
    permittedModes: [],
    minRiskRewardRatio: 0,
    sizeMultiplier: 0,
    entrySuppressed: true,
    colour: "notrade",
  },
  ranging: {
    regime: "ranging",
    label: "Ranging",
    character:
      "Price oscillating between defined upper and lower liquidity pools. Sweeps reverse predictably. Highest-probability environment for the core strategy.",
    botBehaviour:
      "Full strategy active. Both sides tradeable. Tighter targets — fade back to range midpoint or opposite boundary.",
    permittedModes: ["mode_a", "mode_b"],
    minRiskRewardRatio: 2.0,
    sizeMultiplier: 1.0,
    entrySuppressed: false,
    colour: "ranging",
  },
  trending: {
    regime: "trending",
    label: "Trending",
    character:
      "Directional structure. Sweeps tend to continue rather than reverse cleanly.",
    botBehaviour:
      "Strategy active in trend direction only. Counter-trend setups suppressed. Mode B preferred. Larger targets.",
    permittedModes: ["mode_b"],
    minRiskRewardRatio: 2.5,
    sizeMultiplier: 1.0,
    entrySuppressed: false,
    colour: "trending",
  },
  breakout: {
    regime: "breakout",
    label: "Breakout",
    character:
      "Price has ranged and is beginning to commit to a direction. Highest false-signal environment.",
    botBehaviour:
      "Reduced activity. Only highest-rank levels considered. Position size reduced. Mode A suppressed — confirmation entries only.",
    permittedModes: ["mode_b"],
    minRiskRewardRatio: 3.0,
    sizeMultiplier: 0.5,
    entrySuppressed: false,
    colour: "breakout",
  },
  high_volatility: {
    regime: "high_volatility",
    label: "High Volatility",
    character:
      "News-driven, erratic. Levels blown through without respect. Manipulation amplified.",
    botBehaviour:
      "All entries suppressed. Tighter emergency stops on any open positions. State flagged prominently.",
    permittedModes: [],
    minRiskRewardRatio: 0,
    sizeMultiplier: 0,
    entrySuppressed: true,
    colour: "volatile",
  },
  low_liquidity: {
    regime: "low_liquidity",
    label: "Low Liquidity",
    character:
      "Weekend, public holiday, or thin session. Order book shallow. Moves can be exaggerated.",
    botBehaviour:
      "Entries suppressed or heavily restricted. Existing positions may be closed at session end.",
    permittedModes: [],
    minRiskRewardRatio: 0,
    sizeMultiplier: 0,
    entrySuppressed: true,
    colour: "notrade",
  },
  accumulation_distribution: {
    regime: "accumulation_distribution",
    label: "Accumulation / Distribution",
    character:
      "Smart money positioning. Sweep failures expected to be higher. Appears similar to ranging but more aggressive.",
    botBehaviour:
      "Strategy active with caution flags. Position sizing reduced. Both modes permitted but R:R minimums raised.",
    permittedModes: ["mode_a", "mode_b"],
    minRiskRewardRatio: 2.5,
    sizeMultiplier: 0.75,
    entrySuppressed: false,
    colour: "ranging",
  },
};

export function getRegimeProfile(regime: Regime): RegimeProfile {
  return REGIME_PROFILES[regime];
}

export function listRegimes(): RegimeProfile[] {
  return Object.values(REGIME_PROFILES);
}

// The central rule: if true, the Regime Engine has said "don't even look".
// Called before the strategy engine looks for setups. PRD §4.1 DEFAULT STATE.
export function entryPermitted(regime: Regime): boolean {
  return !REGIME_PROFILES[regime].entrySuppressed;
}
