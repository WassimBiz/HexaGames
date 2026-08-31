import { randomBytes, randomUUID } from 'node:crypto';
import type {
  CanvasAction,
  ChatEntry,
  Champion,
  DrawSegment,
  MapChallenge,
  MapRoundResult,
  Point,
  PrivateDrawerState,
  PublicRoomState,
  RoomPhase,
  RoomSettings,
  RoundResult,
  RoundWinner,
  VoiceSignalEnvelope,
} from '@hexaguess/shared';
import { answersMatch } from './normalization.js';
import { chooseRevealPosition, maskChampionName } from './masking.js';
import { calculateDrawerScore, calculateGuessScore } from './scoring.js';
import { assertTransition } from './stateMachine.js';
import { logicalRoundForTurn, nextDrawerIndex, totalTurnsForGame } from './rotation.js';
import { drawChampionChoices, type ChampionProvider } from './champions.js';
import type { RoomRepository } from './repository.js';
import { voiceLineForChampion, voiceModeChampions, type ChampionVoiceLine } from './voiceLines.js';
import { calculateMapScore, drawMapLocation, type MapLocation } from './mapChallenges.js';

export interface InternalPlayer {
  id: string;
  sessionId: string;
  socketId: string;
  nickname: string;
  joinedAt: number;
  isReady: boolean;
  connected: boolean;
  score: number;
  hasGuessed: boolean;
  roundPoints: number;
}

export interface InternalRoom {
  code: string;
  phase: RoomPhase;
  players: InternalPlayer[];
  hostId: string;
  settings: RoomSettings;
  round: number;
  turn: number;
  playerCountAtStart: number;
  drawerIndex: number;
  drawerId?: string;
  proposals: Champion[];
  championDeck: Champion[];
  secretChampion?: Champion;
  voiceLine?: ChampionVoiceLine;
  voiceTextRevealAt?: number;
  revealed: Set<number>;
  strokes: DrawSegment[];
  redoStack: DrawSegment[];
  winners: RoundWinner[];
  result?: RoundResult;
  mapLocation?: MapLocation;
  mapGuesses: Map<string, Point>;
  roundStartedAt?: number;
  endsAt?: number;
  choiceTimer?: NodeJS.Timeout;
  roundTimer?: NodeJS.Timeout;
  revealTimer?: NodeJS.Timeout;
  transitionTimer?: NodeJS.Timeout;
}

export interface GameEvents {
  roomUpdated: (room: InternalRoom) => void;
  privateState: (socketId: string, state: PrivateDrawerState) => void;
  chatEntry: (room: InternalRoom, entry: ChatEntry) => void;
  segment: (room: InternalRoom, segment: DrawSegment) => void;
  canvasState: (room: InternalRoom) => void;
  voiceSignal: (socketId: string, signal: VoiceSignalEnvelope) => void;
}

const defaultSettings: RoomSettings = {
  mode: 'drawing',
  voiceLanguage: 'fr',
  rounds: 3,
  roundDuration: 90,
  revealInterval: 30,
};

const roomAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function createRoomCode(): string {
  const bytes = randomBytes(6);
  return Array.from(bytes, (byte) => roomAlphabet[byte % roomAlphabet.length]).join('');
}

export class GameService {
  constructor(
    private readonly repository: RoomRepository<InternalRoom>,
    private readonly championProvider: ChampionProvider,
    private readonly legalText: string,
    private readonly events: GameEvents,
  ) {}

  createRoom(nickname: string, sessionId: string, socketId: string): InternalPlayer {
    let code = createRoomCode();
    while (this.repository.get(code)) code = createRoomCode();
    const player = this.createPlayer(nickname, sessionId, socketId);
    const room: InternalRoom = {
      code,
      phase: 'LOBBY',
      players: [player],
      hostId: player.id,
      settings: { ...defaultSettings },
      round: 0,
      turn: 0,
      playerCountAtStart: 0,
      drawerIndex: -1,
      proposals: [],
      championDeck: [],
      revealed: new Set(),
      strokes: [],
      redoStack: [],
      winners: [],
      mapGuesses: new Map(),
    };
    this.repository.save(code, room);
    this.events.roomUpdated(room);
    return player;
  }

