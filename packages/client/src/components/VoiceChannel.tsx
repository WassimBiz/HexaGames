import { useCallback, useEffect, useRef, useState } from 'react';
import type { VoiceSignalEnvelope } from '@hexaguess/shared';
import styles from '../App.module.css';

type RtcSignal =
  | { kind: 'description'; description: RTCSessionDescriptionInit }
  | { kind: 'candidate'; candidate: RTCIceCandidateInit };

interface VoiceChannelProps {
  isPerformer: boolean;
  peerIds: string[];
  incomingSignal: VoiceSignalEnvelope | null;
  onSignal: (targetPlayerId: string, signal: string) => void;
}

const rtcConfiguration: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

export function VoiceChannel({
  isPerformer,
  peerIds,
  incomingSignal,
  onSignal,
}: VoiceChannelProps) {
  const peers = useRef(new Map<string, RTCPeerConnection>());
  const pendingCandidates = useRef(new Map<string, RTCIceCandidateInit[]>());
  const localStream = useRef<MediaStream | null>(null);
  const remoteAudio = useRef<HTMLAudioElement>(null);
  const [microphoneActive, setMicrophoneActive] = useState(false);
  const [receiving, setReceiving] = useState(false);
  const [status, setStatus] = useState('');

  const send = useCallback(
    (targetPlayerId: string, signal: RtcSignal) => onSignal(targetPlayerId, JSON.stringify(signal)),
    [onSignal],
  );

  const getPeer = useCallback(
    (targetPlayerId: string, stream?: MediaStream): RTCPeerConnection => {
      const existing = peers.current.get(targetPlayerId);
      if (existing) return existing;
      const peer = new RTCPeerConnection(rtcConfiguration);
      peers.current.set(targetPlayerId, peer);
      stream?.getTracks().forEach((track) => peer.addTrack(track, stream));
      peer.onicecandidate = (event) => {
        if (event.candidate) {
          send(targetPlayerId, { kind: 'candidate', candidate: event.candidate.toJSON() });
        }
      };
      peer.ontrack = (event) => {
        const streamFromPeer = event.streams[0];
        if (!streamFromPeer || !remoteAudio.current) return;
        remoteAudio.current.srcObject = streamFromPeer;
        setReceiving(true);
        setStatus('Voix de l’imitateur connectée.');
        void remoteAudio.current.play().catch(() => {
          setStatus('Touchez « Écouter » pour autoriser la lecture de la voix.');
        });
      };
      peer.onconnectionstatechange = () => {
        if (peer.connectionState === 'failed' || peer.connectionState === 'disconnected') {
          setStatus('Connexion vocale interrompue. Utilisez votre appel vocal en secours.');
        }
      };
      return peer;
    },
    [send],
  );

  const flushCandidates = useCallback(async (playerId: string, peer: RTCPeerConnection) => {
    const candidates = pendingCandidates.current.get(playerId) ?? [];
    pendingCandidates.current.delete(playerId);
    for (const candidate of candidates) await peer.addIceCandidate(candidate);
  }, []);

  useEffect(() => {
    if (!incomingSignal) return;
    let parsed: RtcSignal;
    try {
      parsed = JSON.parse(incomingSignal.signal) as RtcSignal;
    } catch {
      return;
    }
    const fromPlayerId = incomingSignal.fromPlayerId;
    const handle = async () => {
      const peer = getPeer(
        fromPlayerId,
        isPerformer ? (localStream.current ?? undefined) : undefined,
      );
      if (parsed.kind === 'candidate') {
        if (peer.remoteDescription) await peer.addIceCandidate(parsed.candidate);
        else {
          const queued = pendingCandidates.current.get(fromPlayerId) ?? [];
          queued.push(parsed.candidate);
          pendingCandidates.current.set(fromPlayerId, queued);
        }
        return;
      }
      await peer.setRemoteDescription(parsed.description);
      await flushCandidates(fromPlayerId, peer);
      if (parsed.description.type === 'offer') {
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        send(fromPlayerId, { kind: 'description', description: answer });
      }
    };
    void handle().catch(() => setStatus('Impossible d’établir la connexion vocale.'));
  }, [flushCandidates, getPeer, incomingSignal, isPerformer, send]);

  useEffect(
    () => () => {
      localStream.current?.getTracks().forEach((track) => track.stop());
      peers.current.forEach((peer) => peer.close());
      peers.current.clear();
    },
    [],
  );

  const startMicrophone = async () => {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setStatus(
        'Le navigateur bloque le microphone sur cette adresse HTTP. Utilisez un appel vocal ou ouvrez une version HTTPS.',
      );
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
      localStream.current = stream;
      setMicrophoneActive(true);
      setStatus('Micro actif : les autres joueurs peuvent maintenant vous entendre.');
      for (const targetPlayerId of peerIds) {
        const peer = getPeer(targetPlayerId, stream);
        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
        send(targetPlayerId, { kind: 'description', description: offer });
      }
    } catch {
      setStatus('Accès au microphone refusé. Autorisez-le dans les réglages du navigateur.');
    }
  };

  if (isPerformer) {
    return (
      <div className={styles.voiceChannel}>
        <button type="button" onClick={() => void startMicrophone()} disabled={microphoneActive}>
          {microphoneActive ? '● Micro activé' : '🎙 Activer mon micro'}
        </button>
        {!window.isSecureContext && (
          <small>Le micro intégré nécessite HTTPS sur téléphone. Discord reste utilisable.</small>
        )}
        {status && <p role="status">{status}</p>}
      </div>
    );
  }

  return (
    <div className={styles.voiceChannel}>
      <audio ref={remoteAudio} autoPlay controls aria-label="Voix de l’imitateur" />
      <button type="button" disabled={!receiving} onClick={() => void remoteAudio.current?.play()}>
        {receiving ? '🔊 Écouter l’imitateur' : 'Connexion à la voix…'}
      </button>
      {status && <p role="status">{status}</p>}
      {!receiving && <small>Le joueur actif doit appuyer sur « Activer mon micro ».</small>}
    </div>
  );
}
