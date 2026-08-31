import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import type {
  MapChallenge,
  Point,
  PrivateDrawerState,
  RoomSettings,
  VoiceSignalEnvelope,
} from '@hexaguess/shared';
import { DrawingCanvas } from './components/DrawingCanvas';
import { Timer } from './components/Timer';
import { VoiceChannel } from './components/VoiceChannel';
import { useGameSocket } from './useGameSocket';
import { useSoundEffects } from './useSoundEffects';
import styles from './App.module.css';

const defaultLegal =
  'HexaGuess a été créé conformément à la politique « Legal Jibber Jabber » de Riot Games avec des éléments appartenant à Riot Games. Riot Games ne soutient ni ne sponsorise ce projet.';

function Blobel({ small = false }: { small?: boolean }) {
  return (
    <span className={`${styles.blobel} ${small ? styles.blobelSmall : ''}`} aria-hidden="true">
      <i />
      <b />
    </span>
  );
}

function SoundToggle({ muted, onToggle }: { muted: boolean; onToggle: () => void }) {
  return (
    <button
      className={styles.soundButton}
      type="button"
      aria-label={muted ? 'Activer les sons' : 'Couper les sons'}
      aria-pressed={!muted}
      title={muted ? 'Activer le son' : 'Couper le son'}
      onClick={onToggle}
    >
      <span aria-hidden="true">{muted ? '♪×' : '♪'}</span>
      {muted ? 'Son coupé' : 'Son activé'}
    </button>
  );
}

function DrawingToolIcon({ name }: { name: 'brush' | 'eraser' | 'fill' | 'palette' }) {
  if (name === 'brush') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m14.5 5.5 4 4-8.7 8.7c-1.3 1.3-3.5 1.3-4.8 0s-1.3-3.5 0-4.8l9.5-7.9Z" />
        <path d="M4.8 14.2c-2.1.8-2.8 2.3-2.8 4.8 1.6-1 3.3.8 5.2-.2" />
        <path d="m16 4 1.1-1.1a1.8 1.8 0 0 1 2.5 0l1.5 1.5a1.8 1.8 0 0 1 0 2.5L20 8" />
      </svg>
    );
  }
  if (name === 'eraser') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m14.7 4.3 5 5a2 2 0 0 1 0 2.8l-7.6 7.6H7.4l-3.1-3.1a2 2 0 0 1 0-2.8l7.6-9.5a2 2 0 0 1 2.8 0Z" />
        <path d="m8.5 9.2 6.3 6.3M12.1 19.7H21" />
      </svg>
    );
  }
  if (name === 'fill') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m4 13 8-8 7 7-8 8H4v-7Z" />
        <path d="m8 7 8 8M4 20h8" />
        <path d="M20 15s2 2.2 2 3.5a2 2 0 0 1-4 0C18 17.2 20 15 20 15Z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3a9 9 0 0 0 0 18h1.3a1.7 1.7 0 0 0 1.2-2.9 1.7 1.7 0 0 1 1.2-2.9H18A3 3 0 0 0 21 12a9 9 0 0 0-9-9Z" />
      <path d="M7.5 10h.01M10 6.8h.01M14 6.8h.01M17 10h.01" />
    </svg>
  );
}

