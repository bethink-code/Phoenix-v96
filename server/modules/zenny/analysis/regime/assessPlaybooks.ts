// Per-playbook assessment — each playbook weights the input contract
// differently, because different signals matter for different setups.
//
// A breakout playbook cares about momentum + volume expansion + freshness
// of the bracket transition. A ranging playbook cares about clean pool
// extremes + balanced flow. The weights below capture that mental model.
//
// Each input contributes a SIGNAL (mapped to [-1..+1] by an input-specific
// rule) which gets multiplied by its weight to produce a CONTRIBUTION. Sum
// of contributions, clipped to [0..1], = the playbook's STRENGTH. The
// CONFIDENCE separately tracks how complete the evidence is (sum of weights
// for available inputs / total weights).
//
// Tradeable = strength ≥ TRADEABLE_THRESHOLD AND no veto fires. Vetoes are
// hard fails (e.g., bracket = NO_TRADE blocks every playbook).

import type {
  AssessmentDriver,
  PlaybookAssessment,
  RegimeInputs,
} from "./types";

const TRADEABLE_THRESHOLD = 0.4;

type WeightTable = Partial<Record<keyof RegimeInputs, number>>;
type SignalFn = (inputs: RegimeInputs) => number; // -1..+1
type SignalTable = Partial<Record<keyof RegimeInputs, SignalFn>>;

interface PlaybookSpec {
  name: PlaybookAssessment["playbook"];
  weights: WeightTable;
  signals: SignalTable;
  vetoes: Array<(inputs: RegimeInputs) => string | null>;
}

// Helper — clamp to [0, 1].
function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

// Helper — clamp to [-1, +1].
function clampPM(x: number): number {
  return Math.max(-1, Math.min(1, x));
}

function runPlaybook(
  spec: PlaybookSpec,
  inputs: RegimeInputs,
): PlaybookAssessment {
  // Step 1 — build drivers, one per weighted input.
  const drivers: AssessmentDriver[] = [];
  let availableWeight = 0;
  let totalWeight = 0;
  let positiveContribution = 0;
  for (const [name, weight] of Object.entries(spec.weights) as Array<
    [keyof RegimeInputs, number]
  >) {
    totalWeight += weight;
    const slot = inputs[name];
    const signalFn = spec.signals[name];
    if (!slot.available || !signalFn) {
      drivers.push({
        input: name,
        weight,
        signal: 0,
        contribution: 0,
        available: false,
      });
      continue;
    }
    availableWeight += weight;
    const signal = clampPM(signalFn(inputs));
    const contribution = signal * weight;
    drivers.push({
      input: name,
      weight,
      signal,
      contribution,
      available: true,
    });
    if (contribution > 0) positiveContribution += contribution;
  }

  // Step 2 — strength is the sum of POSITIVE contributions, normalised to
  // available weight. Negative signals don't reduce strength below zero —
  // they show up as veto reasons / negative drivers in the card.
  const strength =
    availableWeight === 0 ? 0 : clamp01(positiveContribution / availableWeight);

  // Step 3 — confidence = fraction of weight that had data.
  const confidence = totalWeight === 0 ? 0 : availableWeight / totalWeight;

  // Step 4 — vetoes. Any veto returning a non-null string blocks the trade.
  const vetoMessages: string[] = [];
  for (const veto of spec.vetoes) {
    const msg = veto(inputs);
    if (msg) vetoMessages.push(msg);
  }
  const tradeable = strength >= TRADEABLE_THRESHOLD && vetoMessages.length === 0;

  // Step 5 — reasons. Order: positive drivers (sorted by contribution),
  // then vetoes if any, then "missing X" notes if confidence is low.
  const reasons: string[] = [];
  const positiveDrivers = drivers
    .filter((d) => d.available && d.contribution > 0.01)
    .sort((a, b) => b.contribution - a.contribution);
  for (const d of positiveDrivers.slice(0, 3)) {
    reasons.push(`${d.input}: +${d.contribution.toFixed(2)}`);
  }
  for (const v of vetoMessages) reasons.push(`veto: ${v}`);
  if (confidence < 0.7) {
    const missing = drivers
      .filter((d) => !d.available)
      .map((d) => d.input)
      .slice(0, 3);
    if (missing.length > 0) {
      reasons.push(`missing: ${missing.join(", ")}`);
    }
  }

  return {
    playbook: spec.name,
    tradeable,
    strength,
    confidence,
    reasons,
    drivers,
  };
}

