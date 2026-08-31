import { useCallback, useEffect, useRef, useState } from 'react';

export type SoundEffect = 'choose' | 'drawStart' | 'found' | 'reveal' | 'fanfare';

interface AmbientSound {
  master: GainNode;
  oscillators: OscillatorNode[];
  timer: number;
}

const soundPreferenceKey = 'hexaguess:sound-muted';

function addTone(
  context: AudioContext,
  frequency: number,
  delay: number,
  duration: number,
  volume: number,
  type: OscillatorType = 'sine',
): void {
  const start = context.currentTime + delay;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.018);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

function addInkWhoosh(context: AudioContext, delay = 0): void {
  const duration = 0.22;
  const frameCount = Math.ceil(context.sampleRate * duration);
  const buffer = context.createBuffer(1, frameCount, context.sampleRate);
  const channel = buffer.getChannelData(0);
  for (let index = 0; index < frameCount; index += 1) {
    const envelope = 1 - index / frameCount;
    channel[index] = (Math.random() * 2 - 1) * envelope;
  }
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  const start = context.currentTime + delay;
  source.buffer = buffer;
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(900, start);
  filter.frequency.exponentialRampToValueAtTime(180, start + duration);
  gain.gain.setValueAtTime(0.055, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  source.connect(filter).connect(gain).connect(context.destination);
  source.start(start);
}

function createReverb(context: AudioContext): ConvolverNode {
  const duration = 2.8;
  const frameCount = Math.ceil(context.sampleRate * duration);
  const impulse = context.createBuffer(2, frameCount, context.sampleRate);
  for (let channelIndex = 0; channelIndex < impulse.numberOfChannels; channelIndex += 1) {
    const channel = impulse.getChannelData(channelIndex);
    for (let index = 0; index < frameCount; index += 1) {
      const envelope = (1 - index / frameCount) ** 2.6;
      channel[index] = (Math.random() * 2 - 1) * envelope;
    }
  }
  const reverb = context.createConvolver();
  reverb.buffer = impulse;
  return reverb;
}

function addSoftPianoNote(
  context: AudioContext,
  dryDestination: AudioNode,
  wetDestination: AudioNode,
  frequency: number,
  volume: number,
): void {
  const now = context.currentTime;
  const fundamental = context.createOscillator();
  const harmonic = context.createOscillator();
  const harmonicGain = context.createGain();
  const envelope = context.createGain();
  const filter = context.createBiquadFilter();
  fundamental.type = 'sine';
  fundamental.frequency.setValueAtTime(frequency, now);
  harmonic.type = 'triangle';
  harmonic.frequency.setValueAtTime(frequency * 2, now);
  harmonicGain.gain.setValueAtTime(0.11, now);
  envelope.gain.setValueAtTime(0.0001, now);
  envelope.gain.exponentialRampToValueAtTime(volume, now + 0.025);
  envelope.gain.exponentialRampToValueAtTime(volume * 0.3, now + 0.65);
  envelope.gain.exponentialRampToValueAtTime(0.0001, now + 3.8);
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(2_400, now);
  filter.frequency.exponentialRampToValueAtTime(900, now + 3.5);
  fundamental.connect(envelope);
  harmonic.connect(harmonicGain).connect(envelope);
  envelope.connect(filter);
  filter.connect(dryDestination);
  filter.connect(wetDestination);
  fundamental.start(now);
  harmonic.start(now);
  fundamental.stop(now + 4);
  harmonic.stop(now + 4);
}

function createAmbientSound(context: AudioContext): AmbientSound {
  const now = context.currentTime;
  const master = context.createGain();
  const padFilter = context.createBiquadFilter();
  const dry = context.createGain();
  const wet = context.createGain();
  const reverb = createReverb(context);
  const oscillators: OscillatorNode[] = [];
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(0.18, now + 1.8);
  dry.gain.setValueAtTime(0.9, now);
  wet.gain.setValueAtTime(0.28, now);
  padFilter.type = 'lowpass';
  padFilter.frequency.setValueAtTime(580, now);
  padFilter.Q.setValueAtTime(0.65, now);
  padFilter.connect(master);
  dry.connect(master);
  reverb.connect(wet).connect(master);
  master.connect(context.destination);

  [130.81, 196, 261.63, 329.63].forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const voiceGain = context.createGain();
    oscillator.type = index === 2 ? 'triangle' : 'sine';
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.detune.setValueAtTime(index * 2 - 3, now);
    voiceGain.gain.setValueAtTime(index === 0 ? 0.025 : 0.04, now);
    oscillator.connect(voiceGain).connect(padFilter);
    oscillator.start(now);
    oscillators.push(oscillator);
  });

  const melody = [261.63, 329.63, 392, 493.88, 440, 349.23, 293.66, 392];
  let noteIndex = 0;
  const playNextNote = () => {
    const frequency = melody[noteIndex % melody.length]!;
    addSoftPianoNote(context, dry, reverb, frequency, 0.2);
    if (noteIndex % 4 === 0) addSoftPianoNote(context, dry, reverb, frequency / 2, 0.08);
    noteIndex += 1;
  };
  playNextNote();
  const timer = window.setInterval(playNextNote, 2_750);
  return { master, oscillators, timer };
}

