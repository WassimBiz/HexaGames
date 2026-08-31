import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { io as createClient, type Socket as ClientSocket } from 'socket.io-client';
import type {
  AckResponse,
  ClientToServerEvents,
  DrawSegment,
  PrivateDrawerState,
  PublicRoomState,
  ServerToClientEvents,
} from '@hexaguess/shared';
import { createApp, type AppInstance } from '../src/app.js';
import type { AppConfig } from '../src/config.js';
import { StaticChampionProvider } from '../src/game/champions.js';

type TestSocket = ClientSocket<ServerToClientEvents, ClientToServerEvents>;

const champions = [
  { id: 'Ahri', name: 'Ahri', imageUrl: 'https://example.test/Ahri.png', numericId: 103 },
  { id: 'Zoe', name: 'Zoé', imageUrl: 'https://example.test/Zoe.png' },
  { id: 'Kaisa', name: "Kai'Sa", imageUrl: 'https://example.test/Kaisa.png' },
  { id: 'Braum', name: 'Braum', imageUrl: 'https://example.test/Braum.png', numericId: 201 },
  { id: 'Darius', name: 'Darius', imageUrl: 'https://example.test/Darius.png', numericId: 122 },
];

const config: AppConfig = {
  PORT: 3001,
  CLIENT_ORIGIN: '*',
  DISCONNECT_GRACE_MS: 100,
  RIOT_LEGAL_TEXT: 'Mention de test',
  DISABLED_CHAMPION_IDS: '',
};

function once<T>(socket: TestSocket, event: string): Promise<T> {
  return new Promise((resolve) => socket.once(event as any, resolve as any));
}

function emitAck(socket: TestSocket, event: string, payload: unknown): Promise<AckResponse> {
  return new Promise((resolve) => socket.emit(event as any, payload as any, resolve));
}

