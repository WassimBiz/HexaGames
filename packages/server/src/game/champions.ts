import type { Champion } from '@hexaguess/shared';
import { randomInt } from 'node:crypto';
import { fallbackChampionData } from './fallbackChampions.js';
import { championNumericIds } from './championNumericIds.js';

interface DataDragonChampion {
  id: string;
  name: string;
  key: string;
}

interface DataDragonResponse {
  data: Record<string, DataDragonChampion>;
}

const fallbackVersion = '16.16.1';
const fallbackData: Array<{ id: string; name: string; numericId: number }> =
  fallbackChampionData.map(([id, name]) => ({ id, name, numericId: championNumericIds[id]! }));

function withPortraits(
  champions: Array<Pick<Champion, 'id' | 'name'> & { key?: string; numericId?: number }>,
  version: string,
): Champion[] {
  return champions.map((champion) => {
    const numericId = champion.numericId ?? (champion.key ? Number(champion.key) : undefined);
    const result: Champion = {
      id: champion.id,
      name: champion.name,
      imageUrl: `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${champion.id}.png`,
    };
    if (numericId !== undefined) result.numericId = numericId;
    return result;
  });
}

export interface ChampionProvider {
  load(): Promise<Champion[]>;
}

export class DataDragonChampionProvider implements ChampionProvider {
  private cache?: Champion[];

  constructor(private readonly disabledIds = new Set<string>()) {}

  async load(): Promise<Champion[]> {
    if (this.cache) return this.cache;
    try {
      const signal = AbortSignal.timeout(3_000);
      const versionsResponse = await fetch(
        'https://ddragon.leagueoflegends.com/api/versions.json',
        { signal },
      );
      if (!versionsResponse.ok) throw new Error('Versions Data Dragon indisponibles');
      const versions = (await versionsResponse.json()) as string[];
      const version = versions[0];
      if (!version) throw new Error('Version Data Dragon absente');
      const championsResponse = await fetch(
        `https://ddragon.leagueoflegends.com/cdn/${version}/data/fr_FR/champion.json`,
        { signal },
      );
      if (!championsResponse.ok) throw new Error('Champions Data Dragon indisponibles');
      const payload = (await championsResponse.json()) as DataDragonResponse;
      this.cache = withPortraits(Object.values(payload.data), version).filter(
        (champion) => !this.disabledIds.has(champion.id),
      );
    } catch (error) {
      console.warn(
        '[champions] Data Dragon indisponible, utilisation du fichier de secours.',
        error instanceof Error ? error.message : 'erreur inconnue',
      );
      this.cache = withPortraits(fallbackData, fallbackVersion).filter(
        (champion) => !this.disabledIds.has(champion.id),
      );
    }
    return this.cache;
  }
}

export class StaticChampionProvider implements ChampionProvider {
  constructor(private readonly champions: Champion[]) {}
  async load(): Promise<Champion[]> {
    return this.champions;
  }
}

export function pickDistinctChampions(champions: Champion[], count = 3): Champion[] {
  if (champions.length < count) throw new Error('Catalogue de champions insuffisant');
  const copy = [...champions];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const target = randomInt(index + 1);
    [copy[index], copy[target]] = [copy[target]!, copy[index]!];
  }
  return copy.slice(0, count);
}

export function drawChampionChoices(
  champions: Champion[],
  currentDeck: Champion[],
  count = 3,
): { choices: Champion[]; deck: Champion[] } {
  if (champions.length < count) throw new Error('Catalogue de champions insuffisant');
  const deck = [...currentDeck];
  if (deck.length < count) {
    const alreadyQueued = new Set(deck.map((champion) => champion.id));
    deck.push(
      ...pickDistinctChampions(
        champions.filter((champion) => !alreadyQueued.has(champion.id)),
        champions.length - alreadyQueued.size,
      ),
    );
  }
  return { choices: deck.splice(0, count), deck };
}
