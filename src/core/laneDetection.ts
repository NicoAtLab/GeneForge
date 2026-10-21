import type { PixelRect } from '../types.ts';
import { signalAt } from './gels.ts';
export interface LaneDetection {
  count: number | null;
  polarity: 'dark' | 'light';
  centres: number[];
  confidence: 'high' | 'medium' | 'low';
  message: string;
}
function quantile(values: number[], fraction: number) {
  const a = [...values].sort((a, b) => a - b);
  return a[Math.min(a.length - 1, Math.floor(fraction * a.length))] ?? 0;
}
/** Detects visible vertical lanes from the brightest 2% of pixels in each column. No band sizing. */
export function detectGelLanes(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  crop: PixelRect,
  requested: 'auto' | 'dark' | 'light' = 'auto',
): LaneDetection {
  const x1 = Math.max(0, Math.ceil(crop.x)),
    x2 = Math.min(width, Math.ceil(crop.x + crop.width));
  const y1 = Math.max(0, Math.ceil(crop.y)),
    y2 = Math.min(height, Math.ceil(crop.y + crop.height));
  if (pixels.length !== width * height * 4 || x2 <= x1 || y2 <= y1)
    throw new Error('Zone de détection invalide.');
  const edges: number[] = [];
  const step = Math.max(1, Math.floor((x2 - x1) / 180));
  for (let x = x1; x < x2; x += step)
    for (const y of [y1, y2 - 1]) {
      const o = (y * width + x) * 4;
      edges.push((pixels[o] + pixels[o + 1] + pixels[o + 2]) / 3);
    }
  const polarity =
    requested === 'auto' ? (quantile(edges, 0.5) < 128 ? 'dark' : 'light') : requested;
  const profile: number[] = [];
  const take = Math.max(2, Math.ceil((y2 - y1) * 0.02));
  for (let x = x1; x < x2; x++) {
    const bins = new Uint32Array(256);
    for (let y = y1; y < y2; y++)
      bins[
        Math.max(0, Math.min(255, Math.round(signalAt(pixels, (y * width + x) * 4, polarity))))
      ]++;
    let remaining = take,
      sum = 0;
    for (let level = 255; level >= 0 && remaining > 0; level--) {
      const used = Math.min(remaining, bins[level]);
      sum += level * used;
      remaining -= used;
    }
    profile.push(sum / Math.max(1, take - remaining));
  }
  const radius = Math.max(1, Math.floor(profile.length / 600));
  const smooth = profile.map((_, i) => {
    let sum = 0,
      n = 0;
    for (let j = Math.max(0, i - radius); j <= Math.min(profile.length - 1, i + radius); j++) {
      sum += profile[j];
      n++;
    }
    return sum / n;
  });
  const base = quantile(smooth, 0.2),
    maximum = Math.max(...smooth),
    noise = quantile(
      profile.map((v, i) => Math.abs(v - smooth[i])),
      0.8,
    );
  const empty: LaneDetection = {
    count: null,
    polarity,
    centres: [],
    confidence: 'low',
    message:
      'Détection non concluante. Sélectionne précisément le gel ou indique le nombre de pistes.',
  };
  if (maximum - base < 12) return empty;
  const threshold = base + Math.max(8, (maximum - base) * 0.12, noise * 4);
  const segments: { start: number; end: number }[] = [];
  let start = -1;
  for (let x = 0; x <= smooth.length; x++) {
    if (x < smooth.length && smooth[x] > threshold) {
      if (start < 0) start = x;
    } else if (start >= 0) {
      segments.push({ start, end: x });
      start = -1;
    }
  }
  const merged: { start: number; end: number }[] = [];
  for (const s of segments) {
    const last = merged.at(-1);
    if (last && s.start - last.end <= radius * 2 + 1) last.end = s.end;
    else merged.push({ ...s });
  }
  const peaks = merged.filter(
    (s) =>
      s.end - s.start >= Math.max(2, profile.length / 350) &&
      s.end - s.start < profile.length * 0.6,
  );
  if (peaks.length < 2 || peaks.length > 48) return empty;
  const centres = peaks.map((s) => x1 + (s.start + s.end) / 2),
    distances = centres.slice(1).map((x, i) => x - centres[i]);
  const spacing = quantile(distances, 0.45);
  const errors = distances.map((d) => Math.abs(d / spacing - Math.round(d / spacing)));
  if (spacing < 3 || errors.some((e) => e > 0.22) || distances.some((d) => d / spacing > 3.25))
    return { ...empty, centres };
  const count = Math.round((centres.at(-1)! - centres[0]) / spacing) + 1;
  if (count < 2 || count > 48 || crop.width / count < 2) return { ...empty, centres };
  const missing = count - peaks.length;
  const confidence = missing === 0 && errors.every((e) => e < 0.12) ? 'high' : 'medium';
  return {
    count,
    polarity,
    centres,
    confidence,
    message:
      'Détection automatique : ' +
      count +
      ' pistes proposées' +
      (missing ? ' (espacement incluant ' + missing + ' piste(s) sans signal)' : '') +
      '. Vérifie la numérotation sur l’image.',
  };
}
