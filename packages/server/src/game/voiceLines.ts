import type { Champion } from '@hexaguess/shared';

export interface ChampionVoiceLine {
  text?: string;
  audioUrl: string;
  sourceUrl: string;
  language: 'fr' | 'en';
}

export const knownEnglishTranscripts: Readonly<Record<string, string>> = {
  Aatrox: 'Now, hear the silence of annihilation!',
  Ahri: 'A clever fox is never caught.',
  Akali: 'Fear the assassin with no master.',
  Ashe: 'All the world on one arrow.',
  Braum: 'The heart is the strongest muscle.',
  Caitlyn: "I'm on the case.",
  Darius: 'They will regret opposing me.',
  Draven: 'Welcome to the League of Draven.',
  Ekko: "It's not how much time you have, it's how you use it.",
  Garen: 'My heart and sword always for Demacia.',
  Jhin: 'In carnage, I bloom, like a flower in the dawn.',
  Jinx: 'Rules are made to be broken. Like buildings! Or people!',
  Katarina: 'Violence solves everything.',
  Lux: "Let's light it up!",
  Malphite: 'Rock solid.',
  MasterYi: 'My blade is yours.',
  MissFortune: "Fortune doesn't favor fools.",
  Mordekaiser: 'Destiny. Domination. Deceit.',
  Rammus: 'Okay.',
  Sett: "I'm undisputed.",
  Teemo: 'Captain Teemo on duty.',
  Thresh: 'What delightful agony we shall inflict.',
  Yasuo: 'Death is like the wind; always by my side.',
  Zed: 'The unseen blade is the deadliest.',
};

function sourceDirectory(language: 'fr' | 'en'): string {
  const locale = language === 'fr' ? 'fr_fr' : 'default';
  return `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/${locale}/v1/champion-choose-vo/`;
}

export function voiceLineForChampion(
  champion: Champion,
  language: 'fr' | 'en',
): ChampionVoiceLine | undefined {
  if (champion.numericId === undefined) return undefined;
  const directory = sourceDirectory(language);
  const voiceLine: ChampionVoiceLine = {
    audioUrl: `${directory}${champion.numericId}.ogg`,
    sourceUrl: directory,
    language,
  };
  const transcript = language === 'en' ? knownEnglishTranscripts[champion.id] : undefined;
  if (transcript) voiceLine.text = transcript;
  return voiceLine;
}

export function voiceModeChampions(champions: Champion[]): Champion[] {
  return champions.filter((champion) => champion.numericId !== undefined);
}
