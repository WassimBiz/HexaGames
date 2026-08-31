import { describe, expect, it } from 'vitest';
import { createUuid } from './randomId';

describe('createUuid', () => {
  it('produit des UUID v4 distincts compatibles avec le schéma de session', () => {
    const first = createUuid();
    const second = createUuid();
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(second).not.toBe(first);
  });
});