function VoiceStage({
  isPerformer,
  privateState,
  performerName,
  peerIds,
  incomingSignal,
  onVoiceSignal,
}: {
  isPerformer: boolean;
  privateState: PrivateDrawerState;
  performerName: string;
  peerIds: string[];
  incomingSignal: VoiceSignalEnvelope | null;
  onVoiceSignal: (targetPlayerId: string, signal: string) => void;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [secondsBeforeText, setSecondsBeforeText] = useState<number | null>(null);
  const [audioFailed, setAudioFailed] = useState(false);
  const revealAt = privateState.voiceTextRevealAt ?? 0;
  const textRevealed = secondsBeforeText === 0;

  useEffect(() => {
    if (!isPerformer || !revealAt) return;
    const updateCountdown = () =>
      setSecondsBeforeText(Math.max(0, Math.ceil((revealAt - Date.now()) / 1_000)));
    const initialTimer = window.setTimeout(updateCountdown, 0);
    const timer = window.setInterval(updateCountdown, 200);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, [isPerformer, revealAt]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !privateState.voiceLine) return;
    audio.currentTime = 0;
    void audio.play().catch(() => {
      // Les navigateurs peuvent bloquer la lecture automatique : les contrôles
      // restent visibles pour lancer l'extrait manuellement.
    });
    return () => audio.pause();
  }, [privateState.voiceLine]);

  if (!isPerformer) {
    return (
      <div className={styles.voiceStage} data-testid="voice-guesser-stage">
        <div className={styles.voicePulse} aria-hidden="true">
          <Blobel />
          <i />
          <i />
          <i />
        </div>
        <p className={styles.eyebrow}>Tendez l’oreille</p>
        <h2>{performerName} imite un champion…</h2>
        <p>Écoutez sa voix, son rythme et son intention, puis tentez votre réponse dans le chat.</p>
        <VoiceChannel
          isPerformer={false}
          peerIds={[]}
          incomingSignal={incomingSignal}
          onSignal={onVoiceSignal}
        />
      </div>
    );
  }

  const voiceLine = privateState.voiceLine;
  if (!voiceLine) {
    return (
      <div className={styles.voiceStage}>
        <Blobel />
        <h2>Préparation de votre réplique…</h2>
      </div>
    );
  }

  return (
    <div className={styles.voiceStage} data-testid="voice-performer-stage">
      <div className={styles.headphonesBadge}>
        🎧 Casque recommandé ·{' '}
        {voiceLine.language === 'fr' ? 'Version française officielle' : 'VO anglaise originale'}
      </div>
      <p className={styles.eyebrow}>1 · Écoutez attentivement</p>
      <h2>Retenez la voix et l’intonation.</h2>
      <audio
        ref={audioRef}
        src={voiceLine.audioUrl}
        controls
        preload="auto"
        onLoadStart={() => setAudioFailed(false)}
        onError={() => setAudioFailed(true)}
      />
      {audioFailed && (
        <p className={styles.audioWarning} role="status">
          L’extrait n’a pas pu charger. La réplique écrite va apparaître pour ne pas bloquer la
          partie.
        </p>
      )}
      <div className={`${styles.voiceScript} ${textRevealed ? styles.voiceScriptVisible : ''}`}>
        <p className={styles.eyebrow}>2 · Imitez la réplique</p>
        {textRevealed ? (
          voiceLine.text ? (
            <blockquote>{voiceLine.text}</blockquote>
          ) : (
            <div className={styles.noTranscript}>
              <strong>À vous de jouer !</strong>
              <span>
                Réécoutez l’extrait puis reproduisez ses mots, son rythme et son intention.
              </span>
            </div>
          )
        ) : (
          <p className={styles.scriptCountdown}>
            Le texte apparaît dans <strong>{secondsBeforeText ?? 5}</strong> s
          </p>
        )}
      </div>
      <p className={styles.voiceInstruction}>
        Dites-la à voix haute sans prononcer le nom du champion. À distance, gardez votre appel
        vocal ouvert avec les autres joueurs.
      </p>
      <VoiceChannel
        isPerformer
        peerIds={peerIds}
        incomingSignal={incomingSignal}
        onSignal={onVoiceSignal}
      />
      <a href={voiceLine.sourceUrl} target="_blank" rel="noreferrer" className={styles.audioSource}>
        Source de l’extrait
      </a>
    </div>
  );
}

function MapStage({
  challenge,
  submitted,
  onSubmit,
}: {
  challenge: MapChallenge;
  submitted: boolean;
  onSubmit: (guess: Point) => void;
}) {
  const [guess, setGuess] = useState<Point | null>(null);

  const placeMarker = (event: ReactMouseEvent<HTMLButtonElement>) => {
    if (submitted) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    setGuess({
      x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
      y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
    });
  };

  return (
    <div className={styles.mapStage} data-testid="map-stage">
      <div>
        <p className={styles.eyebrow}>Vue verrouillée · aucun déplacement</p>
        <h2>Où êtes-vous sur la carte ?</h2>
        <p>Observez les chemins, les murs et la végétation, puis placez votre marqueur.</p>
      </div>
      <div
        className={styles.mapClue}
        role="img"
        aria-label="Extrait fixe d’un lieu de League of Legends"
        style={{
          backgroundImage: `url(${challenge.imageUrl})`,
          backgroundSize: `${challenge.view.zoom * 100}%`,
          backgroundPosition: `${challenge.view.x * 100}% ${challenge.view.y * 100}%`,
        }}
      >
        <span>Vue fixe</span>
      </div>
      <div className={styles.mapGuessPanel}>
        <div>
          <strong>Placez votre balise</strong>
          <small>La carte peut changer à chaque manche.</small>
        </div>
        <button
          type="button"
          className={styles.mapOverview}
          onClick={placeMarker}
          disabled={submitted}
          aria-label="Carte de réponse : cliquez pour placer votre balise"
        >
          <img src={challenge.imageUrl} alt={`Carte de ${challenge.mapName}`} draggable={false} />
          {guess && (
            <span
              className={styles.mapPin}
              style={{ left: `${guess.x * 100}%`, top: `${guess.y * 100}%` }}
              aria-hidden="true"
            />
          )}
        </button>
        <button
          type="button"
          className={styles.primaryButton}
          disabled={!guess || submitted}
          onClick={() => guess && onSubmit(guess)}
          data-testid="submit-map-guess"
        >
          {submitted ? 'Balise verrouillée ✓' : 'Valider ma position'}
        </button>
      </div>
    </div>
  );
}

