import { createServer, type Server as HttpServer } from 'node:http';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express from 'express';
import { Server } from 'socket.io';
import {
  clientEventSchemas,
  type AckCallback,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from '@hexaguess/shared';
import type { AppConfig } from './config.js';
import { DataDragonChampionProvider, type ChampionProvider } from './game/champions.js';
import { GameService, type InternalRoom } from './game/GameService.js';
import { InMemoryRoomRepository, type RoomRepository } from './game/repository.js';
import { SlidingWindowRateLimiter } from './rateLimit.js';

export interface AppInstance {
  httpServer: HttpServer;
  io: Server<ClientToServerEvents, ServerToClientEvents>;
  game: GameService;
}

export function createApp(
  config: AppConfig,
  championProvider?: ChampionProvider,
  repository: RoomRepository<InternalRoom> = new InMemoryRoomRepository(),
): AppInstance {
  const configuredOrigins = config.CLIENT_ORIGIN.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const corsOrigin = configuredOrigins.includes('*') ? '*' : configuredOrigins;
  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: corsOrigin }));
  app.use(express.json({ limit: '16kb' }));
  app.get('/health', (_request, response) => response.json({ status: 'ok' }));

  const bundledClient = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'client', 'dist');
  if (existsSync(bundledClient)) {
    app.use(express.static(bundledClient));
    app.get('/{*path}', (_request, response) =>
      response.sendFile(join(bundledClient, 'index.html')),
    );
  }

  const httpServer = createServer(app);
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: { origin: corsOrigin },
    maxHttpBufferSize: 64_000,
  });
  const disabled = new Set(
    config.DISABLED_CHAMPION_IDS.split(',')
      .map((id) => id.trim())
      .filter(Boolean),
  );
  const game = new GameService(
    repository,
    championProvider ?? new DataDragonChampionProvider(disabled),
    config.RIOT_LEGAL_TEXT,
    {
      roomUpdated: (room) => io.to(room.code).emit('room_state', game.publicState(room)),
      privateState: (socketId, state) => io.to(socketId).emit('private_drawer_state', state),
      chatEntry: (room, entry) => io.to(room.code).emit('chat_entry', entry),
      segment: (room, segment) => io.to(room.code).emit('draw_segment', segment),
      canvasState: (room) => io.to(room.code).emit('canvas_state', room.strokes),
      voiceSignal: (socketId, signal) => io.to(socketId).emit('voice_signal', signal),
    },
  );

  const chatLimiter = new SlidingWindowRateLimiter(5, 5_000);
  const drawLimiter = new SlidingWindowRateLimiter(300, 1_000);

  io.on('connection', (socket) => {
    const safe = <T>(
      schema: { safeParse: (payload: unknown) => { success: boolean; data?: T; error?: unknown } },
      payload: unknown,
      callback: AckCallback | undefined,
      action: (data: T) => void | Promise<void>,
    ): void => {
      const result = schema.safeParse(payload);
      if (!result.success || result.data === undefined) {
        callback?.({ ok: false, error: 'Données invalides.' });
        return;
      }
      Promise.resolve()
        .then(() => action(result.data as T))
        .then(() => callback?.({ ok: true }))
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : 'Erreur inattendue.';
          callback?.({ ok: false, error: message });
          if (!callback) socket.emit('error_message', message);
        });
    };

    socket.on('create_room', (payload, callback) => {
      const result = clientEventSchemas.create_room.safeParse(payload);
      if (!result.success) return callback({ ok: false, error: 'Pseudonyme ou session invalide.' });
      try {
        const player = game.createRoom(result.data.nickname, result.data.sessionId, socket.id);
        const room = repository.list().find((candidate) => candidate.players.includes(player));
        if (!room) throw new Error('Impossible de créer le salon.');
        socket.join(room.code);
        const publicRoom = game.publicState(room);
        callback({ ok: true, code: room.code, playerId: player.id, room: publicRoom });
        socket.emit('room_state', publicRoom);
        console.info(`[room] Salon ${room.code} créé (${room.players.length} joueur).`);
      } catch (error) {
        callback({
          ok: false,
          error: error instanceof Error ? error.message : 'Erreur inattendue.',
        });
      }
    });

    socket.on('join_room', (payload, callback) => {
      const result = clientEventSchemas.join_room.safeParse(payload);
      if (!result.success)
        return callback({ ok: false, error: 'Code, pseudonyme ou session invalide.' });
      try {
        const joined = game.joinRoom(
          result.data.code,
          result.data.nickname,
          result.data.sessionId,
          socket.id,
        );
        socket.join(joined.room.code);
        const publicRoom = game.publicState(joined.room);
        callback({
          ok: true,
          code: joined.room.code,
          playerId: joined.player.id,
          room: publicRoom,
        });
        socket.emit('room_state', publicRoom);
        socket.emit('canvas_state', joined.room.strokes);
        console.info(
          `[room] Connexion au salon ${joined.room.code} (${joined.room.players.length} joueurs).`,
        );
      } catch (error) {
        callback({
          ok: false,
          error: error instanceof Error ? error.message : 'Erreur inattendue.',
        });
      }
    });

    socket.on('leave_room', (payload, callback) => {
      safe(clientEventSchemas.leave_room, payload, callback, () => {
        game.leave(socket.id);
        for (const room of socket.rooms) if (room !== socket.id) void socket.leave(room);
      });
    });
    socket.on('set_ready', (payload, callback) =>
      safe(clientEventSchemas.set_ready, payload, callback, (data) =>
        game.setReady(socket.id, data.ready),
      ),
    );
    socket.on('update_settings', (payload, callback) =>
      safe(clientEventSchemas.update_settings, payload, callback, (data) =>
        game.updateSettings(socket.id, data),
      ),
    );
    socket.on('start_game', (payload, callback) =>
      safe(clientEventSchemas.start_game, payload, callback, () => game.startGame(socket.id)),
    );
    socket.on('choose_champion', (payload, callback) =>
      safe(clientEventSchemas.choose_champion, payload, callback, (data) =>
        game.chooseChampion(socket.id, data.championId),
      ),
    );
    socket.on('draw_segment', (payload, callback) => {
      if (!drawLimiter.allow(socket.id)) {
        callback?.({ ok: false, error: 'Tracé envoyé trop rapidement.' });
        return;
      }
      safe(clientEventSchemas.draw_segment, payload, callback, (data) =>
        game.addSegment(socket.id, data),
      );
    });
    socket.on('canvas_action', (payload, callback) =>
      safe(clientEventSchemas.canvas_action, payload, callback, (data) =>
        game.canvasAction(socket.id, data.action),
      ),
    );
    socket.on('chat_message', (payload, callback) => {
      if (!chatLimiter.allow(socket.id)) {
        callback?.({ ok: false, error: 'Trop de messages, veuillez patienter.' });
        return;
      }
      safe(clientEventSchemas.chat_message, payload, callback, (data) =>
        game.submitChat(socket.id, data.message),
      );
    });
    socket.on('play_again', (payload, callback) =>
      safe(clientEventSchemas.play_again, payload, callback, () => game.playAgain(socket.id)),
    );
    socket.on('voice_signal', (payload, callback) =>
      safe(clientEventSchemas.voice_signal, payload, callback, (data) =>
        game.relayVoiceSignal(socket.id, data.targetPlayerId, data.signal),
      ),
    );
    socket.on('map_guess', (payload, callback) =>
      safe(clientEventSchemas.map_guess, payload, callback, (data) =>
        game.submitMapGuess(socket.id, data),
      ),
    );

    socket.on('disconnect', () => {
      const sessionId = repository
        .list()
        .flatMap((room) => room.players)
        .find((player) => player.socketId === socket.id)?.sessionId;
      game.disconnect(socket.id);
      if (sessionId) {
        setTimeout(() => game.removeDisconnected(sessionId), config.DISCONNECT_GRACE_MS).unref();
      }
      chatLimiter.clear(socket.id);
      drawLimiter.clear(socket.id);
    });
  });

  return { httpServer, io, game };
}
