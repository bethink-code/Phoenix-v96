import { describe, expect, it } from "vitest";
import { createPosition, submitPosition } from "./createPosition";
import type { TradePlan } from "../decision/types";

const PLAN: TradePlan = {
  timeframe: "15m",
  playbook: "trending",
  phase: "take",
  side: "short",
  entry: 100,
  stop: 105,
  target: 90,
  riskRewardRatio: 2,
  riskPct: 1,
  sizeMultiplier: 0.5,
  anchorPoolId: "pool-1",
  rationale: ["test"],
};

describe("submitPosition", () => {
  it("activates a drafted position immediately without filling it", () => {
    const drafted = createPosition({
      id: "p-1",
      symbol: "BTCUSDT",
      plan: PLAN,
      emittedAtBarTs: 1_000,
    });

    const live = submitPosition(drafted, 10_000, 1_999);

    expect(live.status).toBe("LIVE");
    expect(live.submittedAtBarTs).toBe(1_999);
    expect(live.fillPrice).toBeNull();
    expect(live.filledAtBarTs).toBeNull();
    expect(live.size).toBeGreaterThan(0);
    expect(live.notional).toBeGreaterThan(0);
  });

  it("rejects immediately when sizing cannot be computed", () => {
    const drafted = createPosition({
      id: "p-2",
      symbol: "BTCUSDT",
      plan: { ...PLAN, stop: PLAN.entry },
      emittedAtBarTs: 1_000,
    });

    const rejected = submitPosition(drafted, 10_000, 1_999);

    expect(rejected.status).toBe("REJECTED");
    expect(rejected.exitReason).toBe("sizing");
    expect(rejected.submittedAtBarTs).toBeNull();
  });
});
