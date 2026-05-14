import { describe, expect, it } from "vitest";
import { createPosition } from "./createPosition";
import { DEFAULT_EXECUTION_CONFIG } from "./executionConfig";
import { reduceStep } from "./reduceStep";
import type { ExecutionBar, PositionRecord } from "./types";
import type { TradePlan } from "../decision/types";

const TF_MS = 60 * 60 * 1000; // 1H
const EQUITY = 10_000;

function plan(opts: {
  side?: "long" | "short";
  entry: number;
  stop: number;
  target: number;
}): TradePlan {
  return {
    timeframe: "1H",
    playbook: "ranging",
    phase: "take",
    side: opts.side ?? "long",
    entry: opts.entry,
    stop: opts.stop,
    target: opts.target,
    riskRewardRatio: Math.abs(opts.target - opts.entry) / Math.abs(opts.entry - opts.stop),
    riskPct: 1,
    sizeMultiplier: 1,
    anchorPoolId: "p1",
    rationale: ["test"],
  };
}

function bar(opts: {
  openTime: number;
  open?: number;
  high: number;
  low: number;
  close?: number;
  gapFilled?: boolean;
}): ExecutionBar {
  return {
    openTime: opts.openTime,
    closeTime: opts.openTime + TF_MS - 1,
    open: opts.open ?? (opts.high + opts.low) / 2,
    high: opts.high,
    low: opts.low,
    close: opts.close ?? (opts.high + opts.low) / 2,
    gapFilled: opts.gapFilled,
  };
}

function newPos(p: TradePlan, emittedAtBarTs = 0): PositionRecord {
  return createPosition({ id: "test-1", symbol: "BTCUSDT", plan: p, emittedAtBarTs });
}

// --- Hard invariants -------------------------------------------------------

describe("reduceStep — hard invariants", () => {
  it("throws when bar.openTime <= lastEvaluatedAt", () => {
    const pos = newPos(plan({ entry: 100, stop: 95, target: 110 }), 1000);
    expect(() =>
      reduceStep({
        position: pos,
        bar: bar({ openTime: 1000, high: 101, low: 99 }),
        equity: EQUITY,
        config: DEFAULT_EXECUTION_CONFIG,
      }),
    ).toThrow(/lookahead/);
  });

  it("throws when equity is zero or negative", () => {
    const pos = newPos(plan({ entry: 100, stop: 95, target: 110 }));
    expect(() =>
      reduceStep({
        position: pos,
        bar: bar({ openTime: TF_MS, high: 101, low: 99 }),
        equity: 0,
        config: DEFAULT_EXECUTION_CONFIG,
      }),
    ).toThrow(/equity/);
  });
});

describe("reduceStep — gap-filled bar", () => {
  it("bumps cursor but does not transition", () => {
    const pos = newPos(plan({ entry: 100, stop: 95, target: 110 }));
    const next = reduceStep({
      position: pos,
      bar: bar({ openTime: TF_MS, high: 101, low: 99, gapFilled: true }),
      equity: EQUITY,
      config: DEFAULT_EXECUTION_CONFIG,
    });
    expect(next.status).toBe("PLANNED");
    expect(next.lastEvaluatedAt).toBe(TF_MS);
  });
});

describe("reduceStep — terminal idempotence", () => {
  it("does not mutate a CLOSED position", () => {
    const pos: PositionRecord = {
      ...newPos(plan({ entry: 100, stop: 95, target: 110 })),
      status: "CLOSED",
    };
    const next = reduceStep({
      position: pos,
      bar: bar({ openTime: TF_MS, high: 200, low: 50 }),
      equity: EQUITY,
      config: DEFAULT_EXECUTION_CONFIG,
    });
    expect(next).toBe(pos); // same reference; literally returned
  });
});

// --- PLANNED → LIVE / REJECTED --------------------------------------------

