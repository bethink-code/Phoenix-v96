// ValidateCandidatePool — three simultaneous criteria from spec §2.5 + math §10.4.
// All three must be true for the level to graduate to a pool.
// Touch counting uses a provisional 0.5% zone (Gap A resolution).
// Volume requirement uses VPVR percentile against the full lookback window (Gap B resolution).

import type { Candle } from "../../../../../shared/zennyTypes";
import { countTouches } from "../candle/countTouches";
import { classifyCandle } from "../candle/classifyCandle";

export interface ValidateInput {
  candidatePrice: number;
  side: "RESISTANCE" | "SUPPORT";
  candles: Candle[]; // validation window (default 100 candles)
  minTouches?: number; // default 3
  provisionalTolerancePct?: number; // default 0.005 (0.5%)
  minVolumePercentile?: number; // default 0.5 (50th percentile)
}

export interface ValidateResult {
  valid: boolean;
  failureReasons: string[];
  touchCount: number;
  volumePercentile: number;
  hasDeparture: boolean;
}

export function validateCandidatePool(input: ValidateInput): ValidateResult {
  const minTouches = input.minTouches ?? 3;
  const tolerancePct = input.provisionalTolerancePct ?? 0.005;
  const minVolPct = input.minVolumePercentile ?? 0.5;

  const failureReasons: string[] = [];

  // Criterion 1: touch count
  const touches = countTouches({
    candles: input.candles,
    price: input.candidatePrice,
    tolerancePct,
    side: input.side,
  });
  if (touches.length < minTouches) {
    failureReasons.push(`touch_count: ${touches.length} < ${minTouches}`);
  }

  // Criterion 2: volume at level (VPVR percentile rank against full window)
  const volumeAtLevel = touches.reduce((sum, t) => {
    return sum + (input.candles[t.candleIndex]?.volume ?? 0);
  }, 0);
  const allVolumes = input.candles.map((c) => c.volume).sort((a, b) => a - b);
  const rank = allVolumes.filter((v) => v <= volumeAtLevel).length;
  const volumePercentile = allVolumes.length > 0 ? rank / allVolumes.length : 0;
  if (volumePercentile < minVolPct) {
    failureReasons.push(
      `vol_percentile: ${volumePercentile.toFixed(2)} < ${minVolPct}`,
    );
  }

  // Criterion 3: departure strength > 0 (at least one ERC, NRC, or gap-away leaving the level)
  let hasDeparture = false;
  for (const t of touches) {
    const next = input.candles[t.candleIndex + 1];
    if (next === undefined) continue;
    const cls = classifyCandle(next);
    if (cls.type === "ERC" || cls.type === "NRC") {
      hasDeparture = true;
      break;
    }
  }
  if (!hasDeparture) {
    failureReasons.push("departure_strength: no ERC/NRC departure observed");
  }

  return {
    valid: failureReasons.length === 0,
    failureReasons,
    touchCount: touches.length,
    volumePercentile,
    hasDeparture,
  };
}
