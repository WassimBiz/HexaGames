export type RgbColor = readonly [red: number, green: number, blue: number];

function matchesColor(data: Uint8ClampedArray, index: number, target: RgbColor): boolean {
  return (
    data[index] === target[0] &&
    data[index + 1] === target[1] &&
    data[index + 2] === target[2] &&
    data[index + 3] === 255
  );
}

export function hexToRgb(hex: string): RgbColor {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

export function floodFillPixels(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  startX: number,
  startY: number,
  replacement: RgbColor,
): boolean {
  if (width < 1 || height < 1) return false;
  const x = Math.max(0, Math.min(width - 1, Math.round(startX)));
  const y = Math.max(0, Math.min(height - 1, Math.round(startY)));
  const startIndex = (y * width + x) * 4;
  const target: RgbColor = [data[startIndex]!, data[startIndex + 1]!, data[startIndex + 2]!];
  if (
    target[0] === replacement[0] &&
    target[1] === replacement[1] &&
    target[2] === replacement[2]
  ) {
    return false;
  }

  const stack: number[] = [x, y];
  while (stack.length > 0) {
    const currentY = stack.pop()!;
    const currentX = stack.pop()!;
    let scanX = currentX;
    while (scanX >= 0 && matchesColor(data, (currentY * width + scanX) * 4, target)) {
      scanX -= 1;
    }
    scanX += 1;
    let spanAbove = false;
    let spanBelow = false;

    for (
      ;
      scanX < width && matchesColor(data, (currentY * width + scanX) * 4, target);
      scanX += 1
    ) {
      const index = (currentY * width + scanX) * 4;
      data[index] = replacement[0];
      data[index + 1] = replacement[1];
      data[index + 2] = replacement[2];
      data[index + 3] = 255;

      if (currentY > 0) {
        const matchesAbove = matchesColor(data, ((currentY - 1) * width + scanX) * 4, target);
        if (matchesAbove && !spanAbove) stack.push(scanX, currentY - 1);
        spanAbove = matchesAbove;
      }
      if (currentY < height - 1) {
        const matchesBelow = matchesColor(data, ((currentY + 1) * width + scanX) * 4, target);
        if (matchesBelow && !spanBelow) stack.push(scanX, currentY + 1);
        spanBelow = matchesBelow;
      }
    }
  }
  return true;
}
