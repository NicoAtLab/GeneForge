import type { GelImage, GelRecord, WorkNote, WorkspaceState } from './types.ts';
import { MAX_GEL_BYTES, laneRect } from './core/gels.ts';
import { sequenceStats } from './core/sequence.ts';

export function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image illisible. Utilise un fichier PNG, JPEG ou WebP.'));
    img.src = dataUrl;
  });
}
export async function readGelImage(file: File): Promise<GelImage> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > MAX_GEL_BYTES)
    throw new Error('Image PNG, JPEG ou WebP de 3 Mio maximum requise.');
  const bytes = await file.arrayBuffer();
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Lecture de l’image impossible.'));
    reader.readAsDataURL(file);
  });
  const img = await loadImage(dataUrl);
  if (img.width > 6000 || img.height > 6000 || img.width * img.height > 12_000_000)
    throw new Error('Image limitée à 6 000 pixels par côté et 12 millions de pixels.');
  return {
    dataUrl,
    fileName: file.name,
    width: img.width,
    height: img.height,
    sha256: Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join(''),
  };
}
export async function gelPixels(gel: GelRecord) {
  const img = await loadImage(gel.image.dataUrl);
  if (img.width !== gel.image.width || img.height !== gel.image.height)
    throw new Error('Dimensions de l’image incohérentes.');
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, img.width, img.height);
}
function wrap(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  width: number,
  lineHeight = 21,
) {
  let line = '';
  for (const char of text) {
    if (char === '\n' || ctx.measureText(line + char).width > width) {
      ctx.fillText(line, x, y);
      y += lineHeight;
      line = char === '\n' ? '' : char;
    } else line += char;
  }
  ctx.fillText(line, x, y);
  return y + lineHeight;
}
export async function gelFigure(gel: GelRecord, laneIndex?: number) {
  const img = await loadImage(gel.image.dataUrl);
  const crop = laneIndex === undefined ? gel.crop : laneRect(gel.crop, gel.lanes.length, laneIndex);
  const scale = Math.min(2, 1400 / crop.width, 1600 / crop.height);
  const width = Math.max(1, Math.ceil(crop.width * scale));
  const height = Math.max(1, Math.ceil(crop.height * scale));
  const canvas = document.createElement('canvas');
  if (laneIndex !== undefined) {
    canvas.width = width;
    canvas.height = height;
    canvas
      .getContext('2d')!
      .drawImage(img, crop.x, crop.y, crop.width, crop.height, 0, 0, width, height);
    return canvas.toDataURL('image/png');
  }
  canvas.width = Math.max(800, width + 410);
  const ctx = canvas.getContext('2d')!;
  let legendHeight = 90;
  for (const [i, lane] of gel.lanes.entries()) {
    ctx.font = 'bold 16px Arial';
    legendHeight = wrap(ctx, `${i + 1} · ${lane.label || 'Sans légende'}`, 0, legendHeight, 320);
    ctx.font = '14px Arial';
    const desc = [lane.description, lane.primers.map((p) => p.name).join(' + ')]
      .filter(Boolean)
      .join(' · ');
    legendHeight =
      wrap(ctx, desc.slice(0, 140) + (desc.length > 140 ? '…' : ''), 0, legendHeight, 320, 18) + 14;
  }
  canvas.height = Math.ceil(Math.max(height + 150, legendHeight + 60));
  const dark = gel.figureBackground === 'black';
  ctx.fillStyle = dark ? '#10141b' : '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = dark ? '#ffffff' : '#182237';
  ctx.font = 'bold 22px Arial';
  wrap(ctx, gel.name, 24, 32, canvas.width - 48, 26);
  const left = 24,
    top = 90;
  ctx.drawImage(img, crop.x, crop.y, crop.width, crop.height, left, top, width, height);
  ctx.font = 'bold 15px Arial';
  ctx.textAlign = 'center';
  gel.lanes.forEach((_, i) => {
    const x = left + (i * width) / gel.lanes.length;
    ctx.fillText(String(i + 1), x + width / gel.lanes.length / 2, top - 12);
    ctx.strokeStyle = dark ? '#ffffff70' : '#00a88b90';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, top, width / gel.lanes.length, height);
  });
  for (const band of gel.bands) {
    ctx.strokeStyle = band.color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(
      left + (band.x + band.width / 2 - crop.x) * scale,
      top + (band.y + band.height / 2 - crop.y) * scale,
      (band.width * scale) / 2,
      (band.height * scale) / 2,
      0,
      0,
      Math.PI * 2,
    );
    ctx.stroke();
  }
  ctx.textAlign = 'left';
  let y = top;
  for (const [i, lane] of gel.lanes.entries()) {
    ctx.fillStyle = dark ? '#ffffff' : '#182237';
    ctx.font = 'bold 16px Arial';
    y = wrap(ctx, `${i + 1} · ${lane.label || 'Sans légende'}`, width + 52, y, 320);
    ctx.font = '14px Arial';
    const desc = [lane.description, lane.primers.map((p) => p.name).join(' + ')]
      .filter(Boolean)
      .join(' · ');
    y = wrap(ctx, desc.slice(0, 140) + (desc.length > 140 ? '…' : ''), width + 52, y, 320, 18) + 14;
  }
  ctx.font = '12px Arial';
  ctx.fillText(
    'GeneForge · Recadrage non destructif · Légendes détaillées dans le rapport',
    24,
    canvas.height - 20,
  );
  return canvas.toDataURL('image/png');
}
export function saveDataUrl(url: string, name: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
}
export function gelText(gel: GelRecord) {
  const coord = (n: number) => Number(n.toFixed(2));
  return [
    gel.name,
    gel.notes,
    `Image : ${gel.image.fileName} · ${gel.image.width} × ${gel.image.height} px`,
    `SHA-256 : ${gel.image.sha256}`,
    `Recadrage (pixels, origine haut-gauche) : x=${coord(gel.crop.x)}, y=${coord(gel.crop.y)}, largeur=${coord(gel.crop.width)}, hauteur=${coord(gel.crop.height)}`,
    `Fond du gel : ${gel.polarity === 'dark' ? 'noir, bandes claires' : 'blanc, bandes sombres'}`,
    ...gel.lanes.flatMap((lane, i) => [
      `Piste ${i + 1} — ${lane.label}`,
      lane.description,
      ...lane.primers.map((p) => {
        const stats = sequenceStats(p.sequence);
        return `Amorce : ${p.name} · ${p.orientation}\n5′ ${p.sequence} 3′\n${stats.length} nt · GC ${stats.gc?.toFixed(1) ?? 'indéterminé'} %\n${p.notes}\nSource : ${p.sourceFile ?? 'fiche locale'} · copie du ${p.capturedAt}`;
      }),
      ...gel.bands
        .filter((b) => b.laneId === lane.id)
        .map(
          (b) =>
            `Bande : ${b.label || 'Sans titre'} · contour ${b.color} · x=${coord(b.x)}, y=${coord(b.y)}, largeur=${coord(b.width)}, hauteur=${coord(b.height)} px`,
        ),
    ]),
    gel.elabUrl ? `e-Lab : ${gel.elabUrl}` : '',
    'Contours sélectionnés manuellement. Les intensités de pixels ne sont ni des tailles en pb ni des concentrations calibrées.',
  ]
    .filter(Boolean)
    .join('\n\n');
}
export function noteText(note: WorkNote, state: WorkspaceState) {
  return [
    note.name,
    note.body,
    note.fileReferences ? `Références de fichiers sur serveur\n${note.fileReferences}` : '',
    note.elabUrl ? `e-Lab : ${note.elabUrl}` : '',
    ...note.gelIds.map((id) => {
      const gel = state.gels.find((g) => g.id === id);
      return gel ? gelText(gel) : `Gel lié indisponible : ${id}`;
    }),
  ]
    .filter(Boolean)
    .join('\n\n');
}
export async function copyReport(text: string) {
  const escaped = text.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard.write) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/plain': new Blob([text], { type: 'text/plain' }),
          'text/html': new Blob([`<div style="white-space:pre-wrap">${escaped}</div>`], {
            type: 'text/html',
          }),
        }),
      ]);
      return;
    } catch {
      /* A plain-text clipboard remains useful in restricted browsers. */
    }
  }
  await navigator.clipboard.writeText(text);
}
