// Portfolio-aware risk presets. Pure functions, no I/O. The user enters
// one number — capital — and the engine derives every other risk parameter
// from a tiered preset. Saves the user from having to understand min order
// sizes, drawdown math, R:R discipline, etc.
//
// PRD §2 anchor: "Start small. The system must be designed for a small
// initial allocation that the trader is comfortable losing entirely." The
// tiers honour that anchor while making each tier internally coherent.

export type PortfolioTier = "tiny" | "small" | "medium" | "large";

export interface TierDefaults {
  riskPercentPerTrade: string; // numeric string for Drizzle
  maxConcurrentPositions: number;
  minRiskRewardRatio: string;
  minLevelRank: number;
  dailyDrawdownLimitPct: string;
  weeklyDrawdownLimitPct: string;
}

// Bands chosen so the user crosses a tier when they roughly graduate from
// "throw-away amount" → "starter capital" → "real money" → "serious money".
export function tierFor(capital: number): PortfolioTier {
  if (capital < 500) return "tiny";
  if (capital < 5_000) return "small";
  if (capital < 50_000) return "medium";
  return "large";
}

export function tierDefaults(tier: PortfolioTier): TierDefaults {
  switch (tier) {
    case "tiny":
      // Higher risk %, looser thresholds, only one trade at a time so the
      // user can actually follow what's happening. Daily drawdown is
      // wider so the user gets some runway to learn.
      return {
        riskPercentPerTrade: "2.000",
        maxConcurrentPositions: 1,
        minRiskRewardRatio: "1.50",
        minLevelRank: 1,
        dailyDrawdownLimitPct: "5.00",
        weeklyDrawdownLimitPct: "10.00",
      };
    case "small":
      return {
        riskPercentPerTrade: "1.500",
        maxConcurrentPositions: 2,
        minRiskRewardRatio: "2.00",
        minLevelRank: 2,
        dailyDrawdownLimitPct: "4.00",
        weeklyDrawdownLimitPct: "8.00",
      };
    case "medium":
      // The PRD's default config. Standard discipline.
      return {
        riskPercentPerTrade: "1.000",
        maxConcurrentPositions: 2,
        minRiskRewardRatio: "2.00",
        minLevelRank: 2,
        dailyDrawdownLimitPct: "3.00",
        weeklyDrawdownLimitPct: "6.00",
      };
    case "large":
      // Conservative — at this scale preserving real money matters more
      // than catching every setup.
      return {
        riskPercentPerTrade: "0.500",
        maxConcurrentPositions: 3,
        minRiskRewardRatio: "2.50",
        minLevelRank: 3,
        dailyDrawdownLimitPct: "2.00",
        weeklyDrawdownLimitPct: "4.00",
      };
  }
}

export function tierLabel(tier: PortfolioTier): string {
  return { tiny: "Tiny", small: "Small", medium: "Medium", large: "Large" }[tier];
}

export function tierDescription(tier: PortfolioTier): string {
  switch (tier) {
    case "tiny":
      return "Throwaway amount. One trade at a time, slightly higher risk %, looser filters so you actually see setups fire. The bot is teaching, not optimising.";
    case "small":
      return "Starter capital. Two concurrent positions, tight R:R discipline. The strategy starts behaving like it would on a real account.";
    case "medium":
      return "Real money territory. Standard 1% risk, 2:1 R:R, 3% daily / 6% weekly drawdown. This is the PRD's default risk envelope.";
    case "large":
      return "Serious capital. Half a percent risk, stricter filters, lower drawdown ceiling. Preservation matters more than activity.";
  }
}