  joinRoom(
    code: string,
    nickname: string,
    sessionId: string,
    socketId: string,
  ): { room: InternalRoom; player: InternalPlayer; reconnected: boolean } {
    const room = this.requireRoom(code);
    const returningPlayer = room.players.find((player) => player.sessionId === sessionId);
    if (returningPlayer) {
      returningPlayer.socketId = socketId;
      returningPlayer.connected = true;
      this.events.roomUpdated(room);
      this.sendPrivateState(room, returningPlayer);
      return { room, player: returningPlayer, reconnected: true };
    }
    if (room.phase !== 'LOBBY') throw new Error('La partie a déjà commencé.');
    if (
      room.players.some(
        (player) => player.nickname.toLocaleLowerCase('fr') === nickname.toLocaleLowerCase('fr'),
      )
    ) {
      throw new Error('Ce pseudonyme est déjà utilisé dans le salon.');
    }
    const player = this.createPlayer(nickname, sessionId, socketId);
    room.players.push(player);
    this.events.roomUpdated(room);
    return { room, player, reconnected: false };
  }

  leave(socketId: string): void {
    const context = this.findBySocket(socketId);
    if (!context) return;
    const { room, player } = context;
    const wasDrawer = room.drawerId === player.id;
    room.players = room.players.filter((candidate) => candidate.id !== player.id);
    if (room.players.length === 0) {
      this.clearTimers(room);
      this.repository.delete(room.code);
      return;
    }
    if (room.hostId === player.id) this.transferHost(room);
    if (wasDrawer && (room.phase === 'CHOOSING' || room.phase === 'DRAWING')) {
      this.finishRound(room);
      return;
    }
    this.events.roomUpdated(room);
  }

  disconnect(socketId: string): void {
    const context = this.findBySocket(socketId);
    if (!context) return;
    const { room, player } = context;
    player.connected = false;
    if (room.hostId === player.id) this.transferHost(room);
    if (room.drawerId === player.id && (room.phase === 'CHOOSING' || room.phase === 'DRAWING')) {
      this.finishRound(room);
      return;
    }
    this.events.roomUpdated(room);
  }

  removeDisconnected(sessionId: string): void {
    for (const room of this.repository.list()) {
      const player = room.players.find((candidate) => candidate.sessionId === sessionId);
      if (player && !player.connected) {
        this.leave(player.socketId);
      }
    }
  }

  setReady(socketId: string, ready: boolean): void {
    const { room, player } = this.requireContext(socketId);
    if (room.phase !== 'LOBBY') throw new Error('Le statut prêt ne change que dans le salon.');
    player.isReady = ready;
    this.events.roomUpdated(room);
  }

  updateSettings(socketId: string, settings: RoomSettings): void {
    const { room, player } = this.requireContext(socketId);
    this.assertHost(room, player);
    if (room.phase !== 'LOBBY') throw new Error('La partie est déjà lancée.');
    room.settings = { ...settings };
    this.events.roomUpdated(room);
  }

  async startGame(socketId: string): Promise<void> {
    const { room, player } = this.requireContext(socketId);
    this.assertHost(room, player);
    if (room.phase !== 'LOBBY') throw new Error('La partie est déjà lancée.');
    const connectedPlayers = room.players.filter((candidate) => candidate.connected);
    if (connectedPlayers.length < 2) throw new Error('Il faut au moins deux joueurs.');
    if (connectedPlayers.some((candidate) => candidate.id !== room.hostId && !candidate.isReady)) {
      throw new Error('Tous les invités doivent être prêts.');
    }
    room.round = 0;
    room.turn = 0;
    room.playerCountAtStart = connectedPlayers.length;
    room.drawerIndex = -1;
    room.championDeck = [];
    room.players.forEach((candidate) => {
      candidate.score = 0;
      candidate.roundPoints = 0;
      candidate.hasGuessed = false;
    });
    await this.startNextRound(room);
  }

  chooseChampion(socketId: string, championId: string): void {
    const { room, player } = this.requireContext(socketId);
    if (room.phase !== 'CHOOSING' || room.drawerId !== player.id) {
      throw new Error('Seul le dessinateur peut choisir un champion.');
    }
    const champion = room.proposals.find((candidate) => candidate.id === championId);
    if (!champion) throw new Error('Ce champion ne fait pas partie des propositions.');
    this.beginDrawing(room, champion);
  }

  addSegment(socketId: string, segment: DrawSegment): void {
    const { room, player } = this.requireContext(socketId);
    if (
      room.settings.mode !== 'drawing' ||
      room.phase !== 'DRAWING' ||
      room.drawerId !== player.id
    ) {
      throw new Error('Le dessin est réservé au dessinateur.');
    }
    room.strokes.push(segment);
    room.redoStack = [];
    this.events.segment(room, segment);
  }

