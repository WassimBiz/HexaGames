export interface GuessScoreInput {
  elapsedMs: number;
  durationMs: number;
  position: number;
}

export function calculateGuessScore(input: GuessScoreInput): number {
  const duration = Math.max(1, input.durationMs);
  const remainingRatio = Math.max(0, Math.min(1, 1 - input.elapsedMs / duration));
  const speedPoints = Math.round(700 * remainingRatio);
  const placementBonus = Math.max(0, 250 - (Math.max(1, input.position) - 1) * 75);
  return Math.max(0, 100 + speedPoints + placementBonus);
}

export function calculateDrawerScore(guesserCount: number): number {
  return Math.max(0, guesserCount) * 75;
}