// === Common signal functions ==============================================

const dwellLockedSignal: SignalFn = (i) =>
  i.dwell.value && i.dwell.value.locked ? 1 : -0.5;

const armUsableSignal: SignalFn = (i) =>
  i.armPull.value?.hasUsableArm ? 1 : -1;

// === Accumulation playbook ================================================
// Pattern: low-magnitude angle, time-in-zone, balanced flow, defined range.
// "We're consolidating; deploy size in chunks."

const accumulationSpec: PlaybookSpec = {
  name: "accumulation",
  weights: {
    angle: 0.18,
    dwell: 0.12,
    poolStrength: 0.12,
    polarityFlips: 0.08,
    recency: 0.08,
    htfAgreement: 0.06,
    realizedVolatility: 0.12, // unavailable — accumulation cares hugely
    volumeDelta: 0.10, // unavailable — balanced flow signature
    spread: 0.08, // unavailable
    feedHealth: 0.06, // partial / unavailable today
  },
  signals: {
    angle: (i) => {
      const v = i.angle.value;
      if (!v) return 0;
      switch (v.bracket) {
        case "ACCUMULATION":
          return 1;
        case "RANGING":
          return 0.4;
        case "NO_TRADE":
          return 0.2;
        case "TRENDING":
          return -0.5;
        case "BREAKOUT":
          return -1;
      }
    },
    dwell: dwellLockedSignal,
    poolStrength: (i) => {
      const v = i.poolStrength.value;
      if (!v) return 0;
      // Defined range needs at least 2 nearby pools (floor + ceiling).
      if (v.activeNearbyCount >= 2) return 1;
      if (v.activeNearbyCount === 1) return 0.3;
      return -0.4;
    },
    polarityFlips: (i) => {
      const v = i.polarityFlips.value;
      if (!v) return 0;
      // Few flips = stable structure = good for accumulation. Many = chop.
      if (v.recentFlipCount === 0) return 0.5;
      if (v.recentFlipCount <= 2) return 0.2;
      return -0.5;
    },
    recency: (i) => {
      const v = i.recency.value;
      if (!v) return 0;
      // Mid-recency is best — pools old enough to be respected, fresh
      // enough to still be active.
      if (v.averageRecency >= 0.3 && v.averageRecency <= 0.85) return 0.7;
      return 0.1;
    },
    htfAgreement: (i) => {
      const v = i.htfAgreement.value;
      if (!v) return 0;
      // Accumulation doesn't strongly need HTF alignment — neutral on mixed.
      if (v.htfConfirms === "yes") return 0.3;
      if (v.htfConfirms === "no") return -0.2;
      return 0;
    },
  },
  vetoes: [
    (i) =>
      i.angle.value?.bracket === "NO_TRADE"
        ? "bracket NO_TRADE — sit out entirely"
        : null,
    (i) =>
      i.angle.value?.bracket === "BREAKOUT"
        ? "bracket BREAKOUT — wrong playbook for this regime"
        : null,
  ],
};

// === Ranging playbook ====================================================
// Pattern: oscillating between defined extremes, sweep-and-reverse setup.
// "Buy support, sell resistance; mean-reversion at pool extremes."

