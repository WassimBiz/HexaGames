export function nextDrawerIndex(currentIndex: number, playerCount: number): number {
  if (playerCount <= 0) throw new Error('Aucun joueur disponible');
  return (currentIndex + 1 + playerCount) % playerCount;
}

export function logicalRoundForTurn(turn: number, playerCount: number): number {
  if (turn <= 0 || playerCount <= 0) return 0;
  return Math.ceil(turn / playerCount);
}

export function totalTurnsForGame(rounds: number, playerCount: number): number {
  return Math.max(0, rounds) * Math.max(0, playerCount);
}
