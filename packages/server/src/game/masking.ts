const letterPattern = /\p{L}/u;

export function maskChampionName(name: string, revealed = new Set<number>()): string {
  return Array.from(name)
    .map((character, index) => {
      if (!letterPattern.test(character)) return character;
      return revealed.has(index) ? character : '_';
    })
    .join(' ');
}

export function revealablePositions(name: string): number[] {
  return Array.from(name)
    .map((character, index) => (letterPattern.test(character) ? index : -1))
    .filter((index) => index >= 0);
}

export function maxRevealedLetters(name: string): number {
  const letterCount = revealablePositions(name).length;
  if (letterCount <= 2) return 0;
  return Math.min(5, Math.floor(letterCount / 2));
}

export function chooseRevealPosition(
  name: string,
  revealed: ReadonlySet<number>,
  random: () => number = Math.random,
): number | undefined {
  const positions = revealablePositions(name);
  const revealedLetterCount = positions.filter((position) => revealed.has(position)).length;
  if (revealedLetterCount >= maxRevealedLetters(name)) return undefined;
  const hidden = positions.filter((position) => !revealed.has(position));
  if (hidden.length === 0) return undefined;
  return hidden[Math.floor(random() * hidden.length)];
}
