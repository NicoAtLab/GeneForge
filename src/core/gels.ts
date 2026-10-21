import type { GelRecord, PixelRect } from '../types.ts';

export const ELAB_URL = 'https://lipme-elab.toulouse.inrae.fr/';
export const MAX_GEL_BYTES = 3 * 1024 * 1024;
export function safeWebUrl(value: string) {
  if (!value) return true;
  try {
    const u = new URL(value);
    return (u.protocol === 'https:' || u.protocol === 'http:') && !u.username && !u.password;
  } catch {
    return false;
  }
}
export function laneRect(crop: PixelRect, count: number, index: number): PixelRect {
  if (!Number.isInteger(count) || count < 1 || index < 0 || index >= count)
    throw new Error('Piste invalide.');
  return {
    x: crop.x + (index * crop.width) / count,
    y: crop.y,
    width: crop.width / count,
    height: crop.height,
  };
}
export function dragRect(
  a: { x: number; y: number },
  b: { x: number; y: number },
  bounds: PixelRect,
): PixelRect {
  const x = Math.max(bounds.x, Math.min(a.x, b.x));
  const y = Math.max(bounds.y, Math.min(a.y, b.y));
  return {
    x,
    y,
    width: Math.max(0, Math.min(bounds.x + bounds.width, Math.max(a.x, b.x)) - x),
    height: Math.max(0, Math.min(bounds.y + bounds.height, Math.max(a.y, b.y)) - y),
  };
}
/** Display RGB samples only, not calibrated optical density. Alpha composites over the selected background. */
export function signalAt(
  pixels: Uint8ClampedArray,
  offset: number,
  polarity: GelRecord['polarity'],
) {
  const alpha = pixels[offset + 3] / 255;
  const rgb = 0.2126 * pixels[offset] + 0.7152 * pixels[offset + 1] + 0.0722 * pixels[offset + 2];
  const value = alpha * rgb + (1 - alpha) * (polarity === 'light' ? 255 : 0);
  return polarity === 'dark' ? value : 255 - value;
}
export function laneProfile(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  rect: PixelRect,
  polarity: GelRecord['polarity'],
) {
  const points: { y: number; signal: number }[] = [];
  const x1 = Math.max(0, Math.ceil(rect.x)),
    x2 = Math.min(width, Math.ceil(rect.x + rect.width));
  for (
    let y = Math.max(0, Math.ceil(rect.y));
    y < Math.min(height, Math.ceil(rect.y + rect.height));
    y++
  ) {
    let sum = 0;
    for (let x = x1; x < x2; x++) sum += signalAt(pixels, (y * width + x) * 4, polarity);
    points.push({ y, signal: x2 > x1 ? sum / (x2 - x1) : 0 });
  }
  return points;
}
/** Samples pixel centres inside the ellipse drawn by the user. No background subtraction. */
export function bandMeasurement(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  rect: PixelRect,
  polarity: GelRecord['polarity'],
) {
  let count = 0,
    sum = 0,
    saturated = 0;
  const rx = rect.width / 2,
    ry = rect.height / 2;
  if (rx <= 0 || ry <= 0) return { count, sum, mean: 0, saturatedPercent: 0 };
  for (
    let y = Math.max(0, Math.floor(rect.y));
    y < Math.min(height, Math.ceil(rect.y + rect.height));
    y++
  ) {
    for (
      let x = Math.max(0, Math.floor(rect.x));
      x < Math.min(width, Math.ceil(rect.x + rect.width));
      x++
    ) {
      if (((x + 0.5 - rect.x - rx) / rx) ** 2 + ((y + 0.5 - rect.y - ry) / ry) ** 2 > 1) continue;
      const signal = signalAt(pixels, (y * width + x) * 4, polarity);
      count++;
      sum += signal;
      if (signal >= 254.5) saturated++;
    }
  }
  return {
    count,
    sum,
    mean: count ? sum / count : 0,
    saturatedPercent: count ? (100 * saturated) / count : 0,
  };
}