describe("reduceStep — PLANNED transitions", () => {
  it("PLANNED → LIVE with sizing computed", () => {
    const pos = newPos(plan({ entry: 100, stop: 95, target: 110 }));
    const next = reduceStep({
      position: pos,
      bar: bar({ openTime: TF_MS, high: 96, low: 94 }), // doesn't touch entry
      equity: EQUITY,
      config: DEFAULT_EXECUTION_CONFIG,
    });
    expect(next.status).toBe("LIVE");
    expect(next.size).toBe(20); // (10000 * 0.01 * 1) / |100-95|
    expect(next.notional).toBe(2000);
    expect(next.submittedAtBarTs).toBe(TF_MS);
  });

  it("PLANNED → REJECTED when stop distance is zero", () => {
    const pos = newPos(plan({ entry: 100, stop: 100, target: 110 }));
    const next = reduceStep({
      position: pos,
      bar: bar({ openTime: TF_MS, high: 101, low: 99 }),
      equity: EQUITY,
      config: DEFAULT_EXECUTION_CONFIG,
    });
    expect(next.status).toBe("REJECTED");
    expect(next.exitReason).toBe("sizing");
  });
});

// --- LIVE → FILLED / EXPIRED ----------------------------------------------

describe("reduceStep — LIVE transitions", () => {
  it("does not fill on the bar that submitted the order", () => {
    // PLANNED → LIVE on bar at TF_MS. On bar TF_MS+1*TF_MS, can fill.
    let pos = newPos(plan({ entry: 100, stop: 95, target: 110 }));
    pos = reduceStep({
      position: pos,
      bar: bar({ openTime: TF_MS, high: 101, low: 99 }),
      equity: EQUITY,
      config: DEFAULT_EXECUTION_CONFIG,
    });
    // Should be LIVE — even though the bar's range contains entry, this is
    // the submission bar, so no fill.
    expect(pos.status).toBe("LIVE");
    expect(pos.fillPrice).toBeNull();
  });

  it("LIVE → FILLED on subsequent bar that touches entry", () => {
    let pos = newPos(plan({ entry: 100, stop: 95, target: 110 }));
    pos = reduceStep({
      position: pos,
      bar: bar({ openTime: TF_MS, high: 96, low: 94 }),
      equity: EQUITY,
      config: DEFAULT_EXECUTION_CONFIG,
    });
    expect(pos.status).toBe("LIVE");
    pos = reduceStep({
      position: pos,
      bar: bar({ openTime: 2 * TF_MS, high: 101, low: 99 }),
      equity: EQUITY,
      config: DEFAULT_EXECUTION_CONFIG,
    });
    expect(pos.status).toBe("FILLED");
    expect(pos.fillPrice).toBe(100); // limit fill, no slippage
    expect(pos.filledAtBarTs).toBe(2 * TF_MS);
  });

  it("LIVE → EXPIRED when entryValidBars elapse without fill", () => {
    let pos = newPos(plan({ entry: 100, stop: 95, target: 110 }));
    pos = reduceStep({
      position: pos,
      bar: bar({ openTime: TF_MS, high: 96, low: 94 }),
      equity: EQUITY,
      config: DEFAULT_EXECUTION_CONFIG,
    });
    // After 5 bars without fill (entryValidBars=5), should expire.
    for (let i = 2; i <= 7; i++) {
      pos = reduceStep({
        position: pos,
        bar: bar({ openTime: i * TF_MS, high: 96, low: 94 }), // no touch
        equity: EQUITY,
        config: DEFAULT_EXECUTION_CONFIG,
      });
      if (pos.status === "EXPIRED") break;
    }
    expect(pos.status).toBe("EXPIRED");
    expect(pos.exitReason).toBe("valid-bars-elapsed");
  });
});

// --- FILLED → CLOSED ------------------------------------------------------

