import { z } from 'zod';

export const nicknameSchema = z.string().trim().min(2).max(20);
export const roomCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z2-9]{6}$/);
export const sessionIdSchema = z.string().uuid();

export const roomSettingsSchema = z.object({
  mode: z.enum(['drawing', 'voice', 'map']).default('drawing'),
  voiceLanguage: z.enum(['fr', 'en']).default('fr'),
  rounds: z.number().int().min(1).max(20),
  roundDuration: z
    .number()
    .int()
    .refine((duration) => [90, 120, 150, 180].includes(duration)),
  revealInterval: z
    .number()
    .int()
    .refine((interval) => [20, 30, 45].includes(interval)),
});

export const pointSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
});

export const drawSegmentSchema = z
  .object({
    id: z.string().min(1).max(80),
    strokeId: z.string().min(1).max(80).optional(),
    from: pointSchema,
    to: pointSchema,
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    size: z.number().min(1).max(40),
    tool: z.enum(['brush', 'eraser', 'fill']),
  })
  .transform((segment) => ({
    ...segment,
    strokeId: segment.strokeId ?? segment.id,
  }));

export const clientEventSchemas = {
  create_room: z.object({ nickname: nicknameSchema, sessionId: sessionIdSchema }),
  join_room: z.object({
    code: roomCodeSchema,
    nickname: nicknameSchema,
    sessionId: sessionIdSchema,
  }),
  leave_room: z.object({}),
  set_ready: z.object({ ready: z.boolean() }),
  update_settings: roomSettingsSchema,
  start_game: z.object({}),
  choose_champion: z.object({ championId: z.string().min(1).max(80) }),
  draw_segment: drawSegmentSchema,
  canvas_action: z.object({ action: z.enum(['undo', 'redo', 'clear']) }),
  chat_message: z.object({ message: z.string().trim().min(1).max(160) }),
  play_again: z.object({}),
  voice_signal: z.object({
    targetPlayerId: z.string().uuid(),
    signal: z.string().min(2).max(32_000),
  }),
  map_guess: pointSchema,
} as const;

export type RoomPhase = 'LOBBY' | 'CHOOSING' | 'DRAWING' | 'ROUND_RESULTS' | 'GAME_RESULTS';
export type GameMode = 'drawing' | 'voice' | 'map';
export type RoomSettings = z.infer<typeof roomSettingsSchema>;
export type Point = z.infer<typeof pointSchema>;
export type DrawSegment = z.infer<typeof drawSegmentSchema>;
export type CanvasAction = 'undo' | 'redo' | 'clear';

export interface Champion {
  id: string;
  name: string;
  imageUrl: string;
  numericId?: number;
}

export interface PublicPlayer {
  id: string;
  nickname: string;
  isHost: boolean;
  isReady: boolean;
  connected: boolean;
  hasGuessed: boolean;
  score: number;
}

export interface RoundWinner {
  playerId: string;
  nickname: string;
  points: number;
  position: number;
}

export interface ChampionRoundResult {
  kind: 'champion';
  champion: Champion;
  winners: RoundWinner[];
  drawerPoints: number;
}

export interface MapChallenge {
  id: string;
  mapId: 'summoners-rift' | 'howling-abyss' | 'twisted-treeline';
  mapName: string;
  imageUrl: string;
  clueImageUrl: string;
  view: Point & { zoom: number };
}

export interface MapGuessResult extends RoundWinner {
  guess: Point;
  distance: number;
}

export interface MapRoundResult {
  kind: 'map';
  challenge: MapChallenge;
  locationName: string;
  target: Point;
  guesses: MapGuessResult[];
}

export type RoundResult = ChampionRoundResult | MapRoundResult;

export interface PublicRoomState {
  code: string;
  phase: RoomPhase;
  players: PublicPlayer[];
  settings: RoomSettings;
  round: number;
  turn: number;
  playersPerRound: number;
  drawerId?: string;
  maskedChampion?: string;
  endsAt?: number;
  strokes: DrawSegment[];
  mapChallenge?: MapChallenge;
  result?: RoundResult;
  legalText: string;
}

export interface PrivateDrawerState {
  proposals?: Champion[];
  selectedChampion?: Champion;
  voiceLine?: {
    text?: string;
    audioUrl: string;
    sourceUrl: string;
    language: 'fr' | 'en';
  };
  voiceTextRevealAt?: number;
}

export interface ChatEntry {
  id: string;
  kind: 'message' | 'success' | 'system';
  playerId?: string;
  nickname?: string;
  text: string;
  createdAt: number;
}

export interface VoiceSignalEnvelope {
  id: string;
  fromPlayerId: string;
  signal: string;
}

export interface ClientToServerEvents {
  create_room: (
    payload: z.infer<(typeof clientEventSchemas)['create_room']>,
    callback: AckCallback,
  ) => void;
  join_room: (
    payload: z.infer<(typeof clientEventSchemas)['join_room']>,
    callback: AckCallback,
  ) => void;
  leave_room: (payload: Record<string, never>, callback?: AckCallback) => void;
  set_ready: (payload: { ready: boolean }, callback?: AckCallback) => void;
  update_settings: (payload: RoomSettings, callback?: AckCallback) => void;
  start_game: (payload: Record<string, never>, callback?: AckCallback) => void;
  choose_champion: (payload: { championId: string }, callback?: AckCallback) => void;
  draw_segment: (payload: DrawSegment, callback?: AckCallback) => void;
  canvas_action: (payload: { action: CanvasAction }, callback?: AckCallback) => void;
  chat_message: (payload: { message: string }, callback?: AckCallback) => void;
  play_again: (payload: Record<string, never>, callback?: AckCallback) => void;
  voice_signal: (
    payload: { targetPlayerId: string; signal: string },
    callback?: AckCallback,
  ) => void;
  map_guess: (payload: Point, callback?: AckCallback) => void;
}

export interface ServerToClientEvents {
  room_state: (state: PublicRoomState) => void;
  private_drawer_state: (state: PrivateDrawerState) => void;
  draw_segment: (segment: DrawSegment) => void;
  canvas_state: (segments: DrawSegment[]) => void;
  chat_entry: (entry: ChatEntry) => void;
  error_message: (message: string) => void;
  voice_signal: (signal: VoiceSignalEnvelope) => void;
}

export type AckResponse =
  | { ok: true; code?: string; playerId?: string; room?: PublicRoomState }
  | { ok: false; error: string };
export type AckCallback = (response: AckResponse) => void;
