import { describe, expect, it } from "vitest";
import {
  applyFillRules,
  checkEntryFill,
  checkStopFill,
  checkTargetFill,
} from "./applyFillRules";
import type { ExecutionBar } from "./types";

const bar = (low: number, high: number): ExecutionBar => ({
  openTime: 1000,
  closeTime: 1999,
  open: (low + high) / 2,
  high,
  low,
  close: (low + high) / 2,
});

describe("applyFillRules — directional triggers", () => {
  it("returns null when a long entry never trades down to the limit", () => {
    const r = applyFillRules({
      orderKind: "entry-limit",
      orderPrice: 100,
      side: "long",
      bar: bar(101, 104),
      slippageBps: 5,
      applySlippageToLimits: false,
    });
    expect(r).toBeNull();
  });

  it("long entry limit fills when the bar trades through it", () => {
    const r = applyFillRules({
      orderKind: "entry-limit",
      orderPrice: 100,
      side: "long",
      bar: bar(99, 101),
      slippageBps: 5,
      applySlippageToLimits: false,
    });
    expect(r).not.toBeNull();
    expect(r!.fillPrice).toBe(100);
  });

  it("short entry limit fills when the bar stays entirely above the order", () => {
    const r = applyFillRules({
      orderKind: "entry-limit",
      orderPrice: 100,
      side: "short",
      bar: bar(101, 105),
      slippageBps: 5,
      applySlippageToLimits: false,
    });
    expect(r).not.toBeNull();
    expect(r!.fillPrice).toBe(100);
  });

  it("stop fill (long): slips DOWN by bps", () => {
    const r = applyFillRules({
      orderKind: "stop-market",
      orderPrice: 100,
      side: "long",
      bar: bar(95, 99),
      slippageBps: 5,
      applySlippageToLimits: false,
    });
    expect(r!.fillPrice).toBeCloseTo(100 * (1 - 5 / 10_000), 6);
  });

  it("stop fill (short): slips UP by bps", () => {
    const r = applyFillRules({
      orderKind: "stop-market",
      orderPrice: 100,
      side: "short",
      bar: bar(101, 106),
      slippageBps: 5,
      applySlippageToLimits: false,
    });
    expect(r!.fillPrice).toBeCloseTo(100 * (1 + 5 / 10_000), 6);
  });

  it("short target limit fills when price gaps below the target", () => {
    const r = applyFillRules({
      orderKind: "target-limit",
      orderPrice: 100,
      side: "short",
      bar: bar(94, 98),
      slippageBps: 5,
      applySlippageToLimits: false,
    });
    expect(r).not.toBeNull();
    expect(r!.fillPrice).toBe(100);
  });

  it("limit slippage applies when opted in", () => {
    const r = applyFillRules({
      orderKind: "target-limit",
      orderPrice: 100,
      side: "long",
      bar: bar(99, 101),
      slippageBps: 5,
      applySlippageToLimits: true,
    });
    expect(r!.fillPrice).toBeCloseTo(100 * (1 - 5 / 10_000), 6);
  });
});

describe("checkStopFill / checkTargetFill helpers", () => {
  const cfg = {
    fillMode: "next-bar-touch" as const,
    sameBarConflict: "stop-wins" as const,
    slippageBps: 5,
    applySlippageToLimits: false,
    entryValidBars: 5,
    trailMode: "static" as const,
    maxBarsInTrade: null,
    softKillDrawdownPct: 20,
    hardKillDrawdownPct: 30,
    killSwitchReference: "peak" as const,
  };

  it("stop and target both inside bar range yield non-null results", () => {
    const stop = checkStopFill({
      side: "long",
      bar: bar(94, 106),
      stopPrice: 95,
      config: cfg,
    });
    const target = checkTargetFill({
      side: "long",
      bar: bar(94, 106),
      targetPrice: 105,
      config: cfg,
    });
    expect(stop).not.toBeNull();
    expect(target).not.toBeNull();
  });

  it("checkEntryFill recognises a short limit order that is already through", () => {
    const entry = checkEntryFill({
      side: "short",
      bar: bar(101, 106),
      entryPrice: 100,
      config: cfg,
    });
    expect(entry).not.toBeNull();
    expect(entry!.fillPrice).toBe(100);
  });
});
