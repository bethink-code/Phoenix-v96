import { describe, it, expect } from "vitest";
import {
  strengthFromTouches,
  strengthFromRecency,
  combinedLevelStrength,
  STRENGTH_RANK,
} from "./strength";

describe("strengthFromTouches", () => {
  it("trivial for 0 or 1 touch", () => {
    expect(strengthFromTouches(0)).toBe("trivial");
    expect(strengthFromTouches(1)).toBe("trivial");
  });
  it("weak for 2", () => {
    expect(strengthFromTouches(2)).toBe("weak");
  });
  it("medium for 3 (boundary)", () => {
    expect(strengthFromTouches(3)).toBe("medium");
  });
  it("strong for 4-5", () => {
    expect(strengthFromTouches(4)).toBe("strong");
    expect(strengthFromTouches(5)).toBe("strong");
  });
  it("very_strong for 6+ (boundary)", () => {
    expect(strengthFromTouches(6)).toBe("very_strong");
    expect(strengthFromTouches(100)).toBe("very_strong");
  });
});

describe("strengthFromRecency", () => {
  it("trivial for old levels", () => {
    expect(strengthFromRecency(0)).toBe("trivial");
    expect(strengthFromRecency(0.5)).toBe("trivial");
    expect(strengthFromRecency(0.69)).toBe("trivial");
  });
  it("medium at 0.70 (boundary)", () => {
    expect(strengthFromRecency(0.7)).toBe("medium");
  });
  it("strong at 0.85 (boundary)", () => {
    expect(strengthFromRecency(0.85)).toBe("strong");
  });
  it("very_strong at 0.95 (boundary)", () => {
    expect(strengthFromRecency(0.95)).toBe("very_strong");
    expect(strengthFromRecency(1.0)).toBe("very_strong");
  });
});

describe("combinedLevelStrength", () => {
  it("returns the max of the two tiers", () => {
    // High touches, low recency → historical wins
    expect(combinedLevelStrength(6, 0.1)).toBe("very_strong");
    // Low touches, high recency → recency wins
    expect(combinedLevelStrength(1, 0.97)).toBe("very_strong");
    // Both medium → medium
    expect(combinedLevelStrength(3, 0.75)).toBe("medium");
  });

  it("the dramatic untaken-liquidity case: 1 touch + recent", () => {
    // The user's $58k example: dramatic swing low, zero retests, very recent
    expect(combinedLevelStrength(1, 0.97)).toBe("very_strong");
  });

  it("an old retested level still wins on history", () => {
    // 6 touches but at the very start of the window
    expect(combinedLevelStrength(6, 0.0)).toBe("very_strong");
  });

  it("trivial when both are weak", () => {
    expect(combinedLevelStrength(0, 0.5)).toBe("trivial");
  });
});

describe("STRENGTH_RANK", () => {
  it("orders tiers from weakest to strongest", () => {
    expect(STRENGTH_RANK.trivial).toBeLessThan(STRENGTH_RANK.weak);
    expect(STRENGTH_RANK.weak).toBeLessThan(STRENGTH_RANK.medium);
    expect(STRENGTH_RANK.medium).toBeLessThan(STRENGTH_RANK.strong);
    expect(STRENGTH_RANK.strong).toBeLessThan(STRENGTH_RANK.very_strong);
  });
});