function fadeOutAmbient(context: AudioContext, ambient: AmbientSound): void {
  const now = context.currentTime;
  ambient.master.gain.cancelScheduledValues(now);
  ambient.master.gain.setValueAtTime(Math.max(ambient.master.gain.value, 0.0001), now);
  ambient.master.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
  window.clearInterval(ambient.timer);
  ambient.oscillators.forEach((oscillator) => oscillator.stop(now + 0.5));
}

export function useSoundEffects() {
  const contextRef = useRef<AudioContext | null>(null);
  const ambientRef = useRef<AmbientSound | null>(null);
  const ambienceWantedRef = useRef(false);
  const [muted, setMuted] = useState(() => localStorage.getItem(soundPreferenceKey) === 'true');

  const getContext = useCallback(() => {
    contextRef.current ??= new AudioContext();
    if (contextRef.current.state === 'suspended') void contextRef.current.resume();
    return contextRef.current;
  }, []);

  const startAmbience = useCallback((context: AudioContext) => {
    ambientRef.current ??= createAmbientSound(context);
  }, []);

  const stopAmbience = useCallback(() => {
    const context = contextRef.current;
    const ambient = ambientRef.current;
    if (!context || !ambient) return;
    ambientRef.current = null;
    fadeOutAmbient(context, ambient);
  }, []);

  useEffect(() => {
    const unlock = () => {
      if (!muted) {
        const context = getContext();
        if (ambienceWantedRef.current) startAmbience(context);
      }
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, [getContext, muted, startAmbience]);

  const setAmbience = useCallback(
    (active: boolean) => {
      ambienceWantedRef.current = active;
      if (!active || muted) {
        stopAmbience();
      } else if (contextRef.current) {
        startAmbience(contextRef.current);
      }
    },
    [muted, startAmbience, stopAmbience],
  );

  const play = useCallback(
    (effect: SoundEffect) => {
      if (muted) return;
      const context = getContext();
      if (effect === 'choose') {
        addInkWhoosh(context);
        addTone(context, 440, 0.03, 0.18, 0.045, 'triangle');
        addTone(context, 659, 0.12, 0.24, 0.04, 'sine');
      } else if (effect === 'drawStart') {
        addTone(context, 294, 0, 0.12, 0.035, 'triangle');
        addTone(context, 440, 0.1, 0.16, 0.045, 'triangle');
      } else if (effect === 'found') {
        addTone(context, 523, 0, 0.16, 0.05, 'sine');
        addTone(context, 659, 0.1, 0.18, 0.055, 'sine');
        addTone(context, 784, 0.2, 0.3, 0.06, 'sine');
      } else if (effect === 'reveal') {
        addInkWhoosh(context, 0.2);
        addTone(context, 392, 0.24, 0.32, 0.035, 'triangle');
        addTone(context, 523, 0.28, 0.38, 0.04, 'sine');
      } else {
        [523, 659, 784, 1047].forEach((frequency, index) =>
          addTone(context, frequency, index * 0.13, 0.42, 0.05, 'triangle'),
        );
      }
    },
    [getContext, muted],
  );

  const toggleMuted = useCallback(() => {
    setMuted((current) => {
      const next = !current;
      localStorage.setItem(soundPreferenceKey, String(next));
      if (next) {
        stopAmbience();
      } else {
        const context = getContext();
        if (ambienceWantedRef.current) startAmbience(context);
      }
      return next;
    });
  }, [getContext, startAmbience, stopAmbience]);

  useEffect(
    () => () => {
      stopAmbience();
      if (contextRef.current) void contextRef.current.close();
    },
    [stopAmbience],
  );

  return { muted, play, setAmbience, toggleMuted };
}
