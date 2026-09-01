import type { MapChallenge, Point } from '@hexaguess/shared';

export interface MapLocation extends MapChallenge {
  locationName: string;
}

const maps = {
  'summoners-rift': {
    mapName: "Faille de l'invocateur",
    imageUrl: 'https://ddragon.leagueoflegends.com/cdn/6.8.1/img/map/map11.png',
  },
  'howling-abyss': {
    mapName: 'ARAM · Abîme hurlant',
    imageUrl: 'https://ddragon.leagueoflegends.com/cdn/6.8.1/img/map/map12.png',
  },
  'twisted-treeline': {
    mapName: 'Forêt torturée',
    imageUrl: 'https://ddragon.leagueoflegends.com/cdn/6.8.1/img/map/map10.png',
  },
} as const;

type MapId = keyof typeof maps;

const riotCaptures = {
  infernalDragonPit:
    'https://nexus.leagueoflegends.com/wp-content/uploads/2019/12/07_SRX_Infernal_Pit_bwrjyy1fii43le7mwcre.jpg',
  oceanRedBuff:
    'https://nexus.leagueoflegends.com/wp-content/uploads/2019/12/09_SRX_OceanRedBuff_uf3k2l64c3utw2wyk3vp.png',
  midLane:
    'https://nexus.leagueoflegends.com/wp-content/uploads/2018/11/MinionsFighting_e12c7fqpsi0sw8t6hyt0.png',
  midTurret:
    'https://nexus.leagueoflegends.com/wp-content/uploads/2009/10/turret_destruction_sbc1q5g9gks4k3he2tul.jpg',
  orderJungle:
    'https://nexus.leagueoflegends.com/wp-content/uploads/2019/12/10_Infernal_Order_Jungle_elgd7mvvfjb2lpenf4np.jpg',
  botAlcove:
    'https://nexus.leagueoflegends.com/wp-content/uploads/2019/12/08_SRE_Alcoves_cpnhnuvd7gobhdrstf82.jpg',
  aramBridge:
    'https://nexus.leagueoflegends.com/wp-content/uploads/2019/03/01_Butcher_s_Bridge_nrfazkihqt25pbif08mb.png',
  twistedTreeline:
    'https://nexus.leagueoflegends.com/wp-content/uploads/2019/07/06_Twisted_Treeline_qw5zkjtf62zew5kjxrxe.jpg',
} as const;

function location(
  mapId: MapId,
  id: string,
  locationName: string,
  x: number,
  y: number,
  clueImageUrl: string,
  zoom = 3.5,
): MapLocation {
  return {
    id,
    mapId,
    ...maps[mapId],
    locationName,
    clueImageUrl,
    view: { x, y, zoom },
  };
}

const locations: Record<MapId, MapLocation[]> = {
  'summoners-rift': [
    location(
      'summoners-rift',
      'sr-dragon-infernal',
      'Fosse du dragon',
      0.62,
      0.72,
      riotCaptures.infernalDragonPit,
      4.1,
    ),
    location(
      'summoners-rift',
      'sr-red-bottom',
      'Buff rouge inférieur',
      0.28,
      0.57,
      riotCaptures.oceanRedBuff,
      4.2,
    ),
    location('summoners-rift', 'sr-mid', 'Voie du milieu', 0.5, 0.5, riotCaptures.midLane, 4.5),
    location(
      'summoners-rift',
      'sr-mid-turret',
      'Tourelle de la voie du milieu',
      0.56,
      0.44,
      riotCaptures.midTurret,
      4.2,
    ),
    location(
      'summoners-rift',
      'sr-order-jungle',
      'Jungle inférieure',
      0.34,
      0.66,
      riotCaptures.orderJungle,
      4.2,
    ),
    location(
      'summoners-rift',
      'sr-bot-alcove',
      'Alcôve de la voie du bas',
      0.83,
      0.82,
      riotCaptures.botAlcove,
      4.4,
    ),
  ],
  'howling-abyss': [
    location(
      'howling-abyss',
      'ha-center',
      'Centre du pont',
      0.5,
      0.5,
      riotCaptures.aramBridge,
      4.6,
    ),
  ],
  'twisted-treeline': [
    location(
      'twisted-treeline',
      'tt-center',
      'Centre de la forêt',
      0.5,
      0.5,
      riotCaptures.twistedTreeline,
      4.5,
    ),
  ],
};

export function drawMapLocation(previousId?: string, random = Math.random): MapLocation {
  const roll = random();
  const mapId: MapId =
    roll < 0.85 ? 'summoners-rift' : roll < 0.95 ? 'howling-abyss' : 'twisted-treeline';
  const candidates = locations[mapId].filter((candidate) => candidate.id !== previousId);
  return candidates[Math.floor(random() * candidates.length)] ?? locations[mapId][0]!;
}

export function calculateMapScore(
  target: Point,
  guess: Point,
): { points: number; distance: number } {
  const distance = Math.hypot(target.x - guess.x, target.y - guess.y);
  const closeness = Math.max(0, 1 - distance / Math.SQRT2);
  return { points: Math.round(1_000 * closeness ** 2.2), distance };
}