  canvasAction(socketId: string, action: CanvasAction): void {
    const { room, player } = this.requireContext(socketId);
    if (
      room.settings.mode !== 'drawing' ||
      room.phase !== 'DRAWING' ||
      room.drawerId !== player.id
    ) {
      throw new Error('Cette action est réservée au dessinateur.');
    }
    if (action === 'undo') {
      const strokeId = room.strokes.at(-1)?.strokeId;
      while (strokeId && room.strokes.at(-1)?.strokeId === strokeId) {
        room.redoStack.push(room.strokes.pop()!);
      }
    } else if (action === 'redo') {
      const strokeId = room.redoStack.at(-1)?.strokeId;
      while (strokeId && room.redoStack.at(-1)?.strokeId === strokeId) {
        room.strokes.push(room.redoStack.pop()!);
      }
    } else {
      room.strokes = [];
      room.redoStack = [];
    }
    this.events.canvasState(room);
  }

  submitChat(socketId: string, message: string): void {
    const { room, player } = this.requireContext(socketId);
    if (room.phase !== 'DRAWING') throw new Error('Le chat est disponible pendant le dessin.');
    if (room.drawerId === player.id)
      throw new Error('Le dessinateur ne peut pas utiliser le chat.');
    if (player.hasGuessed) throw new Error('Vous avez déjà trouvé.');
    const secret = room.secretChampion;
    if (!secret) throw new Error('Aucun champion actif.');

    if (answersMatch(message, secret.name)) {
      player.hasGuessed = true;
      const position = room.winners.length + 1;
      const elapsedMs = Date.now() - (room.roundStartedAt ?? Date.now());
      const points = calculateGuessScore({
        elapsedMs,
        durationMs: room.settings.roundDuration * 1_000,
        position,
      });
      player.score += points;
      player.roundPoints += points;
      room.winners.push({ playerId: player.id, nickname: player.nickname, points, position });
      this.events.chatEntry(room, {
        id: randomUUID(),
        kind: 'success',
        playerId: player.id,
        nickname: player.nickname,
        text: `${player.nickname} a trouvé !`,
        createdAt: Date.now(),
      });
      this.events.roomUpdated(room);
      const eligible = room.players.filter(
        (candidate) => candidate.connected && candidate.id !== room.drawerId,
      );
      if (eligible.length > 0 && eligible.every((candidate) => candidate.hasGuessed)) {
        this.finishRound(room);
      }
      return;
    }

    this.events.chatEntry(room, {
      id: randomUUID(),
      kind: 'message',
      playerId: player.id,
      nickname: player.nickname,
      text: message,
      createdAt: Date.now(),
    });
  }

  relayVoiceSignal(socketId: string, targetPlayerId: string, signal: string): void {
    const { room, player } = this.requireContext(socketId);
    if (room.phase !== 'DRAWING' || room.settings.mode !== 'voice') {
      throw new Error('Le canal vocal est disponible pendant une imitation.');
    }
    if (player.id !== room.drawerId && targetPlayerId !== room.drawerId) {
      throw new Error('Le canal vocal relie uniquement l’imitateur aux devineurs.');
    }
    const target = room.players.find(
      (candidate) => candidate.id === targetPlayerId && candidate.connected,
    );
    if (!target || target.id === player.id) throw new Error('Destinataire vocal introuvable.');
    this.events.voiceSignal(target.socketId, {
      id: randomUUID(),
      fromPlayerId: player.id,
      signal,
    });
  }

  submitMapGuess(socketId: string, guess: Point): void {
    const { room, player } = this.requireContext(socketId);
    if (room.phase !== 'DRAWING' || room.settings.mode !== 'map' || !room.mapLocation) {
      throw new Error('Aucun lieu à localiser pour le moment.');
    }
    if (player.hasGuessed) throw new Error('Votre marqueur est déjà verrouillé.');
    room.mapGuesses.set(player.id, guess);
    player.hasGuessed = true;
    this.events.roomUpdated(room);
    const eligible = room.players.filter((candidate) => candidate.connected);
    if (eligible.length > 0 && eligible.every((candidate) => candidate.hasGuessed)) {
      this.finishRound(room);
    }
  }