export function App() {
  const game = useGameSocket();
  const sounds = useSoundEffects();
  const emitGameEvent = game.emit;
  const playSound = sounds.play;
  const setAmbience = sounds.setAmbience;
  const [nickname, setNickname] = useState(() => localStorage.getItem('hexaguess:nickname') ?? '');
  const [code, setCode] = useState(
    () => new URLSearchParams(window.location.search).get('room')?.toUpperCase().slice(0, 6) ?? '',
  );
  const [chatMessage, setChatMessage] = useState('');
  const [color, setColor] = useState('#8B5CF6');
  const [size, setSize] = useState(6);
  const [tool, setTool] = useState<'brush' | 'eraser' | 'fill'>('brush');
  const room = game.room;
  const previousPhase = useRef(room?.phase);
  const lastSoundedChatEntry = useRef<string | null>(null);
  const me = room?.players.find((player) => player.id === game.playerId);
  const isDrawer = room?.drawerId === game.playerId;
  const ambienceActive = !room || room.phase === 'LOBBY';

  const rankedPlayers = useMemo(
    () => [...(room?.players ?? [])].sort((left, right) => right.score - left.score),
    [room?.players],
  );
  const sendVoiceSignal = useCallback(
    (targetPlayerId: string, signal: string) => {
      void emitGameEvent('voice_signal', { targetPlayerId, signal });
    },
    [emitGameEvent],
  );

  useEffect(() => {
    setAmbience(ambienceActive);
    return () => setAmbience(false);
  }, [ambienceActive, setAmbience]);

  useEffect(() => {
    const phase = room?.phase;
    if (!phase) return;
    const previous = previousPhase.current;
    previousPhase.current = phase;
    if (!previous || previous === phase) return;
    if (phase === 'CHOOSING') playSound('choose');
    else if (phase === 'DRAWING') playSound('drawStart');
    else if (phase === 'ROUND_RESULTS') playSound('reveal');
    else if (phase === 'GAME_RESULTS') playSound('fanfare');
  }, [playSound, room?.phase]);

  useEffect(() => {
    const latest = game.chat.at(-1);
    if (!latest || latest.id === lastSoundedChatEntry.current) return;
    lastSoundedChatEntry.current = latest.id;
    if (latest.kind === 'success') playSound('found');
  }, [game.chat, playSound]);

  useEffect(() => {
    if (room?.phase !== 'DRAWING' || room.settings.mode !== 'drawing' || !isDrawer) return;
    const handleShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea, select, [contenteditable="true"]')) return;
      const key = event.key.toLocaleLowerCase('fr');
      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && key === 'z') {
        event.preventDefault();
        void emitGameEvent('canvas_action', { action: event.shiftKey ? 'redo' : 'undo' });
      } else if (modifier && key === 'y') {
        event.preventDefault();
        void emitGameEvent('canvas_action', { action: 'redo' });
      } else if (!modifier && key === 'b') {
        setTool('brush');
      } else if (!modifier && key === 'e') {
        setTool('eraser');
      } else if (!modifier && key === 'f') {
        setTool('fill');
      } else if (!modifier && ['1', '2', '3', '4'].includes(key)) {
        setSize([3, 6, 12, 22][Number(key) - 1]!);
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [emitGameEvent, isDrawer, room?.phase, room?.settings.mode]);

  const submitJoin = async (event: FormEvent) => {
    event.preventDefault();
    if (nickname.trim().length < 2) return game.setError('Le pseudonyme doit avoir 2 caractères.');
    if (code.trim().length !== 6) return game.setError('Le code contient 6 caractères.');
    await game.joinRoom(nickname.trim(), code.trim());
  };

  const create = async () => {
    if (nickname.trim().length < 2) return game.setError('Le pseudonyme doit avoir 2 caractères.');
    await game.createRoom(nickname.trim());
  };

  const sendChat = async (event: FormEvent) => {
    event.preventDefault();
    const message = chatMessage.trim();
    if (!message) return;
    const response = await game.emit('chat_message', { message });
    if (response.ok) setChatMessage('');
  };

  const copyInviteLink = () => {
    const invite = new URL(window.location.href);
    invite.searchParams.set('room', room?.code ?? '');
    invite.hash = '';
    void navigator.clipboard.writeText(invite.toString());
  };

  if (!room || !me) {
    return (
      <main className={styles.appShell}>
        <div className={styles.ambient} aria-hidden="true" />
        <header className={styles.brandBar}>
          <a className={styles.logo} href="#top" aria-label="HexaGuess, accueil">
            <Blobel small />
            Hexa<span>Guess</span>
          </a>
          <div className={styles.headerActions}>
            <SoundToggle muted={sounds.muted} onToggle={sounds.toggleMuted} />
            <span className={`${styles.connection} ${game.connected ? styles.online : ''}`}>
              {game.connected ? 'Atelier ouvert' : 'Connexion…'}
            </span>
          </div>
        </header>

        <section className={styles.hero} id="top">
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>Party game · dessin · temps réel</p>
            <h1>
              Donnez forme à l’<em>impossible</em>.
            </h1>
            <p className={styles.lead}>
              Choisissez un champion en secret, saisissez votre pinceau magique et laissez vos amis
              deviner avant la dernière goutte d’encre.
            </p>
            <div className={styles.featurePills} aria-label="Caractéristiques">
              <span>2+ joueurs en temps réel</span>
              <span>Sans inscription</span>
              <span>Dans le navigateur</span>
            </div>
          </div>

          <div className={styles.entryCard}>
            <div className={styles.blobelStage}>
              <Blobel />
              <div>
                <strong>Blobel vous attend</strong>
                <small>Votre guide dans l’atelier</small>
              </div>
            </div>
            <label htmlFor="nickname">Votre nom d’artiste</label>
            <input
              id="nickname"
              data-testid="nickname-input"
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              minLength={2}
              maxLength={20}
              placeholder="Ex. PinceauFou"
              autoComplete="nickname"
            />
            <button
              className={styles.primaryButton}
              data-testid="create-room"
              onClick={create}
              disabled={!game.connected}
              title={game.connected ? undefined : 'Le serveur de jeu est hors ligne'}
            >
              Créer une partie <span aria-hidden="true">→</span>
            </button>
            <div className={styles.divider}>
              <span>ou rejoindre un atelier</span>
            </div>
            <form className={styles.joinRow} onSubmit={submitJoin}>
              <input
                aria-label="Code du salon"
                data-testid="room-code"
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                maxLength={6}
                placeholder="CODE6X"
                autoCapitalize="characters"
              />
              <button
                className={styles.secondaryButton}
                data-testid="join-room"
                disabled={!game.connected}
                title={game.connected ? undefined : 'Le serveur de jeu est hors ligne'}
              >
                Rejoindre
              </button>
            </form>
            {!game.connected && (
              <p className={styles.error} role="status">
                Serveur de jeu hors ligne. Lancez <code>npm run dev</code> dans le projet.
              </p>
            )}
            {game.error && game.connected && (
              <p className={styles.error} role="alert">
                {game.error}
              </p>
            )}
          </div>
        </section>

        <section className={styles.howItWorks} aria-labelledby="how-title">
          <div>
            <p className={styles.eyebrow}>Une manche, trois gestes</p>
            <h2 id="how-title">Simple comme un coup de pinceau</h2>
          </div>
          <ol>
            <li>
              <b>01</b>
              <strong>Choisissez</strong>
              <span>Un champion parmi trois, rien que pour vous.</span>
            </li>
            <li>
              <b>02</b>
              <strong>Dessinez</strong>
              <span>Quelques traits bien sentis, sans écrire son nom.</span>
            </li>
            <li>
              <b>03</b>
              <strong>Devinez</strong>
              <span>Répondez vite dans le chat et grimpez au classement.</span>
            </li>
          </ol>
        </section>
        <Footer legalText={defaultLegal} />
      </main>
    );
  }

  return (
    <main className={styles.gameShell}>
      <header className={styles.gameHeader}>
        <button
          type="button"
          className={`${styles.logo} ${styles.logoButton}`}
          data-testid="home-logo"
          aria-label="Quitter le salon et revenir à l’accueil"
          title="Retour à l’accueil"
          onClick={() => void game.leaveRoom()}
        >
          <Blobel small />
          Hexa<span>Guess</span>
        </button>
        <div className={styles.roomBadge}>
          Salon <strong data-testid="room-code-display">{room.code}</strong>
          <button
            aria-label="Copier le code du salon"
            onClick={() => void navigator.clipboard.writeText(room.code)}
          >
            Copier le code
          </button>
          <button
            data-testid="copy-invite-link"
            aria-label="Copier le lien d’invitation"
            title="Le code du salon sera prérempli pour vos amis"
            onClick={copyInviteLink}
          >
            Copier le lien
          </button>
        </div>
        <div className={styles.headerActions}>
          <SoundToggle muted={sounds.muted} onToggle={sounds.toggleMuted} />
          <button className={styles.textButton} onClick={() => void game.leaveRoom()}>
            Quitter
          </button>
        </div>
      </header>
      {game.error && (
        <p className={styles.toast} role="alert">
          {game.error}
        </p>
      )}

      {room.phase === 'LOBBY' && (
        <Lobby
          room={room}
          playerId={game.playerId!}
          onReady={(ready) => void game.emit('set_ready', { ready })}
          onSettings={(settings) => void game.emit('update_settings', settings)}
          onStart={() => void game.emit('start_game', {})}
        />
      )}

      {room.phase === 'CHOOSING' && (
        <section className={styles.phasePanel}>
          <Timer endsAt={room.endsAt} />
          {isDrawer ? (
            <>
              <p className={styles.eyebrow}>À vous de jouer</p>
              <h1>Choisissez votre champion</h1>
              <p>
                {room.settings.mode === 'voice'
                  ? 'Vous entendrez sa réplique au casque. Les autres ne verront pas votre choix.'
                  : 'Ce choix reste secret jusqu’au récapitulatif.'}
              </p>
              <div className={styles.championChoices}>
                {(game.privateState.proposals ?? []).map((champion) => (
                  <button
                    key={champion.id}
                    data-testid="champion-choice"
                    onClick={() => {
                      playSound('choose');
                      void game.emit('choose_champion', { championId: champion.id });
                    }}
                  >
                    <img src={champion.imageUrl} alt="" />
                    <strong>{champion.name}</strong>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className={styles.waitingInk}>
              <Blobel />
              <p className={styles.eyebrow}>Le champion se prépare</p>
              <h1>
                {room.players.find((player) => player.id === room.drawerId)?.nickname} choisit son
                champion…
              </h1>
              <p>
                Les trois propositions ne sont envoyées qu’
                {room.settings.mode === 'voice' ? 'à l’imitateur' : 'au dessinateur'}.
              </p>
            </div>
          )}
        </section>
      )}

      {room.phase === 'DRAWING' && room.settings.mode === 'map' && room.mapChallenge && (
        <section className={styles.mapPlayLayout}>
          <aside className={styles.sidePanel}>
            <div className={styles.roundLabel}>
              Manche {room.round} / {room.settings.rounds}
            </div>
            <Timer endsAt={room.endsAt} />
            <div className={styles.mapOdds}>
              <strong>Tirage des cartes</strong>
              <span>85 % Faille</span>
              <span>10 % ARAM</span>
              <span>5 % Forêt torturée</span>
            </div>
            <PlayerList
              players={rankedPlayers}
              drawerId={undefined}
              drawerLabel=""
              guessedLabel="Balise posée"
            />
          </aside>
          <MapStage
            key={room.mapChallenge.id}
            challenge={room.mapChallenge}
            submitted={me.hasGuessed}
            onSubmit={(guess) => void game.emit('map_guess', guess)}
          />
        </section>
      )}

      {room.phase === 'DRAWING' && room.settings.mode !== 'map' && (
        <section className={styles.playLayout}>
          <aside className={styles.sidePanel}>
            <div className={styles.roundLabel}>
              Manche {room.round} / {room.settings.rounds}
            </div>
            <Timer endsAt={room.endsAt} />
            {isDrawer && game.privateState.selectedChampion ? (
              <div className={styles.secretCard}>
                <img src={game.privateState.selectedChampion.imageUrl} alt="" />
                <div>
                  <small>Votre champion</small>
                  <strong>{game.privateState.selectedChampion.name}</strong>
                </div>
              </div>
            ) : null}
            <PlayerList
              players={rankedPlayers}
              drawerId={room.drawerId}
              drawerLabel={room.settings.mode === 'voice' ? 'Imite' : 'Dessine'}
            />
          </aside>

          <div className={styles.canvasColumn}>
            <div className={styles.canvasTopline}>
              <div>
                <span className={styles.liveDot} />
                {isDrawer
                  ? room.settings.mode === 'voice'
                    ? 'Vous imitez'
                    : 'Vous dessinez'
                  : `${room.players.find((player) => player.id === room.drawerId)?.nickname} ${
                      room.settings.mode === 'voice' ? 'imite' : 'dessine'
                    }`}
              </div>
              {!isDrawer && room.settings.mode === 'drawing' && (
                <div className={styles.maskedWordTop} aria-label="Nom du champion masqué">
                  {room.maskedChampion}
                </div>
              )}
              <span>{room.players.filter((player) => player.hasGuessed).length} ont trouvé</span>
            </div>
            {room.settings.mode === 'drawing' && isDrawer && (
              <div className={styles.toolbar} aria-label="Outils de dessin">
                <button
                  type="button"
                  aria-label="Pinceau"
                  aria-pressed={tool === 'brush'}
                  className={tool === 'brush' ? styles.toolActive : ''}
                  onClick={() => setTool('brush')}
                  title="Pinceau (B)"
                >
                  <DrawingToolIcon name="brush" />
                </button>
                <button
                  type="button"
                  aria-label="Gomme"
                  aria-pressed={tool === 'eraser'}
                  className={tool === 'eraser' ? styles.toolActive : ''}
                  onClick={() => setTool('eraser')}
                  title="Gomme (E)"
                >
                  <DrawingToolIcon name="eraser" />
                </button>
                <button
                  type="button"
                  aria-label="Remplir toute la toile"
                  aria-pressed={tool === 'fill'}
                  className={tool === 'fill' ? styles.toolActive : ''}
                  onClick={() => setTool('fill')}
                  title="Seau de remplissage (F)"
                >
                  <DrawingToolIcon name="fill" />
                </button>
                <label className={styles.colorTool} title="Couleur">
                  <span className={styles.srOnly}>Couleur</span>
                  <DrawingToolIcon name="palette" />
                  <input
                    type="color"
                    aria-label="Choisir la couleur"
                    value={color}
                    onChange={(event) => setColor(event.target.value)}
                  />
                </label>
                <label>
                  Trait{' '}
                  <select value={size} onChange={(event) => setSize(Number(event.target.value))}>
                    <option value="3">Fin</option>
                    <option value="6">Moyen</option>
                    <option value="12">Large</option>
                    <option value="22">Très large</option>
                  </select>
                </label>
                <span className={styles.toolbarGap} />
                <button
                  aria-keyshortcuts="Control+Z Meta+Z"
                  title="Annuler (Ctrl/Cmd+Z)"
                  onClick={() => void game.emit('canvas_action', { action: 'undo' })}
                >
                  Annuler
                </button>
                <button
                  aria-keyshortcuts="Control+Y Meta+Y Control+Shift+Z Meta+Shift+Z"
                  title="Rétablir (Ctrl/Cmd+Y ou Ctrl/Cmd+Maj+Z)"
                  onClick={() => void game.emit('canvas_action', { action: 'redo' })}
                >
                  Rétablir
                </button>
                <button
                  className={styles.dangerTool}
                  onClick={() => void game.emit('canvas_action', { action: 'clear' })}
                >
                  Effacer
                </button>
              </div>
            )}
            {room.settings.mode === 'drawing' && isDrawer && (
              <p className={styles.shortcutHint}>
                Raccourcis : <kbd>B</kbd> pinceau · <kbd>E</kbd> gomme · <kbd>F</kbd> seau ·{' '}
                <kbd>1–4</kbd> épaisseur · <kbd>Ctrl Z</kbd> annuler · <kbd>Ctrl Y</kbd> rétablir
              </p>
            )}
            {room.settings.mode === 'drawing' ? (
              <DrawingCanvas
                strokes={room.strokes}
                canDraw={isDrawer}
                color={color}
                size={size}
                tool={tool}
                onSegment={game.sendSegment}
              />
            ) : (
              <VoiceStage
                isPerformer={isDrawer}
                privateState={game.privateState}
                performerName={
                  room.players.find((player) => player.id === room.drawerId)?.nickname ??
                  'Un joueur'
                }
                peerIds={room.players
                  .filter((player) => player.connected && player.id !== room.drawerId)
                  .map((player) => player.id)}
                incomingSignal={game.voiceSignal}
                onVoiceSignal={sendVoiceSignal}
              />
            )}
          </div>

          <aside className={styles.chatPanel}>
            <h2>Réponses</h2>
            <div className={styles.messages} aria-live="polite">
              {game.chat.length === 0 && (
                <p className={styles.emptyChat}>Les propositions apparaîtront ici.</p>
              )}
              {game.chat.map((entry) => (
                <p key={entry.id} className={entry.kind === 'success' ? styles.successMessage : ''}>
                  {entry.kind === 'message' && <strong>{entry.nickname} </strong>}
                  {entry.text}
                </p>
              ))}
            </div>
            {isDrawer ? (
              <p className={styles.drawerNotice}>
                {room.settings.mode === 'voice'
                  ? 'Concentrez-vous sur votre imitation : le chat vous est fermé.'
                  : 'Concentrez-vous sur votre chef-d’œuvre : le chat est fermé au dessinateur.'}
              </p>
            ) : me.hasGuessed ? (
              <p className={styles.foundNotice}>Bien joué, vous avez trouvé !</p>
            ) : (
              <form className={styles.chatForm} onSubmit={sendChat}>
                <label className={styles.srOnly} htmlFor="guess">
                  Votre réponse
                </label>
                <input
                  id="guess"
                  data-testid="chat-input"
                  value={chatMessage}
                  maxLength={160}
                  onChange={(event) => setChatMessage(event.target.value)}
                  placeholder="Votre réponse…"
                  autoComplete="off"
                />
                <button data-testid="send-chat" aria-label="Envoyer">
                  →
                </button>
              </form>
            )}
          </aside>
        </section>
      )}

      {(room.phase === 'ROUND_RESULTS' || room.phase === 'GAME_RESULTS') && room.result && (
        <Results
          room={room}
          rankedPlayers={rankedPlayers}
          isHost={me.isHost}
          onReplay={() => void game.emit('play_again', {})}
        />
      )}
      <Footer legalText={room.legalText} compact />
    </main>
  );
}

function Lobby({
  room,
  playerId,
  onReady,
  onSettings,
  onStart,
}: {
  room: NonNullable<ReturnType<typeof useGameSocket>['room']>;
  playerId: string;
  onReady: (ready: boolean) => void;
  onSettings: (settings: RoomSettings) => void;
  onStart: () => void;
}) {
  const me = room.players.find((player) => player.id === playerId)!;
  const allReady = room.players
    .filter((player) => !player.isHost && player.connected)
    .every((player) => player.isReady);
  return (
    <section className={styles.lobbyLayout}>
      <div className={styles.lobbyIntro}>
        <p className={styles.eyebrow}>
          {room.settings.mode === 'voice'
            ? 'Le studio se remplit'
            : room.settings.mode === 'map'
              ? 'L’expédition se prépare'
              : 'L’atelier se remplit'}
        </p>
        <h1>
          {room.settings.mode === 'voice'
            ? 'Préparez vos meilleures voix.'
            : room.settings.mode === 'map'
              ? 'Aiguisez votre sens de l’orientation.'
              : 'Préparez vos pinceaux.'}
        </h1>
        <p>
          Partagez le code <strong>{room.code}</strong> ou le lien d’invitation, puis lancez lorsque
          tout le monde est prêt.
        </p>
        <Blobel />
      </div>
      <div className={styles.lobbyCard}>
        <div className={styles.cardHeading}>
          <h2>
            Artistes <span>{room.players.length}</span>
          </h2>
          <small>Mise à jour en direct</small>
        </div>
        <PlayerList players={room.players} drawerId={undefined} />
        {!me.isHost && (
          <button
            className={me.isReady ? styles.secondaryButton : styles.primaryButton}
            data-testid="ready-button"
            onClick={() => onReady(!me.isReady)}
          >
            {me.isReady ? 'Je ne suis plus prêt' : 'Je suis prêt'}
          </button>
        )}
      </div>
      <div className={styles.settingsCard}>
        <div className={styles.cardHeading}>
          <h2>Réglages</h2>
          {!me.isHost && <small>Définis par l’hôte</small>}
        </div>
        <label>
          Mode de jeu
          <select
            data-testid="game-mode"
            disabled={!me.isHost}
            value={room.settings.mode}
            onChange={(event) =>
              onSettings({
                ...room.settings,
                mode: event.target.value as RoomSettings['mode'],
              })
            }
          >
            <option value="drawing">Dessin mystère</option>
            <option value="voice">Imitation vocale</option>
            <option value="map">HexaMap · localisation</option>
          </select>
          <small className={styles.settingHelp}>
            {room.settings.mode === 'voice'
              ? 'Écoutez une réplique originale, imitez-la, faites deviner le champion.'
              : room.settings.mode === 'map'
                ? 'Repérez un lieu fixe puis placez une balise sur la bonne carte.'
                : 'Dessinez un champion et faites-le deviner.'}
          </small>
        </label>
        <label>
          Nombre de manches
          <select
            disabled={!me.isHost}
            value={room.settings.rounds}
            onChange={(event) =>
              onSettings({ ...room.settings, rounds: Number(event.target.value) })
            }
          >
            <option value="1">1 manche</option>
            <option value="3">3 manches</option>
            <option value="5">5 manches</option>
            <option value="10">10 manches</option>
          </select>
        </label>
        {room.settings.mode === 'voice' && (
          <label>
            Langue des répliques
            <select
              data-testid="voice-language"
              disabled={!me.isHost}
              value={room.settings.voiceLanguage}
              onChange={(event) =>
                onSettings({
                  ...room.settings,
                  voiceLanguage: event.target.value as RoomSettings['voiceLanguage'],
                })
              }
            >
              <option value="fr">Français</option>
              <option value="en">Anglais</option>
            </select>
            <small className={styles.settingHelp}>
              Tous les joueurs utilisent la langue choisie par l’hôte.
            </small>
          </label>
        )}
        <label>
          Durée d’une manche
          <select
            disabled={!me.isHost}
            value={room.settings.roundDuration}
            onChange={(event) =>
              onSettings({ ...room.settings, roundDuration: Number(event.target.value) })
            }
          >
            <option value="90">90 secondes</option>
            <option value="120">120 secondes</option>
            <option value="150">150 secondes</option>
            <option value="180">180 secondes</option>
          </select>
        </label>
        {room.settings.mode === 'drawing' && (
          <label>
            Révélation des lettres
            <select
              disabled={!me.isHost}
              value={room.settings.revealInterval}
              onChange={(event) =>
                onSettings({ ...room.settings, revealInterval: Number(event.target.value) })
              }
            >
              <option value="20">Toutes les 20 s</option>
              <option value="30">Toutes les 30 s</option>
              <option value="45">Toutes les 45 s</option>
            </select>
          </label>
        )}
        {room.settings.mode === 'map' && (
          <div className={styles.mapDistribution}>
            <strong>Répartition des lieux</strong>
            <span>Faille 85 % · ARAM 10 % · Forêt torturée 5 %</span>
          </div>
        )}
        {me.isHost && (
          <button
            className={styles.primaryButton}
            data-testid="start-game"
            disabled={room.players.filter((p) => p.connected).length < 2 || !allReady}
            onClick={onStart}
          >
            Lancer la partie <span>→</span>
          </button>
        )}
      </div>
    </section>
  );
}

function PlayerList({
  players,
  drawerId,
  drawerLabel = 'Dessine',
  guessedLabel = 'A trouvé',
}: {
  players: Array<{
    id: string;
    nickname: string;
    isHost: boolean;
    isReady: boolean;
    connected: boolean;
    hasGuessed: boolean;
    score: number;
  }>;
  drawerId: string | undefined;
  drawerLabel?: string;
  guessedLabel?: string;
}) {
  return (
    <ul className={styles.playerList}>
      {players.map((player, index) => (
        <li key={player.id} className={!player.connected ? styles.disconnected : ''}>
          <span className={styles.avatar}>{player.nickname.slice(0, 1).toUpperCase()}</span>
          <div>
            <strong>{player.nickname}</strong>
            <small>
              {player.id === drawerId
                ? drawerLabel
                : player.isHost
                  ? 'Hôte'
                  : player.hasGuessed
                    ? guessedLabel
                    : player.isReady
                      ? 'Prêt'
                      : 'En attente'}
            </small>
          </div>
          {player.score > 0 && <b>{player.score}</b>}
          {index < 3 && player.score > 0 && <em>#{index + 1}</em>}
          <i
            className={player.hasGuessed || player.isReady || player.isHost ? styles.readyDot : ''}
          />
        </li>
      ))}
    </ul>
  );
}

function Results({
  room,
  rankedPlayers,
  isHost,
  onReplay,
}: {
  room: NonNullable<ReturnType<typeof useGameSocket>['room']>;
  rankedPlayers: NonNullable<ReturnType<typeof useGameSocket>['room']>['players'];
  isHost: boolean;
  onReplay: () => void;
}) {
  const final = room.phase === 'GAME_RESULTS';
  const roundComplete = room.playersPerRound > 0 && room.turn % room.playersPerRound === 0;
  const result = room.result!;
  const isMapResult = result.kind === 'map';
  return (
    <section className={styles.results} data-testid="round-result">
      <p className={styles.eyebrow}>
        {final
          ? 'Partie terminée'
          : isMapResult
            ? `Manche ${room.round} terminée`
            : roundComplete
            ? `Manche ${room.round} terminée`
            : 'Tour de dessin terminé'}
      </p>
      <h1>
        {final ? 'Le podium de la partie' : isMapResult ? 'Le lieu était ici…' : 'Le champion était…'}
      </h1>
      {!final && result.kind === 'champion' && (
        <div className={styles.revealCard}>
          <img src={result.champion.imageUrl} alt="" />
          <div>
            <small>Champion attendu</small>
            <strong>{result.champion.name}</strong>
          </div>
        </div>
      )}
      {!final && result.kind === 'map' && (
        <div className={styles.mapResultCard}>
          <div className={styles.mapResultHeading}>
            <div>
              <small>{result.challenge.mapName}</small>
              <strong>{result.locationName}</strong>
            </div>
            <span>★ position exacte</span>
          </div>
          <div className={styles.mapResultOverview}>
            <img src={result.challenge.imageUrl} alt={`Solution sur ${result.challenge.mapName}`} />
            <span
              className={`${styles.mapPin} ${styles.targetPin}`}
              style={{ left: `${result.target.x * 100}%`, top: `${result.target.y * 100}%` }}
              title="Position exacte"
            >
              ★
            </span>
            {result.guesses.map((guess) => (
              <span
                key={guess.playerId}
                className={styles.resultPin}
                style={{ left: `${guess.guess.x * 100}%`, top: `${guess.guess.y * 100}%` }}
                title={`${guess.nickname} · ${guess.points} points`}
              >
                {guess.nickname.slice(0, 1).toUpperCase()}
              </span>
            ))}
          </div>
        </div>
      )}
      {final ? (
        <ol className={styles.podium}>
          {rankedPlayers.slice(0, 3).map((player, index) => (
            <li key={player.id}>
              <span>#{index + 1}</span>
              <strong>{player.nickname}</strong>
              <b>{player.score} pts</b>
            </li>
          ))}
        </ol>
      ) : result.kind === 'map' ? (
        <div className={styles.roundSummary}>
          <h2>Précision des balises</h2>
          {result.guesses.length ? (
            result.guesses.map((guess) => (
              <p key={guess.playerId}>
                <span>
                  {guess.position}. {guess.nickname}
                </span>
                <strong>+{guess.points}</strong>
              </p>
            ))
          ) : (
            <p>Aucune balise posée cette fois.</p>
          )}
        </div>
      ) : (
        <div className={styles.roundSummary}>
          <h2>Points de la manche</h2>
          {result.winners.length ? (
            result.winners.map((winner) => (
              <p key={winner.playerId}>
                <span>
                  {winner.position}. {winner.nickname}
                </span>
                <strong>+{winner.points}</strong>
              </p>
            ))
          ) : (
            <p>Personne n’a trouvé cette fois.</p>
          )}
          <p>
            <span>Dessinateur</span>
            <strong>+{result.drawerPoints}</strong>
          </p>
        </div>
      )}
      {final ? (
        isHost ? (
          <button className={styles.primaryButton} onClick={onReplay}>
            Rejouer avec le même groupe
          </button>
        ) : (
          <p>L’hôte peut relancer une partie.</p>
        )
      ) : (
        <>
          <Timer endsAt={room.endsAt} />
          <p>La suite se prépare automatiquement…</p>
        </>
      )}
    </section>
  );
}

function Footer({ legalText, compact = false }: { legalText: string; compact?: boolean }) {
  return (
    <footer className={`${styles.footer} ${compact ? styles.footerCompact : ''}`}>
      <div>
        <strong>HexaGuess</strong>
        <span>Un projet communautaire indépendant.</span>
      </div>
      <p>{legalText}</p>
    </footer>
  );
}
