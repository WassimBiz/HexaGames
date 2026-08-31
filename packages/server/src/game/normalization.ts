export function normalizeAnswer(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’‘`´]/g, "'")
    .toLocaleLowerCase('fr')
    .trim()
    .replace(/\s+/g, ' ');
}

export function answersMatch(candidate: string, expected: string): boolean {
  return normalizeAnswer(candidate) === normalizeAnswer(expected);
}