  playAgain(socketId: string): void {
    const { room, player } = this.requireContext(socketId);
    this.assertHost(room, player);
    if (room.phase !== 'GAME_RESULTS') throw new Error('La partie n’est pas terminée.');
    assertTransition(room.phase, 'LOBBY');
    room.phase = 'LOBBY';
    room.round = 0;
    room.turn = 0;
    room.playerCountAtStart = 0;
    room.drawerIndex = -1;
    delete room.drawerId;
    delete room.secretChampion;
    delete room.voiceLine;
    delete room.voiceTextRevealAt;
    delete room.mapLocation;
    room.mapGuesses.clear();
    room.proposals = [];
    room.championDeck = [];
    delete room.result;
    room.strokes = [];
    room.players.forEach((candidate) => {
      candidate.isReady = candidate.id === room.hostId;
      candidate.hasGuessed = false;
      candidate.roundPoints = 0;
    });
    this.events.roomUpdated(room);
  }

  publicState(room: InternalRoom): PublicRoomState {
    const state: PublicRoomState = {
      code: room.code,
      phase: room.phase,
      players: room.players.map((player) => ({
        id: player.id,
        nickname: player.nickname,
        isHost: player.id === room.hostId,
        isReady: player.isReady,
        connected: player.connected,
        hasGuessed: player.hasGuessed,
        score: player.score,
      })),
      settings: room.settings,
      round: room.round,
      turn: room.turn,
      playersPerRound: room.playerCountAtStart,
      strokes: room.strokes,
      legalText: this.legalText,
    };
    if (room.drawerId) state.drawerId = room.drawerId;
    if (room.endsAt) state.endsAt = room.endsAt;
    if (room.settings.mode === 'map' && room.phase === 'DRAWING' && room.mapLocation) {
      state.mapChallenge = this.publicMapChallenge(room.mapLocation);
    }
    if (room.settings.mode === 'drawing' && room.phase === 'DRAWING' && room.secretChampion) {
      state.maskedChampion = maskChampionName(room.secretChampion.name, room.revealed);
    }
    if ((room.phase === 'ROUND_RESULTS' || room.phase === 'GAME_RESULTS') && room.result) {
      state.result = room.result;
    }
    return state;
  }

  getRoom(code: string): InternalRoom | undefined {
    return this.repository.get(code);
  }

  private createPlayer(nickname: string, sessionId: string, socketId: string): InternalPlayer {
    return {
      id: randomUUID(),
      sessionId,
      socketId,
      nickname,
      joinedAt: Date.now(),
      isReady: false,
      connected: true,
      score: 0,
      hasGuessed: false,
      roundPoints: 0,
    };
  }

  private async startNextRound(room: InternalRoom): Promise<void> {
    if (room.phase === 'LOBBY') assertTransition('LOBBY', 'CHOOSING');
    else assertTransition(room.phase, 'CHOOSING');
    room.phase = 'CHOOSING';
    room.turn += 1;
    room.round =
      room.settings.mode === 'map'
        ? room.turn
        : logicalRoundForTurn(room.turn, room.playerCountAtStart);
    if (room.settings.mode === 'map') {
      this.beginMapRound(room);
      return;
    }
    let drawer: InternalPlayer | undefined;
    for (let attempt = 0; attempt < room.players.length; attempt += 1) {
      room.drawerIndex = nextDrawerIndex(room.drawerIndex, room.players.length);
      const candidate = room.players[room.drawerIndex];
      if (candidate?.connected) {
        drawer = candidate;
        break;
      }
    }
    if (!drawer) throw new Error('Dessinateur introuvable');
    room.drawerId = drawer.id;
    room.players.forEach((player) => {
      player.hasGuessed = false;
      player.roundPoints = 0;
    });
    room.revealed = new Set();
    room.strokes = [];
    room.redoStack = [];
    room.winners = [];
    delete room.result;
    delete room.secretChampion;
    delete room.voiceLine;
    delete room.voiceTextRevealAt;
    delete room.mapLocation;
    room.mapGuesses.clear();
    room.endsAt = Date.now() + 15_000;
    const allChampions = await this.championProvider.load();
    const champions =
      room.settings.mode === 'voice' ? voiceModeChampions(allChampions) : allChampions;
    if (champions.length < 3) {
      throw new Error('Le mode imitation nécessite au moins trois champions avec une réplique.');
    }
    const draw = drawChampionChoices(champions, room.championDeck, 3);
    room.proposals = draw.choices;
    room.championDeck = draw.deck;
    this.events.roomUpdated(room);
    this.sendPrivateState(room, drawer);
    room.choiceTimer = setTimeout(() => {
      const automatic = room.proposals[Math.floor(Math.random() * room.proposals.length)];
      if (room.phase === 'CHOOSING' && automatic) this.beginDrawing(room, automatic);
    }, 15_000);
    room.choiceTimer.unref();
  }

