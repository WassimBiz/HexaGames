import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type {
  AckResponse,
  ChatEntry,
  ClientToServerEvents,
  DrawSegment,
  PrivateDrawerState,
  PublicRoomState,
  ServerToClientEvents,
  VoiceSignalEnvelope,
} from '@hexaguess/shared';
import { createUuid } from './randomId';

type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const usesSeparateLocalServer = ['5173', '4173'].includes(window.location.port);
const serverUrl =
  import.meta.env.VITE_SERVER_URL ??
  (usesSeparateLocalServer
    ? `${window.location.protocol}//${window.location.hostname}:3001`
    : window.location.origin);

function setRoomInAddress(code?: string): void {
  const url = new URL(window.location.href);
  if (code) url.searchParams.set('room', code);
  else url.searchParams.delete('room');
  url.hash = '';
  window.history.replaceState(null, '', url);
}

function getSessionId(): string {
  const existing = localStorage.getItem('hexaguess:session');
  if (existing) return existing;
  const created = createUuid();
  localStorage.setItem('hexaguess:session', created);
  return created;
}

export function useGameSocket() {
  const socketRef = useRef<GameSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [room, setRoom] = useState<PublicRoomState | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(() =>
    localStorage.getItem('hexaguess:player'),
  );
  const [privateState, setPrivateState] = useState<PrivateDrawerState>({});
  const [chat, setChat] = useState<ChatEntry[]>([]);
  const [error, setError] = useState('');
  const [voiceSignal, setVoiceSignal] = useState<VoiceSignalEnvelope | null>(null);

  useEffect(() => {
    const socket: GameSocket = io(serverUrl, { reconnection: true });
    socketRef.current = socket;
    socket.on('connect', () => {
      setConnected(true);
      const code = localStorage.getItem('hexaguess:room');
      const nickname = localStorage.getItem('hexaguess:nickname');
      if (code && nickname) {
        socket.emit('join_room', { code, nickname, sessionId: getSessionId() }, (response) => {
          if (response.ok) {
            if (response.playerId) setPlayerId(response.playerId);
            setRoomInAddress(code);
          } else {
            localStorage.removeItem('hexaguess:room');
            localStorage.removeItem('hexaguess:player');
            setRoom(null);
          }
        });
      }
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('room_state', (state) => {
      if (state.phase === 'CHOOSING') {
        setChat([]);
        setVoiceSignal(null);
      }
      setRoom(state);
      if (state.phase === 'CHOOSING') setPrivateState({});
    });
    socket.on('private_drawer_state', setPrivateState);
    socket.on('chat_entry', (entry) => setChat((entries) => [...entries.slice(-49), entry]));
    socket.on('draw_segment', (segment) => {
      setRoom((current) => {
        if (!current || current.strokes.some((stroke) => stroke.id === segment.id)) return current;
        return { ...current, strokes: [...current.strokes, segment] };
      });
    });
    socket.on('canvas_state', (strokes) =>
      setRoom((current) => (current ? { ...current, strokes } : current)),
    );
    socket.on('error_message', setError);
    socket.on('voice_signal', setVoiceSignal);
    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  const emit = useCallback(
    (event: keyof ClientToServerEvents, payload: unknown): Promise<AckResponse> =>
      new Promise((resolve) => {
        const socket = socketRef.current;
        if (!socket?.connected) {
          const response: AckResponse = {
            ok: false,
            error: 'Serveur hors ligne. Lancez « npm run dev », puis réessayez.',
          };
          setError(response.error);
          return resolve(response);
        }
        (socket.emit as any)(event, payload, (response: AckResponse) => {
          if (!response.ok) setError(response.error);
          else setError('');
          resolve(response);
        });
      }),
    [],
  );

  const enterRoom = useCallback((response: AckResponse, nickname: string) => {
    if (!response.ok || !response.code || !response.playerId) return false;
    localStorage.setItem('hexaguess:room', response.code);
    localStorage.setItem('hexaguess:nickname', nickname);
    localStorage.setItem('hexaguess:player', response.playerId);
    setPlayerId(response.playerId);
    if (response.room) setRoom(response.room);
    setRoomInAddress(response.code);
    setChat([]);
    setVoiceSignal(null);
    return true;
  }, []);

  const createRoom = useCallback(
    async (nickname: string) => {
      const response = await emit('create_room', { nickname, sessionId: getSessionId() });
      enterRoom(response, nickname);
      return response;
    },
    [emit, enterRoom],
  );

  const joinRoom = useCallback(
    async (nickname: string, code: string) => {
      const response = await emit('join_room', {
        nickname,
        code: code.toUpperCase(),
        sessionId: getSessionId(),
      });
      enterRoom(response, nickname);
      return response;
    },
    [emit, enterRoom],
  );

  const leaveRoom = useCallback(async () => {
    await emit('leave_room', {});
    localStorage.removeItem('hexaguess:room');
    localStorage.removeItem('hexaguess:player');
    setRoomInAddress();
    setRoom(null);
    setPlayerId(null);
    setPrivateState({});
    setChat([]);
    setVoiceSignal(null);
  }, [emit]);

  const sendSegment = useCallback((segment: DrawSegment) => {
    const socket = socketRef.current;
    socket?.emit('draw_segment', segment, (response) => {
      if (!response.ok) setError(response.error);
    });
  }, []);

  return {
    connected,
    room,
    playerId,
    privateState,
    chat,
    error,
    voiceSignal,
    setError,
    createRoom,
    joinRoom,
    leaveRoom,
    emit,
    sendSegment,
  };
}
