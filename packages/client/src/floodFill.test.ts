import { describe, expect, it } from 'vitest';
import { floodFillPixels, hexToRgb } from './floodFill';

function pixel(data: Uint8ClampedArray, width: number, x: number, y: number): number[] {
  return [...data.slice((y * width + x) * 4, (y * width + x) * 4 + 4)];
}

describe('remplissage par zone', () => {
  it('remplit uniquement l’intérieur d’un contour fermé', () => {
    const width = 7;
    const height = 7;
    const cream = [247, 240, 221, 255];
    const black = [20, 20, 20, 255];
    const data = new Uint8ClampedArray(width * height * 4);
    for (let index = 0; index < width * height; index += 1) data.set(cream, index * 4);
    for (let coordinate = 2; coordinate <= 4; coordinate += 1) {
      data.set(black, (2 * width + coordinate) * 4);
      data.set(black, (4 * width + coordinate) * 4);
      data.set(black, (coordinate * width + 2) * 4);
      data.set(black, (coordinate * width + 4) * 4);
    }

    expect(floodFillPixels(data, width, height, 3, 3, hexToRgb('#22AA44'))).toBe(true);
    expect(pixel(data, width, 3, 3)).toEqual([34, 170, 68, 255]);
    expect(pixel(data, width, 0, 0)).toEqual(cream);
    expect(pixel(data, width, 2, 3)).toEqual(black);
  });

  it('remplit seulement l’extérieur lorsque le clic est hors du contour', () => {
    const width = 5;
    const height = 5;
    const data = new Uint8ClampedArray(width * height * 4).fill(255);
    const black = [0, 0, 0, 255];
    for (let coordinate = 1; coordinate <= 3; coordinate += 1) {
      data.set(black, (1 * width + coordinate) * 4);
      data.set(black, (3 * width + coordinate) * 4);
      data.set(black, (coordinate * width + 1) * 4);
      data.set(black, (coordinate * width + 3) * 4);
    }

    floodFillPixels(data, width, height, 0, 0, hexToRgb('#8B5CF6'));
    expect(pixel(data, width, 0, 0)).toEqual([139, 92, 246, 255]);
    expect(pixel(data, width, 2, 2)).toEqual([255, 255, 255, 255]);
  });
});
