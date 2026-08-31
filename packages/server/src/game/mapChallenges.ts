import type { MapChallenge, Point } from '@hexaguess/shared';

export interface MapLocation extends MapChallenge {
  locationName: string;
}

const maps = {
  'summoners-rift': {
    mapName: "Faille de l'invocateur",
    imageUrl:
      'https://raw.communitydragon.org/latest/game/assets/maps/info/map11/2dlevelminimap_base_baron1.png',
  },
  'howling-abyss': {
    mapName: 'Abîme hurlant (ARAM)',
    imageUrl:
      'https://raw.communitydragon.org/14.15/game/levels/map12/info/2dlevelminimap.png',
  },
  'twisted-treeline': {
    mapName: 'Forêt torturée',
    imageUrl:
      'https://raw.communitydragon.org/9.22/game/levels/map10/info/2dlevelminimap.png',
  },
} as const;

type MapId = keyof typeof maps;

function location(
  mapId: MapId,
  id: string,
  locationName: string,
  x: number,
  y: number,
  zoom = 3.5,
): MapLocation {
  return { id, mapId, ...maps[mapId], locationName, view: { x, y, zoom } };
}

const locations: Record<MapId, MapLocation[]> = {
  'summoners-rift': [
    location('summoners-rift', 'sr-blue-base', 'Base bleue', 0.13, 0.84, 3.1),
    location('summoners-rift', 'sr-red-base', 'Base rouge', 0.87, 0.16, 3.1),
    location('summoners-rift', 'sr-baron', 'Antre du Baron Nashor', 0.39, 0.27, 4.1),
    location('summoners-rift', 'sr-dragon', 'Fosse du dragon', 0.62, 0.72, 4.1),
    location('summoners-rift', 'sr-blue-top', 'Buff bleu supérieur', 0.57, 0.3, 4.2),
    location('summoners-rift', 'sr-blue-bottom', 'Buff bleu inférieur', 0.42, 0.7, 4.2),
    location('summoners-rift', 'sr-red-top', 'Buff rouge supérieur', 0.72, 0.43, 4.2),
    location('summoners-rift', 'sr-red-bottom', 'Buff rouge inférieur', 0.28, 0.57, 4.2),
    location('summoners-rift', 'sr-top-river', 'Rivière supérieure', 0.42, 0.37, 4.4),
    location('summoners-rift', 'sr-bot-river', 'Rivière inférieure', 0.58, 0.63, 4.4),
    location('summoners-rift', 'sr-mid', 'Voie du milieu', 0.5, 0.5, 4.5),
    location('summoners-rift', 'sr-top-lane', 'Voie du haut', 0.25, 0.28, 4),
    location('summoners-rift', 'sr-bot-lane', 'Voie du bas', 0.75, 0.72, 4),
  ],
  'howling-abyss': [
    location('howling-abyss', 'ha-blue-base', 'Base bleue', 0.16, 0.84, 3),
    location('howling-abyss', 'ha-blue-bridge', 'Entrée bleue du pont', 0.31, 0.69, 4.2),
    location('howling-abyss', 'ha-center', 'Centre du pont', 0.5, 0.5, 4.6),
    location('howling-abyss', 'ha-red-bridge', 'Entrée rouge du pont', 0.69, 0.31, 4.2),
    location('howling-abyss', 'ha-red-base', 'Base rouge', 0.84, 0.16, 3),
  ],
  'twisted-treeline': [
    location('twisted-treeline', 'tt-blue-base', 'Base bleue', 0.18, 0.78, 3.1),
    location('twisted-treeline', 'tt-red-base', 'Base rouge', 0.82, 0.22, 3.1),
    location('twisted-treeline', 'tt-top-altar', 'Autel supérieur', 0.5, 0.28, 4.2),
    location('twisted-treeline', 'tt-bot-altar', 'Autel inférieur', 0.5, 0.7, 4.2),
    location('twisted-treeline', 'tt-center', 'Centre de la forêt', 0.5, 0.5, 4.5),
  ],
};

export function drawMapLocation(previousId?: string, random = Math.random): MapLocation {
  const roll = random();
  const mapId: MapId =
    roll < 0.85 ? 'summoners-rift' : roll < 0.95 ? 'howling-abyss' : 'twisted-treeline';
  const candidates = locations[mapId].filter((candidate) => candidate.id !== previousId);
  return candidates[Math.floor(random() * candidates.length)] ?? locations[mapId][0]!;
}

export function calculateMapScore(target: Point, guess: Point): { points: number; distance: number } {
  const distance = Math.hypot(target.x - guess.x, target.y - guess.y);
  const closeness = Math.max(0, 1 - distance / Math.SQRT2);
  return { points: Math.round(1_000 * closeness ** 2.2), distance };
}