const rangingSpec: PlaybookSpec = {
  name: "ranging",
  weights: {
    angle: 0.18,
    dwell: 0.14,
    armPull: 0.18,
    poolStrength: 0.14,
    touchQuality: 0.10,
    htfAgreement: 0.06,
    polarityFlips: 0.06,
    spread: 0.04, // unavailable
    volumeDelta: 0.05, // unavailable
    feedHealth: 0.05, // partial
  },
  signals: {
    angle: (i) => {
      const v = i.angle.value;
      if (!v) return 0;
      switch (v.bracket) {
        case "RANGING":
          return 1;
        case "ACCUMULATION":
          return 0.3;
        case "TRENDING":
          return -0.3;
        case "BREAKOUT":
          return -0.7;
        case "NO_TRADE":
          return -0.5;
      }
    },
    dwell: dwellLockedSignal,
    armPull: armUsableSignal,
    poolStrength: (i) => {
      const v = i.poolStrength.value;
      if (!v) return 0;
      if (v.hasStrongNearby) return 1;
      if (v.activeNearbyCount > 0) return 0.4;
      return -0.6;
    },
    touchQuality: (i) => {
      const v = i.touchQuality.value;
      if (!v) return 0;
      // High-touch-count pools = well-respected levels = safer mean-reversion.
      if (v.averageTouchCount >= 3) return 1;
      if (v.averageTouchCount >= 2) return 0.5;
      return 0;
    },
    htfAgreement: (i) => {
      const v = i.htfAgreement.value;
      if (!v) return 0;
      // Ranging tolerates mixed HTF — chop on lower TFs against trend on
      // higher TFs is normal.
      if (v.htfConfirms === "yes") return 0.5;
      if (v.htfConfirms === "no") return -0.3;
      return 0.1;
    },
    polarityFlips: (i) => {
      const v = i.polarityFlips.value;
      if (!v) return 0;
      // Some flips = active range-trade history; too many = chop.
      if (v.recentFlipCount >= 1 && v.recentFlipCount <= 3) return 0.4;
      if (v.recentFlipCount > 6) return -0.5;
      return 0;
    },
  },
  vetoes: [
    (i) =>
      i.angle.value?.bracket === "NO_TRADE"
        ? "bracket NO_TRADE — sit out"
        : null,
    (i) =>
      i.angle.value?.bracket === "BREAKOUT"
        ? "BREAKOUT — range is broken, not ranging"
        : null,
    (i) =>
      i.armPull.value && !i.armPull.value.hasUsableArm
        ? "no active arm with sufficient pull"
        : null,
  ],
};

// === Trending playbook ===================================================
// Pattern: directional move, dominant arm in trend, HTF alignment.
// "Continuation entries on pullbacks within an established trend."

const trendingSpec: PlaybookSpec = {
  name: "trending",
  weights: {
    angle: 0.20,
    dwell: 0.12,
    htfAgreement: 0.18,
    armPull: 0.16,
    polarityFlips: 0.06,
    recency: 0.06,
    realizedVolatility: 0.10, // unavailable
    volumeDelta: 0.06, // unavailable
    spread: 0.03, // unavailable
    feedHealth: 0.03,
  },
  signals: {
    angle: (i) => {
      const v = i.angle.value;
      if (!v) return 0;
      switch (v.bracket) {
        case "TRENDING":
          return 1;
        case "BREAKOUT":
          return 0.6; // trending playbook still works on a breakout
        case "RANGING":
          return -0.2;
        case "ACCUMULATION":
          return -0.7;
        case "NO_TRADE":
          return -1;
      }
    },
    dwell: dwellLockedSignal,
    htfAgreement: (i) => {
      const v = i.htfAgreement.value;
      if (!v) return 0;
      // Trending is the playbook that LIVES on HTF agreement.
      if (v.htfConfirms === "yes") return 1;
      if (v.htfConfirms === "no") return -1;
      return -0.2;
    },
    armPull: (i) => {
      const v = i.armPull.value;
      const a = i.angle.value;
      if (!v || !a) return 0;
      // Dominant arm should be in the trend direction.
      if (v.dominantSide === "neither") return -0.3;
      if (a.direction === "up" && v.dominantSide === "upper") return 1;
      if (a.direction === "down" && v.dominantSide === "lower") return 1;
      if (a.direction === "flat") return 0;
      return -0.5; // dominant arm against the trend direction
    },
    polarityFlips: (i) => {
      const v = i.polarityFlips.value;
      if (!v) return 0;
      // Trending dislikes lots of flips — chop.
      if (v.recentFlipCount === 0) return 0.5;
      if (v.recentFlipCount > 3) return -0.4;
      return 0;
    },
    recency: (i) => {
      const v = i.recency.value;
      if (!v) return 0;
      // Recent pool births = fresh trend structure forming.
      if (v.averageRecency >= 0.7) return 0.6;
      return 0;
    },
  },
  vetoes: [
    (i) =>
      i.angle.value?.bracket === "NO_TRADE"
        ? "bracket NO_TRADE — sit out"
        : null,
    (i) =>
      i.angle.value?.bracket === "ACCUMULATION"
        ? "ACCUMULATION — no trend to follow"
        : null,
    (i) => {
      const a = i.angle.value;
      if (!a || a.direction === "flat") {
        return "no directional bias to follow";
      }
      return null;
    },
  ],
};

