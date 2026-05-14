import { describe, expect, it } from "vitest";
import type { TradePlan } from "./types";
import { selectTradePlansForTimeframe } from "./selectTradePlans";

function plan(overrides: Partial<TradePlan>): TradePlan {
  return {
    timeframe: "15m",
    playbook: "trending",
    phase: "take",
    side: "short",
    entry: 100,
    stop: 101,
    target: 98,
    target2: null,
    riskRewardRatio: 2,
    riskPct: 1,
    sizeMultiplier: 1,
    anchorPoolId: "pool-1",
    rationale: [],
    ...overrides,
  };
}

describe("selectTradePlansForTimeframe", () => {
  it("keeps the more actionable plan when opposing candidates coexist", () => {
    const take = plan({
      phase: "take",
      side: "short",
      entry: 81.03,
      stop: 81.43,
      target: 79.28,
      riskRewardRatio: 4.3,
      sizeMultiplier: 0.5,
    });
    const reach = plan({
      phase: "reach",
      side: "long",
      entry: 79.51,
      stop: 79.17,
      target: 81.27,
      riskRewardRatio: 5.1,
      sizeMultiplier: 1,
    });

    const selected = selectTradePlansForTimeframe([take, reach], 80.81);

    expect(selected).toHaveLength(1);
    expect(selected[0]).toBe(take);
  });

  it("can prefer REACH when it is materially closer in risk units", () => {
    const take = plan({
      phase: "take",
      side: "short",
      entry: 114.25,
      stop: 115.5,
      target: 94,
      riskRewardRatio: 16.2,
      sizeMultiplier: 0.5,
    });
    const reach = plan({
      phase: "reach",
      side: "long",
      entry: 99,
      stop: 91.5,
      target: 111.5,
      riskRewardRatio: 1.67,
    });

    const selected = selectTradePlansForTimeframe([take, reach], 100);

    expect(selected).toHaveLength(1);
    expect(selected[0]).toBe(reach);
  });

  it("breaks near ties by reward/risk and then phase priority", () => {
    const betterReach = plan({
      phase: "reach",
      side: "long",
      entry: 99,
      stop: 98.5,
      target: 100.8,
      riskRewardRatio: 3.6,
      sizeMultiplier: 0.8,
    });
    const weakerTake = plan({
      phase: "take",
      side: "short",
      entry: 101,
      stop: 101.5,
      target: 99.6,
      riskRewardRatio: 2.8,
      sizeMultiplier: 0.8,
    });

    const firstPass = selectTradePlansForTimeframe(
      [weakerTake, betterReach],
      100,
    );
    expect(firstPass[0]).toBe(betterReach);

    const tiedReach = plan({
      phase: "reach",
      side: "long",
      entry: 99,
      stop: 98.5,
      target: 100,
      riskRewardRatio: 2,
      sizeMultiplier: 1,
    });
    const tiedTake = plan({
      phase: "take",
      side: "short",
      entry: 101,
      stop: 101.5,
      target: 100,
      riskRewardRatio: 2,
      sizeMultiplier: 1,
    });

    const secondPass = selectTradePlansForTimeframe([tiedReach, tiedTake], 100);
    expect(secondPass[0]).toBe(tiedTake);
  });
});