describe("reduceStep — FILLED transitions", () => {
  function fillThrough(): PositionRecord {
    let pos = newPos(plan({ entry: 100, stop: 95, target: 110 }));
    pos = reduceStep({
      position: pos,
      bar: bar({ openTime: TF_MS, high: 96, low: 94 }),
      equity: EQUITY,
      config: DEFAULT_EXECUTION_CONFIG,
    });
    pos = reduceStep({
      position: pos,
      bar: bar({ openTime: 2 * TF_MS, high: 101, low: 99 }),
      equity: EQUITY,
      config: DEFAULT_EXECUTION_CONFIG,
    });
    expect(pos.status).toBe("FILLED");
    return pos;
  }

  it("FILLED → CLOSED at stop, PnL = (95*(1-bps) - 100) * size", () => {
    const filled = fillThrough();
    const closed = reduceStep({
      position: filled,
      bar: bar({ openTime: 3 * TF_MS, high: 96, low: 94 }), // stop at 95 inside
      equity: EQUITY,
      config: DEFAULT_EXECUTION_CONFIG,
    });
    expect(closed.status).toBe("CLOSED");
    expect(closed.exitReason).toBe("stop");
    // long stop slips DOWN by 5bps: 95 * (1 - 0.0005) = 94.9525
    expect(closed.closePrice).toBeCloseTo(94.9525, 4);
    // PnL = (94.9525 - 100) × 20 = -100.95
    expect(closed.realisedPnl).toBeCloseTo(-100.95, 2);
  });

  it("FILLED → CLOSED at target, PnL = (110 - 100) * size = +200", () => {
    const filled = fillThrough();
    const closed = reduceStep({
      position: filled,
      bar: bar({ openTime: 3 * TF_MS, high: 111, low: 105 }), // target inside
      equity: EQUITY,
      config: DEFAULT_EXECUTION_CONFIG,
    });
    expect(closed.status).toBe("CLOSED");
    expect(closed.exitReason).toBe("target");
    expect(closed.closePrice).toBe(110); // limit, no slippage
    expect(closed.realisedPnl).toBe(200);
  });

  it("same-bar conflict: stop-wins by default", () => {
    const filled = fillThrough();
    const closed = reduceStep({
      position: filled,
      bar: bar({ openTime: 3 * TF_MS, high: 111, low: 94 }), // BOTH stop AND target inside
      equity: EQUITY,
      config: DEFAULT_EXECUTION_CONFIG,
    });
    expect(closed.exitReason).toBe("stop");
  });

  it("maxBarsInTrade closes at bar.close after N bars", () => {
    const filled = fillThrough();
    const cfg = { ...DEFAULT_EXECUTION_CONFIG, maxBarsInTrade: 2 };
    let pos: PositionRecord = filled;
    for (let i = 3; i <= 6; i++) {
      pos = reduceStep({
        position: pos,
        bar: bar({ openTime: i * TF_MS, high: 105, low: 100, close: 103 }), // no stop/target
        equity: EQUITY,
        config: cfg,
      });
      if (pos.status === "CLOSED") break;
    }
    expect(pos.status).toBe("CLOSED");
    expect(pos.exitReason).toBe("operator");
  });
});

describe("reduceStep — short side", () => {
  it("short trade: entry above, stop above, target below; PnL flips sign", () => {
    let pos = newPos(plan({ side: "short", entry: 100, stop: 105, target: 90 }));
    pos = reduceStep({
      position: pos,
      bar: bar({ openTime: TF_MS, high: 96, low: 94 }),
      equity: EQUITY,
      config: DEFAULT_EXECUTION_CONFIG,
    });
    expect(pos.status).toBe("LIVE");
    pos = reduceStep({
      position: pos,
      bar: bar({ openTime: 2 * TF_MS, high: 101, low: 99 }),
      equity: EQUITY,
      config: DEFAULT_EXECUTION_CONFIG,
    });
    expect(pos.status).toBe("FILLED");
    pos = reduceStep({
      position: pos,
      bar: bar({ openTime: 3 * TF_MS, high: 95, low: 89 }), // target at 90 inside
      equity: EQUITY,
      config: DEFAULT_EXECUTION_CONFIG,
    });
    expect(pos.status).toBe("CLOSED");
    expect(pos.exitReason).toBe("target");
    // short: PnL = (entry - exit) * size = (100 - 90) * 20 = +200
    expect(pos.realisedPnl).toBe(200);
  });

  it("short entry fills when the next bar stays entirely above the limit", () => {
    let pos = newPos(plan({ side: "short", entry: 100, stop: 105, target: 90 }));
    pos = reduceStep({
      position: pos,
      bar: bar({ openTime: TF_MS, high: 96, low: 94 }),
      equity: EQUITY,
      config: DEFAULT_EXECUTION_CONFIG,
    });
    expect(pos.status).toBe("LIVE");
    pos = reduceStep({
      position: pos,
      bar: bar({ openTime: 2 * TF_MS, high: 106, low: 101 }),
      equity: EQUITY,
      config: DEFAULT_EXECUTION_CONFIG,
    });
    expect(pos.status).toBe("FILLED");
    expect(pos.fillPrice).toBe(100);
  });
});
