import { describe, expect, it } from 'vitest';
import { clientEventSchemas } from '@hexaguess/shared';
import { answersMatch, normalizeAnswer } from '../src/game/normalization.js';
import {
  chooseRevealPosition,
  maskChampionName,
  maxRevealedLetters,
  revealablePositions,
} from '../src/game/masking.js';
import { calculateDrawerScore, calculateGuessScore } from '../src/game/scoring.js';
import { logicalRoundForTurn, nextDrawerIndex, totalTurnsForGame } from '../src/game/rotation.js';
import { assertTransition, canTransition } from '../src/game/stateMachine.js';
import { drawChampionChoices } from '../src/game/champions.js';
import { fallbackChampionData } from '../src/game/fallbackChampions.js';
import { championNumericIds } from '../src/game/championNumericIds.js';
import {
  knownEnglishTranscripts,
  voiceLineForChampion,
  voiceModeChampions,
} from '../src/game/voiceLines.js';
import { calculateMapScore, drawMapLocation } from '../src/game/mapChallenges.js';

describe('masquage et indices', () => {
  it('masque un nom simple', () => {
    expect(maskChampionName('Ahri')).toBe('_ _ _ _');
  });

  it('préserve les espaces', () => {
    expect(maskChampionName('Aurelion Sol')).toContain('  ');
  });

  it('préserve les apostrophes', () => {
    expect(maskChampionName("Kai'Sa")).toContain("'");
  });

  it('révèle une lettre sans doublon et jamais un séparateur', () => {
    const revealed = new Set<number>([0]);
    const position = chooseRevealPosition("Kai'Sa", revealed, () => 0);
    expect(position).not.toBe(0);
    expect(position).not.toBe(3);
    expect(revealablePositions("Kai'Sa")).not.toContain(3);
  });

  it('conserve au moins une lettre cachée', () => {
    expect(chooseRevealPosition('AB', new Set([0]), () => 0)).toBeUndefined();
  });

  it('plafonne les indices selon le nombre de lettres', () => {
    expect(maxRevealedLetters('Vi')).toBe(0);
    expect(maxRevealedLetters('Lux')).toBe(1);
    expect(maxRevealedLetters('Ahri')).toBe(2);
    expect(maxRevealedLetters('Akali')).toBe(2);
    expect(maxRevealedLetters('Braum!')).toBe(2);
    expect(maxRevealedLetters('Kai Sa')).toBe(2);
    expect(maxRevealedLetters('Aurelion Sol')).toBe(5);
  });

  it('ne révèle plus rien lorsque le plafond est atteint', () => {
    expect(chooseRevealPosition('Ahri', new Set([0, 1]), () => 0)).toBeUndefined();
    expect(chooseRevealPosition('Lux', new Set([0]), () => 0)).toBeUndefined();
    expect(chooseRevealPosition('Vi', new Set(), () => 0)).toBeUndefined();
  });
});

describe('normalisation des réponses', () => {
  it('ignore la casse', () => expect(answersMatch('aHrI', 'Ahri')).toBe(true));
  it('ignore les accents', () => expect(answersMatch('Zoe', 'Zoé')).toBe(true));
  it('normalise apostrophes et espaces superflus', () => {
    expect(normalizeAnswer('  Kai’Sa  ')).toBe("kai'sa");
    expect(normalizeAnswer('Nunu   et Willump')).toBe('nunu et willump');
  });
});

describe('score', () => {
  it('récompense davantage une réponse rapide et la première place', () => {
    const fastFirst = calculateGuessScore({ elapsedMs: 1_000, durationMs: 90_000, position: 1 });
    const lateSecond = calculateGuessScore({ elapsedMs: 80_000, durationMs: 90_000, position: 2 });
    expect(fastFirst).toBeGreaterThan(lateSecond);
    expect(lateSecond).toBeGreaterThanOrEqual(0);
  });

  it('attribue 75 points par adversaire au dessinateur', () => {
    expect(calculateDrawerScore(3)).toBe(225);
    expect(calculateDrawerScore(0)).toBe(0);
  });
});

describe('mode HexaMap', () => {
  it('respecte les seuils 85 / 10 / 5 du tirage des cartes', () => {
    expect(drawMapLocation(undefined, () => 0.1).mapId).toBe('summoners-rift');
    expect(drawMapLocation(undefined, () => 0.9).mapId).toBe('howling-abyss');
    expect(drawMapLocation(undefined, () => 0.99).mapId).toBe('twisted-treeline');
  });

  it('attribue 1000 points au bon emplacement et moins en s’éloignant', () => {
    expect(calculateMapScore({ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 }).points).toBe(1000);
    expect(calculateMapScore({ x: 0.5, y: 0.5 }, { x: 0.8, y: 0.8 }).points).toBeLessThan(
      1000,
    );
  });

  it('valide uniquement des balises normalisées', () => {
    expect(clientEventSchemas.map_guess.safeParse({ x: 0.2, y: 0.9 }).success).toBe(true);
    expect(clientEventSchemas.map_guess.safeParse({ x: 1.2, y: -0.1 }).success).toBe(false);
  });
});

