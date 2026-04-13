// DetectScoreExhaustionDeath — fires when the pool's effective score has
// dropped below an exhaustion threshold for N consecutive candle closes.
// Math doc §8.2 condition 3.
//
// Distinct from "validation threshold (60)" suppression: exhaustion fires only
// after a previously-active pool has had its score eroded by repeated touches
// or tightening. Default exhaustion threshold = 15, requires 3 consecutive
// candles below to confirm.
//
// Pure function — takes the score history as input.

export interface ScoreExhaustionInput {
  recentScoreHistory: number[]; // ordered oldest to newest, the s_effective values per candle
  exhaustionThreshold?: number; // default 15
  consecutiveCloses?: number; // default 3
}

export interface ScoreExhaustionResult {
  dead: boolean;
  deathHistoryIndex: number | null;
}

export function detectScoreExhaustionDeath(
  input: ScoreExhaustionInput,
): ScoreExhaustionResult {
  const threshold = input.exhaustionThreshold ?? 15;
  const N = input.consecutiveCloses ?? 3;
  let streak = 0;

  for (let i = 0; i < input.recentScoreHistory.length; i++) {
    const score = input.recentScoreHistory[i];
    if (score < threshold) {
      streak += 1;
      if (streak >= N) {
        return { dead: true, deathHistoryIndex: i };
      }
    } else {
      streak = 0;
    }
  }

  return { dead: false, deathHistoryIndex: null };
}
