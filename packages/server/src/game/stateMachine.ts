import type { RoomPhase } from '@hexaguess/shared';

const transitions: Record<RoomPhase, readonly RoomPhase[]> = {
  LOBBY: ['CHOOSING'],
  CHOOSING: ['DRAWING', 'ROUND_RESULTS'],
  DRAWING: ['ROUND_RESULTS'],
  ROUND_RESULTS: ['CHOOSING', 'GAME_RESULTS'],
  GAME_RESULTS: ['LOBBY'],
};

export function canTransition(from: RoomPhase, to: RoomPhase): boolean {
  return transitions[from].includes(to);
}

export function assertTransition(from: RoomPhase, to: RoomPhase): void {
  if (!canTransition(from, to)) {
    throw new Error(`Transition interdite : ${from} → ${to}`);
  }
}