  private beginDrawing(room: InternalRoom, champion: Champion): void {
    assertTransition(room.phase, 'DRAWING');
    if (room.choiceTimer) clearTimeout(room.choiceTimer);
    room.phase = 'DRAWING';
    room.secretChampion = champion;
    if (room.settings.mode === 'voice') {
      const voiceLine = voiceLineForChampion(champion, room.settings.voiceLanguage);
      if (!voiceLine) throw new Error('Aucune réplique disponible pour ce champion.');
      room.voiceLine = voiceLine;
      room.voiceTextRevealAt = Date.now() + 5_000;
    }
    room.proposals = [];
    room.roundStartedAt = Date.now();
    room.endsAt = room.roundStartedAt + room.settings.roundDuration * 1_000;
    const drawer = room.players.find((candidate) => candidate.id === room.drawerId);
    if (drawer) {
      const privateState: PrivateDrawerState = { selectedChampion: champion };
      if (room.voiceLine) privateState.voiceLine = room.voiceLine;
      if (room.voiceTextRevealAt) privateState.voiceTextRevealAt = room.voiceTextRevealAt;
      this.events.privateState(drawer.socketId, privateState);
    }
    this.events.roomUpdated(room);
    room.roundTimer = setTimeout(() => this.finishRound(room), room.settings.roundDuration * 1_000);
    room.roundTimer.unref();
    if (room.settings.mode === 'drawing') {
      room.revealTimer = setInterval(() => {
        if (room.phase !== 'DRAWING' || !room.secretChampion) return;
        const position = chooseRevealPosition(room.secretChampion.name, room.revealed);
        if (position !== undefined) {
          room.revealed.add(position);
          this.events.roomUpdated(room);
        }
      }, room.settings.revealInterval * 1_000);
      room.revealTimer.unref();
    }
  }

  private finishRound(room: InternalRoom): void {
    if (room.phase !== 'DRAWING' && room.phase !== 'CHOOSING') return;
    if (room.settings.mode === 'map') {
      this.finishMapRound(room);
      return;
    }
    assertTransition(room.phase, 'ROUND_RESULTS');
    if (room.choiceTimer) clearTimeout(room.choiceTimer);
    if (room.roundTimer) clearTimeout(room.roundTimer);
    if (room.revealTimer) clearInterval(room.revealTimer);
    const drawer = room.players.find((candidate) => candidate.id === room.drawerId);
    const drawerPoints = room.winners.length > 0 ? calculateDrawerScore(room.winners.length) : 0;
    if (drawer) {
      drawer.score += drawerPoints;
      drawer.roundPoints += drawerPoints;
    }
    const champion = room.secretChampion ?? room.proposals[0];
    if (!champion) throw new Error('Impossible de terminer une manche sans champion');
    room.result = { kind: 'champion', champion, winners: room.winners, drawerPoints };
    delete room.secretChampion;
    delete room.voiceLine;
    delete room.voiceTextRevealAt;
    room.phase = 'ROUND_RESULTS';
    room.endsAt = Date.now() + 5_000;
    this.events.roomUpdated(room);
    room.transitionTimer = setTimeout(() => {
      if (room.phase !== 'ROUND_RESULTS') return;
      if (room.turn >= totalTurnsForGame(room.settings.rounds, room.playerCountAtStart)) {
        assertTransition(room.phase, 'GAME_RESULTS');
        room.phase = 'GAME_RESULTS';
        delete room.endsAt;
        this.events.roomUpdated(room);
      } else {
        void this.startNextRound(room);
      }
    }, 5_000);
    room.transitionTimer.unref();
  }