describe('protocole Socket.IO', () => {
  let app: AppInstance;
  let url: string;
  const sockets: TestSocket[] = [];

  beforeEach(async () => {
    app = createApp(config, new StaticChampionProvider(champions));
    await new Promise<void>((resolve) => app.httpServer.listen(0, '127.0.0.1', resolve));
    url = `http://127.0.0.1:${(app.httpServer.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    sockets.forEach((socket) => socket.disconnect());
    await new Promise<void>((resolve) => app.io.close(() => resolve()));
  });

  async function connect(): Promise<TestSocket> {
    const socket: TestSocket = createClient(url, { transports: ['websocket'], forceNew: true });
    sockets.push(socket);
    await once(socket, 'connect');
    return socket;
  }

  it('crée, rejoint et protège le démarrage par l’hôte', async () => {
    const host = await connect();
    const guest = await connect();
    const created = await emitAck(host, 'create_room', {
      nickname: 'Mage',
      sessionId: crypto.randomUUID(),
    });
    expect(created.ok).toBe(true);
    if (created.ok) {
      expect(created.room?.code).toBe(created.code);
      expect(created.room?.players[0]?.id).toBe(created.playerId);
    }
    const code = created.ok ? created.code! : '';
    const joined = await emitAck(guest, 'join_room', {
      code,
      nickname: 'Encre',
      sessionId: crypto.randomUUID(),
    });
    expect(joined.ok).toBe(true);
    expect(await emitAck(guest, 'start_game', {})).toEqual({
      ok: false,
      error: 'Action réservée à l’hôte.',
    });
  });

  it('garde les choix privés, synchronise un trait et valide une bonne réponse', async () => {
    const host = await connect();
    const guest = await connect();
    const created = await emitAck(host, 'create_room', {
      nickname: 'Mage',
      sessionId: crypto.randomUUID(),
    });
    const code = created.ok ? created.code! : '';
    await emitAck(guest, 'join_room', {
      code,
      nickname: 'Encre',
      sessionId: crypto.randomUUID(),
    });
    await emitAck(guest, 'set_ready', { ready: true });

    const privatePromise = once<PrivateDrawerState>(host, 'private_drawer_state');
    const guestChoosingPromise = new Promise<PublicRoomState>((resolve) => {
      guest.on('room_state', (state) => {
        if (state.phase === 'CHOOSING') resolve(state);
      });
    });
    expect((await emitAck(host, 'start_game', {})).ok).toBe(true);
    const choices = await privatePromise;
    const publicChoosing = await guestChoosingPromise;
    expect(choices.proposals).toHaveLength(3);
    const chosen = choices.proposals![0]!;
    expect(JSON.stringify(publicChoosing)).not.toContain(chosen.name);
    expect(JSON.stringify(publicChoosing)).not.toContain(chosen.id);

    await emitAck(host, 'choose_champion', { championId: chosen.id });
    const segment: DrawSegment = {
      id: 'segment-test',
      strokeId: 'gesture-test',
      from: { x: 0.1, y: 0.2 },
      to: { x: 0.8, y: 0.7 },
      color: '#8B5CF6',
      size: 6,
      tool: 'brush',
    };
    const segmentPromise = once<DrawSegment>(guest, 'draw_segment');
    await emitAck(host, 'draw_segment', segment);
    expect(await segmentPromise).toEqual(segment);

    const successPromise = once<{ kind: string; text: string }>(guest, 'chat_entry');
    const resultPromise = new Promise<PublicRoomState>((resolve) => {
      guest.on('room_state', (state) => {
        if (state.phase === 'ROUND_RESULTS') resolve(state);
      });
    });
    await emitAck(guest, 'chat_message', { message: chosen.name });
    expect(await successPromise).toMatchObject({ kind: 'success', text: 'Encre a trouvé !' });
    const result = await resultPromise;
    expect(result.result?.kind).toBe('champion');
    if (result.result?.kind !== 'champion') throw new Error('Résultat champion attendu');
    expect(result.result.champion.name).toBe(chosen.name);
    expect(result.result.winners[0]?.nickname).toBe('Encre');
  });

  it('transfère le rôle d’hôte après son départ', async () => {
    const host = await connect();
    const guest = await connect();
    const created = await emitAck(host, 'create_room', {
      nickname: 'Premier',
      sessionId: crypto.randomUUID(),
    });
    const code = created.ok ? created.code! : '';
    const joined = await emitAck(guest, 'join_room', {
      code,
      nickname: 'Second',
      sessionId: crypto.randomUUID(),
    });
    const guestId = joined.ok ? joined.playerId : undefined;
    const transferPromise = new Promise<PublicRoomState>((resolve) => {
      guest.on('room_state', (state) => {
        if (state.players.find((player) => player.id === guestId)?.isHost) resolve(state);
      });
    });
    host.disconnect();
    const state = await transferPromise;
    expect(state.players.find((player) => player.id === guestId)?.isHost).toBe(true);
  });

  it('garde la réplique vocale privée et refuse le dessin dans ce mode', async () => {
    const host = await connect();
    const guest = await connect();
    const created = await emitAck(host, 'create_room', {
      nickname: 'Imitateur',
      sessionId: crypto.randomUUID(),
    });
    const code = created.ok ? created.code! : '';
    const joined = await emitAck(guest, 'join_room', {
      code,
      nickname: 'Oreille',
      sessionId: crypto.randomUUID(),
    });
    await emitAck(guest, 'set_ready', { ready: true });
    expect(
      (
        await emitAck(host, 'update_settings', {
          mode: 'voice',
          voiceLanguage: 'en',
          rounds: 1,
          roundDuration: 90,
          revealInterval: 30,
        })
      ).ok,
    ).toBe(true);

    const choicesPromise = once<PrivateDrawerState>(host, 'private_drawer_state');
    expect((await emitAck(host, 'start_game', {})).ok).toBe(true);
    const choices = await choicesPromise;
    expect(choices.proposals).toHaveLength(3);
    const chosen = choices.proposals![0]!;

    const performerStatePromise = once<PrivateDrawerState>(host, 'private_drawer_state');
    const publicStatePromise = new Promise<PublicRoomState>((resolve) => {
      guest.on('room_state', (state) => {
        if (state.phase === 'DRAWING') resolve(state);
      });
    });
    expect((await emitAck(host, 'choose_champion', { championId: chosen.id })).ok).toBe(true);
    const performerState = await performerStatePromise;
    const publicState = await publicStatePromise;
    expect(performerState.selectedChampion?.id).toBe(chosen.id);
    expect(performerState.voiceLine?.text).toBeTruthy();
    expect(performerState.voiceTextRevealAt).toBeGreaterThan(Date.now());
    expect(publicState.maskedChampion).toBeUndefined();
    expect(JSON.stringify(publicState)).not.toContain(performerState.voiceLine!.text);
    expect(JSON.stringify(publicState)).not.toContain(chosen.imageUrl);

    const relayedSignalPromise = once<{ fromPlayerId: string; signal: string }>(
      guest,
      'voice_signal',
    );
    expect(
      (
        await emitAck(host, 'voice_signal', {
          targetPlayerId: joined.ok ? joined.playerId : '',
          signal: JSON.stringify({ kind: 'description', description: { type: 'offer', sdp: 'x' } }),
        })
      ).ok,
    ).toBe(true);
    expect(await relayedSignalPromise).toMatchObject({
      fromPlayerId: created.ok ? created.playerId : '',
      signal: expect.stringContaining('offer'),
    });

    expect(
      await emitAck(host, 'draw_segment', {
        id: 'forbidden-segment',
        strokeId: 'forbidden-stroke',
        from: { x: 0.1, y: 0.1 },
        to: { x: 0.2, y: 0.2 },
        color: '#8B5CF6',
        size: 6,
        tool: 'brush',
      }),
    ).toEqual({ ok: false, error: 'Le dessin est réservé au dessinateur.' });
  });

  it('synchronise une manche HexaMap et classe les balises par distance', async () => {
    const host = await connect();
    const guest = await connect();
    const created = await emitAck(host, 'create_room', {
      nickname: 'Boussole',
      sessionId: crypto.randomUUID(),
    });
    const code = created.ok ? created.code! : '';
    await emitAck(guest, 'join_room', {
      code,
      nickname: 'Balise',
      sessionId: crypto.randomUUID(),
    });
    await emitAck(guest, 'set_ready', { ready: true });
    await emitAck(host, 'update_settings', {
      mode: 'map',
      voiceLanguage: 'fr',
      rounds: 1,
      roundDuration: 90,
      revealInterval: 30,
    });

    const challengePromise = new Promise<PublicRoomState>((resolve) => {
      host.on('room_state', (state) => {
        if (state.phase === 'DRAWING' && state.mapChallenge) resolve(state);
      });
    });
    expect((await emitAck(host, 'start_game', {})).ok).toBe(true);
    const challengeState = await challengePromise;
    const target = challengeState.mapChallenge!.view;

    expect((await emitAck(host, 'map_guess', { x: target.x, y: target.y })).ok).toBe(true);
    const resultPromise = new Promise<PublicRoomState>((resolve) => {
      guest.on('room_state', (state) => {
        if (state.phase === 'ROUND_RESULTS') resolve(state);
      });
    });
    expect((await emitAck(guest, 'map_guess', { x: 0, y: 0 })).ok).toBe(true);
    const resultState = await resultPromise;
    expect(resultState.result?.kind).toBe('map');
    if (resultState.result?.kind !== 'map') throw new Error('Résultat de carte attendu');
    expect(resultState.result.guesses[0]).toMatchObject({ nickname: 'Boussole', points: 1000 });
    expect(resultState.result.guesses[1]!.points).toBeLessThan(1000);
  });
});