describe('rotation et machine à états', () => {
  it('fait tourner équitablement le dessinateur', () => {
    expect([nextDrawerIndex(-1, 3), nextDrawerIndex(0, 3), nextDrawerIndex(1, 3)]).toEqual([
      0, 1, 2,
    ]);
    expect(nextDrawerIndex(2, 3)).toBe(0);
  });

  it('compte une manche lorsque chaque joueur a dessiné une fois', () => {
    expect(logicalRoundForTurn(1, 2)).toBe(1);
    expect(logicalRoundForTurn(2, 2)).toBe(1);
    expect(logicalRoundForTurn(3, 2)).toBe(2);
    expect(totalTurnsForGame(3, 2)).toBe(6);
    expect(totalTurnsForGame(2, 4)).toBe(8);
  });

  it('accepte les transitions prévues et refuse les autres', () => {
    expect(canTransition('LOBBY', 'CHOOSING')).toBe(true);
    expect(canTransition('LOBBY', 'DRAWING')).toBe(false);
    expect(() => assertTransition('DRAWING', 'LOBBY')).toThrow('Transition interdite');
  });
});

describe('validation réseau', () => {
  it('accepte uniquement les durées et intervalles proposés dans le lobby', () => {
    expect(
      clientEventSchemas.update_settings.safeParse({
        rounds: 3,
        roundDuration: 150,
        revealInterval: 45,
      }).success,
    ).toBe(true);
    expect(
      clientEventSchemas.update_settings.safeParse({
        rounds: 3,
        roundDuration: 60,
        revealInterval: 15,
      }).success,
    ).toBe(false);
  });

  it('accepte un trait normalisé', () => {
    expect(
      clientEventSchemas.draw_segment.safeParse({
        id: 'stroke-1',
        strokeId: 'gesture-1',
        from: { x: 0.1, y: 0.2 },
        to: { x: 0.2, y: 0.3 },
        color: '#8B5CF6',
        size: 5,
        tool: 'brush',
      }).success,
    ).toBe(true);
  });

  it('accepte encore un ancien client et utilise son segment comme identifiant de trait', () => {
    const parsed = clientEventSchemas.draw_segment.parse({
      id: 'legacy-segment',
      from: { x: 0.1, y: 0.2 },
      to: { x: 0.2, y: 0.3 },
      color: '#8B5CF6',
      size: 5,
      tool: 'brush',
    });
    expect(parsed.strokeId).toBe('legacy-segment');
  });

  it('accepte un remplissage complet de la toile', () => {
    expect(
      clientEventSchemas.draw_segment.safeParse({
        id: 'fill-1',
        strokeId: 'fill-1',
        from: { x: 0.5, y: 0.5 },
        to: { x: 0.5, y: 0.5 },
        color: '#2DD4BF',
        size: 6,
        tool: 'fill',
      }).success,
    ).toBe(true);
  });

  it('refuse coordonnées, couleur et taille malformées', () => {
    expect(
      clientEventSchemas.draw_segment.safeParse({
        id: 'x',
        strokeId: 'gesture-x',
        from: { x: -1, y: 0 },
        to: { x: 2, y: 0 },
        color: 'red',
        size: 999,
        tool: 'laser',
      }).success,
    ).toBe(false);
  });
});

describe('catalogue et tirage des champions', () => {
  it('embarque le catalogue complet jusqu’aux champions les plus récents', () => {
    expect(fallbackChampionData.length).toBeGreaterThanOrEqual(170);
    expect(fallbackChampionData).toContainEqual(['Locke', 'Locke']);
    expect(fallbackChampionData).toContainEqual(['Zaahen', 'Zaahen']);
    expect(fallbackChampionData.every(([id]) => championNumericIds[id] !== undefined)).toBe(true);
  });

  it('ne répète aucun champion avant d’avoir épuisé le paquet', () => {
    const champions = ['Ahri', 'Akali', 'Braum', 'Locke', 'Vi', 'Zoe'].map((id) => ({
      id,
      name: id,
      imageUrl: `${id}.png`,
    }));
    const first = drawChampionChoices(champions, [], 3);
    const second = drawChampionChoices(champions, first.deck, 3);
    expect(new Set([...first.choices, ...second.choices].map(({ id }) => id))).toHaveLength(6);
    expect(new Set(first.choices.map(({ id }) => id))).toHaveLength(3);
    expect(new Set(second.choices.map(({ id }) => id))).toHaveLength(3);
  });
});

describe('mode imitation vocale', () => {
  it('ne propose que les champions disposant d’un audio et d’une transcription', () => {
    const champions = [
      { id: 'Ahri', name: 'Ahri', imageUrl: 'Ahri.png', numericId: 103 },
      { id: 'Braum', name: 'Braum', imageUrl: 'Braum.png', numericId: 201 },
      { id: 'Locke', name: 'Locke', imageUrl: 'Locke.png' },
    ];
    expect(voiceModeChampions(champions).map(({ id }) => id)).toEqual(['Ahri', 'Braum']);
    expect(voiceLineForChampion(champions[2]!, 'fr')).toBeUndefined();
  });

  it('construit les URL françaises et anglaises à partir de l’identifiant Riot', () => {
    const ahri = { id: 'Ahri', name: 'Ahri', imageUrl: 'Ahri.png', numericId: 103 };
    expect(voiceLineForChampion(ahri, 'fr')).toMatchObject({
      audioUrl: expect.stringContaining('/fr_fr/v1/champion-choose-vo/103.ogg'),
      language: 'fr',
    });
    expect(voiceLineForChampion(ahri, 'en')).toMatchObject({
      audioUrl: expect.stringContaining('/default/v1/champion-choose-vo/103.ogg'),
      text: knownEnglishTranscripts.Ahri,
      language: 'en',
    });
  });
});