  private beginMapRound(room: InternalRoom): void {
    assertTransition(room.phase, 'DRAWING');
    room.phase = 'DRAWING';
    delete room.drawerId;
    room.players.forEach((player) => {
      player.hasGuessed = false;
      player.roundPoints = 0;
    });
    room.winners = [];
    room.mapGuesses.clear();
    delete room.result;
    const previousId = room.mapLocation?.id;
    room.mapLocation = drawMapLocation(previousId);
    room.roundStartedAt = Date.now();
    room.endsAt = room.roundStartedAt + room.settings.roundDuration * 1_000;
    this.events.roomUpdated(room);
    room.roundTimer = setTimeout(() => this.finishRound(room), room.settings.roundDuration * 1_000);
    room.roundTimer.unref();
  }

  private finishMapRound(room: InternalRoom): void {
    if (room.phase !== 'DRAWING' || !room.mapLocation) return;
    assertTransition(room.phase, 'ROUND_RESULTS');
    if (room.roundTimer) clearTimeout(room.roundTimer);
    const target = room.mapLocation.view;
    const guesses = room.players
      .flatMap((player) => {
        const guess = room.mapGuesses.get(player.id);
        if (!guess) return [];
        const scored = calculateMapScore(target, guess);
        player.score += scored.points;
        player.roundPoints = scored.points;
        return [{
          playerId: player.id,
          nickname: player.nickname,
          position: 0,
          points: scored.points,
          guess,
          distance: scored.distance,
        }];
      })
      .sort((left, right) => right.points - left.points)
      .map((guess, index) => ({ ...guess, position: index + 1 }));
    const result: MapRoundResult = {
      kind: 'map',
      challenge: this.publicMapChallenge(room.mapLocation),
      locationName: room.mapLocation.locationName,
      target: { x: target.x, y: target.y },
      guesses,
    };
    room.result = result;
    room.phase = 'ROUND_RESULTS';
    room.endsAt = Date.now() + 7_000;
    this.events.roomUpdated(room);
    room.transitionTimer = setTimeout(() => {
      if (room.phase !== 'ROUND_RESULTS') return;
      if (room.turn >= room.settings.rounds) {
        assertTransition(room.phase, 'GAME_RESULTS');
        room.phase = 'GAME_RESULTS';
        delete room.endsAt;
        this.events.roomUpdated(room);
      } else {
        void this.startNextRound(room);
      }
    }, 7_000);
    room.transitionTimer.unref();
  }

  private publicMapChallenge(location: MapLocation): MapChallenge {
    return {
      id: location.id,
      mapId: location.mapId,
      mapName: location.mapName,
      imageUrl: location.imageUrl,
      view: location.view,
    };
  }

  private sendPrivateState(room: InternalRoom, player: InternalPlayer): void {
    if (room.drawerId !== player.id) return;
    if (room.phase === 'CHOOSING') {
      this.events.privateState(player.socketId, { proposals: room.proposals });
    } else if (room.phase === 'DRAWING' && room.secretChampion) {
      const privateState: PrivateDrawerState = { selectedChampion: room.secretChampion };
      if (room.voiceLine) privateState.voiceLine = room.voiceLine;
      if (room.voiceTextRevealAt) privateState.voiceTextRevealAt = room.voiceTextRevealAt;
      this.events.privateState(player.socketId, privateState);
    }
  }

  private transferHost(room: InternalRoom): void {
    const successor = [...room.players]
      .filter((player) => player.connected)
      .sort((left, right) => left.joinedAt - right.joinedAt)[0];
    if (successor) room.hostId = successor.id;
  }

  private findBySocket(
    socketId: string,
  ): { room: InternalRoom; player: InternalPlayer } | undefined {
    for (const room of this.repository.list()) {
      const player = room.players.find((candidate) => candidate.socketId === socketId);
      if (player) return { room, player };
    }
    return undefined;
  }

  private requireContext(socketId: string): { room: InternalRoom; player: InternalPlayer } {
    const context = this.findBySocket(socketId);
    if (!context) throw new Error('Vous n’êtes dans aucun salon.');
    return context;
  }

  private requireRoom(code: string): InternalRoom {
    const room = this.repository.get(code);
    if (!room) throw new Error('Salon introuvable.');
    return room;
  }

  private assertHost(room: InternalRoom, player: InternalPlayer): void {
    if (room.hostId !== player.id) throw new Error('Action réservée à l’hôte.');
  }

  private clearTimers(room: InternalRoom): void {
    if (room.choiceTimer) clearTimeout(room.choiceTimer);
    if (room.roundTimer) clearTimeout(room.roundTimer);
    if (room.revealTimer) clearInterval(room.revealTimer);
    if (room.transitionTimer) clearTimeout(room.transitionTimer);
  }
}