// === Breakout playbook ===================================================
// Pattern: very steep angle, fresh entry into BREAKOUT, prior consolidation.
// "Initial break + retest, sized down for whipsaw protection (spec §1.3)."

const breakoutSpec: PlaybookSpec = {
  name: "breakout",
  weights: {
    angle: 0.22,
    dwell: 0.18, // freshness of the lock matters most for breakout
    armPull: 0.14,
    htfAgreement: 0.10,
    realizedVolatility: 0.12, // unavailable
    volumeDelta: 0.10, // unavailable — needs expansion
    polarityFlips: 0.06,
    feedHealth: 0.04,
    spread: 0.04, // unavailable
  },
  signals: {
    angle: (i) => {
      const v = i.angle.value;
      if (!v) return 0;
      switch (v.bracket) {
        case "BREAKOUT":
          return 1;
        case "TRENDING":
          return 0.5;
        case "RANGING":
          return -0.4;
        case "ACCUMULATION":
          return -0.8;
        case "NO_TRADE":
          return -1;
      }
    },
    dwell: (i) => {
      const v = i.dwell.value;
      if (!v) return 0;
      // For breakout, FRESH lock matters most. observed=required is a
      // just-locked breakout, the highest-conviction case. observed >>
      // required means the breakout has aged — momentum may be done.
      if (!v.locked) return -0.5;
      const overshoot = v.observedBars - v.requiredBars;
      if (overshoot <= 1) return 1; // freshly locked
      if (overshoot <= 4) return 0.5;
      if (overshoot <= 10) return 0;
      return -0.3; // aged breakout
    },
    armPull: (i) => {
      const v = i.armPull.value;
      const a = i.angle.value;
      if (!v || !a) return 0;
      if (v.dominantSide === "neither") return -0.4;
      if (a.direction === "up" && v.dominantSide === "upper") return 1;
      if (a.direction === "down" && v.dominantSide === "lower") return 1;
      return -0.6;
    },
    htfAgreement: (i) => {
      const v = i.htfAgreement.value;
      if (!v) return 0;
      if (v.htfConfirms === "yes") return 0.7;
      if (v.htfConfirms === "no") return -0.5;
      return 0;
    },
    polarityFlips: (i) => {
      const v = i.polarityFlips.value;
      if (!v) return 0;
      // Breakout AFTER chop is normal; some flips OK.
      if (v.recentFlipCount > 5) return -0.3;
      return 0;
    },
  },
  vetoes: [
    (i) =>
      i.angle.value?.bracket === "NO_TRADE"
        ? "bracket NO_TRADE — sit out"
        : null,
    (i) => {
      const v = i.angle.value;
      if (!v) return null;
      if (v.bracket === "ACCUMULATION") return "ACCUMULATION — no breakout";
      if (v.bracket === "RANGING") return "RANGING — wait for the actual break";
      return null;
    },
  ],
};

// === Public entry points =================================================

export function assessAccumulation(
  inputs: RegimeInputs,
): PlaybookAssessment {
  return runPlaybook(accumulationSpec, inputs);
}

export function assessRanging(inputs: RegimeInputs): PlaybookAssessment {
  return runPlaybook(rangingSpec, inputs);
}

export function assessTrending(inputs: RegimeInputs): PlaybookAssessment {
  return runPlaybook(trendingSpec, inputs);
}

export function assessBreakout(inputs: RegimeInputs): PlaybookAssessment {
  return runPlaybook(breakoutSpec, inputs);
}
