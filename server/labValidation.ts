import { createHash } from 'node:crypto';
import { MAX_GEL_BYTES, safeWebUrl, laneRect } from '../src/core/gels.ts';
import type { WorkspaceState } from '../src/types.ts';

// Separate validator keeps image/notes limits independent of DNA conventions.
export function validateLab(
  state: Record<string, unknown>,
  projectIds: Set<string>,
  fail: (field: string) => never,
) {
  const text = (v: unknown, max: number, min = 0) =>
    typeof v === 'string' && v.length >= min && v.length <= max && !v.includes('\0');
  const id = (v: unknown) => typeof v === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(v);
  const stamp = (v: unknown) =>
    typeof v === 'string' && /^\d{4}-\d\d-\d\dT.*Z$/.test(v) && Number.isFinite(Date.parse(v));
  const keys = (v: unknown, names: string[]): v is Record<string, unknown> =>
    !!v &&
    typeof v === 'object' &&
    !Array.isArray(v) &&
    Object.keys(v).length === names.length &&
    names.every((k) => Object.hasOwn(v, k));
  const finite = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
  const rect = (v: unknown, bounds: { x: number; y: number; width: number; height: number }) => {
    if (!v || typeof v !== 'object') return false;
    const r = v as { x: number; y: number; width: number; height: number };
    return (
      [r.x, r.y, r.width, r.height].every(finite) &&
      r.x >= bounds.x - 1e-6 &&
      r.y >= bounds.y - 1e-6 &&
      r.width >= 1 &&
      r.height >= 1 &&
      r.x + r.width <= bounds.x + bounds.width + 1e-6 &&
      r.y + r.height <= bounds.y + bounds.height + 1e-6
    );
  };
  const common = (v: Record<string, unknown>, ids: Set<unknown>) => {
    if (
      !id(v.id) ||
      ids.has(v.id) ||
      !text(v.name, 200, 1) ||
      !(v.name as string).trim() ||
      !stamp(v.createdAt) ||
      !stamp(v.updatedAt) ||
      (v.projectId !== null && !projectIds.has(v.projectId as string)) ||
      !text(v.elabUrl, 2000) ||
      !safeWebUrl(v.elabUrl as string)
    )
      fail('note/gel');
    ids.add(v.id);
  };
  if (
    !Array.isArray(state.notes) ||
    state.notes.length > 2000 ||
    !Array.isArray(state.gels) ||
    state.gels.length > 100
  )
    fail('notes/gels');
  const noteIds = new Set(),
    gelIds = new Set();
  for (const note of state.notes as unknown[]) {
    if (
      !keys(note, [
        'id',
        'name',
        'projectId',
        'body',
        'elabUrl',
        'fileReferences',
        'gelIds',
        'createdAt',
        'updatedAt',
      ])
    )
      fail('note');
    common(note, noteIds);
    if (
      !text(note.body, 100_000) ||
      !text(note.fileReferences, 20_000) ||
      !Array.isArray(note.gelIds) ||
      note.gelIds.length > 100 ||
      !note.gelIds.every(id) ||
      new Set(note.gelIds).size !== note.gelIds.length
    )
      fail('note');
  }
  for (const gel of state.gels as unknown[]) {
    if (
      !keys(gel, [
        'id',
        'name',
        'projectId',
        'notes',
        'elabUrl',
        'image',
        'crop',
        'lanes',
        'bands',
        'polarity',
        'figureBackground',
        'createdAt',
        'updatedAt',
      ])
    )
      fail('gel');
    common(gel, gelIds);
    if (
      !text(gel.notes, 100_000) ||
      !['dark', 'light'].includes(gel.polarity as string) ||
      !['black', 'white'].includes(gel.figureBackground as string)
    )
      fail('gel');
    const img = gel.image;
    if (
      !keys(img, ['dataUrl', 'fileName', 'width', 'height', 'sha256']) ||
      !text(img.fileName, 255, 1) ||
      !Number.isInteger(img.width) ||
      !Number.isInteger(img.height) ||
      (img.width as number) < 1 ||
      (img.height as number) < 1 ||
      (img.width as number) > 6000 ||
      (img.height as number) > 6000 ||
      (img.width as number) * (img.height as number) > 12_000_000 ||
      !text(img.dataUrl, (MAX_GEL_BYTES * 4) / 3 + 64) ||
      !text(img.sha256, 64, 64)
    )
      fail('gel.image');
    const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(
      img.dataUrl as string,
    );
    if (!match) fail('gel.image (PNG/JPEG/WebP requis)');
    const bytes = Buffer.from(match[2], 'base64');
    if (
      bytes.length > MAX_GEL_BYTES ||
      bytes.toString('base64') !== match[2] ||
      createHash('sha256').update(bytes).digest('hex') !== img.sha256
    )
      fail('gel.image (intégrité)');
    const signature =
      match[1] === 'png'
        ? bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a'
        : match[1] === 'jpeg'
          ? bytes.subarray(0, 3).toString('hex') === 'ffd8ff'
          : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
    if (!signature) fail('gel.image (format)');
    if (
      !keys(gel.crop, ['x', 'y', 'width', 'height']) ||
      !rect(gel.crop, { x: 0, y: 0, width: img.width as number, height: img.height as number })
    )
      fail('gel.crop');
    if (
      !Array.isArray(gel.lanes) ||
      gel.lanes.length < 1 ||
      gel.lanes.length > 48 ||
      !Array.isArray(gel.bands) ||
      gel.bands.length > 1000
    )
      fail('gel.lanes/bands');
    const lanes = gel.lanes as unknown[],
      laneIds = new Set<unknown>();
    for (const lane of lanes) {
      if (
        !keys(lane, ['id', 'label', 'description', 'primers']) ||
        !id(lane.id) ||
        laneIds.has(lane.id) ||
        !text(lane.label, 120) ||
        !text(lane.description, 4000) ||
        !Array.isArray(lane.primers) ||
        lane.primers.length > 8
      )
        fail('gel.lane');
      laneIds.add(lane.id);
      const primerIds = new Set();
      for (const p of lane.primers as unknown[]) {
        if (
          !keys(p, [
            'recordId',
            'name',
            'sequence',
            'orientation',
            'notes',
            'sourceFile',
            'capturedAt',
          ]) ||
          !id(p.recordId) ||
          primerIds.has(p.recordId) ||
          !text(p.name, 200, 1) ||
          !text(p.sequence, 2000, 1) ||
          !/^[ACGTRYSWKMBDHVN]+$/.test(p.sequence as string) ||
          !['forward', 'reverse', 'other'].includes(p.orientation as string) ||
          !text(p.notes, 100_000) ||
          !stamp(p.capturedAt) ||
          (p.sourceFile !== null && !text(p.sourceFile, 255, 1))
        )
          fail('gel.primer');
        primerIds.add(p.recordId);
      }
    }
    const bandIds = new Set();
    const typed = gel as unknown as WorkspaceState['gels'][number];
    for (const band of gel.bands as unknown[]) {
      if (
        !keys(band, ['id', 'laneId', 'label', 'color', 'x', 'y', 'width', 'height']) ||
        !id(band.id) ||
        bandIds.has(band.id) ||
        !laneIds.has(band.laneId) ||
        !text(band.label, 120) ||
        typeof band.color !== 'string' ||
        !/^#[a-f0-9]{6}$/i.test(band.color)
      )
        fail('gel.band');
      const index = typed.lanes.findIndex((l) => l.id === band.laneId);
      if (!rect(band, laneRect(typed.crop, typed.lanes.length, index)))
        fail('gel.band (hors piste)');
      bandIds.add(band.id);
    }
  }
}
