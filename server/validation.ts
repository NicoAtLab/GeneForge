import { createHash, timingSafeEqual } from 'node:crypto';
import type { WorkspaceState } from '../src/types.ts';
import { displayDefaults } from '../src/preferences.ts';
import { validateLab } from './labValidation.ts';

export const MAX_REQUEST_BYTES = 16 * 1024 * 1024;
const DNA = /^[ACGTRYSWKMBDHVN]*$/;
const ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function invalid(field: string): never {
  throw new ApiError(400, 'INVALID_STATE', `Champ invalide : ${field}.`);
}

function object(value: unknown, field: string, keys: string[]): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) invalid(field);
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== keys.length || keys.some((key) => !Object.hasOwn(record, key)))
    invalid(field);
  return record;
}

function string(value: unknown, field: string, max: number, min = 0): asserts value is string {
  if (typeof value !== 'string' || value.length < min || value.length > max || value.includes('\0'))
    invalid(field);
}

function boolean(value: unknown, field: string): void {
  if (typeof value !== 'boolean') invalid(field);
}

function choice(value: unknown, field: string, choices: readonly string[]): void {
  if (typeof value !== 'string' || !choices.includes(value)) invalid(field);
}

function array(value: unknown, field: string, max: number): asserts value is unknown[] {
  if (!Array.isArray(value) || value.length > max) invalid(field);
}

function date(value: unknown, field: string): void {
  string(value, field, 30, 20);
  if (!ISO_DATE.test(value) || !Number.isFinite(Date.parse(value))) invalid(field);
}

function id(value: unknown, field: string): asserts value is string {
  string(value, field, 128, 1);
  if (!ID.test(value)) invalid(field);
}

function baseFields(record: Record<string, unknown>, field: string, ids: Set<string>): void {
  id(record.id, `${field}.id`);
  if (ids.has(record.id)) invalid(`${field}.id (doublon)`);
  ids.add(record.id);
  string(record.name, `${field}.name`, 200, 1);
  if (!record.name.trim()) invalid(`${field}.name`);
  date(record.createdAt, `${field}.createdAt`);
  date(record.updatedAt, `${field}.updatedAt`);
}

export function validateState(value: unknown, allowLegacy = false): WorkspaceState {
  const version =
    value && typeof value === 'object'
      ? (value as { schemaVersion?: unknown }).schemaVersion
      : undefined;
  const state = object(value, 'state', [
    'schemaVersion',
    'revision',
    'projects',
    'sequences',
    'primers',
    'settings',
    ...(version === 4 ? ['notes', 'gels'] : []),
  ]);
  const legacy = allowLegacy && (state.schemaVersion === 1 || state.schemaVersion === 2);
  const v1 = state.schemaVersion === 1;
  const beforeLab = allowLegacy && state.schemaVersion === 3;
  if (state.schemaVersion !== 4 && !legacy && !beforeLab) invalid('schemaVersion');
  if (
    !Number.isSafeInteger(state.revision) ||
    (state.revision as number) < 0 ||
    (state.revision as number) >= Number.MAX_SAFE_INTEGER
  )
    invalid('revision');
  array(state.projects, 'projects', 2_000);
  array(state.sequences, 'sequences', 10_000);
  array(state.primers, 'primers', 20_000);
  const projectIds = new Set<string>();
  for (const item of state.projects) {
    const project = object(item, 'project', [
      'id',
      'name',
      'description',
      'color',
      'pinned',
      'createdAt',
      'updatedAt',
    ]);
    baseFields(project, 'project', projectIds);
    string(project.description, 'project.description', 20_000);
    string(project.color, 'project.color', 7, 7);
    if (!/^#[0-9a-fA-F]{6}$/.test(project.color)) invalid('project.color');
    boolean(project.pinned, 'project.pinned');
  }
  const sequenceIds = new Set<string>();
  for (const item of state.sequences) {
    const sequence = object(item, 'sequence', [
      'id',
      'projectId',
      'name',
      'sequence',
      'topology',
      'notes',
      'createdAt',
      'updatedAt',
      ...(!v1 ? ['annotations'] : []),
      ...(!legacy ? ['annotationSources', 'sourceFile'] : []),
    ]);
    baseFields(sequence, 'sequence', sequenceIds);
    id(sequence.projectId, 'sequence.projectId');
    if (!projectIds.has(sequence.projectId)) invalid('sequence.projectId (projet absent)');
    string(sequence.sequence, 'sequence.sequence', 1_000_000);
    if (!DNA.test(sequence.sequence)) invalid('sequence.sequence (alphabet ADN IUPAC)');
    choice(sequence.topology, 'sequence.topology', ['linear', 'circular']);
    string(sequence.notes, 'sequence.notes', 100_000);
    const sourceIds = new Set<string>();
    if (!legacy) {
      if (sequence.sourceFile !== null) string(sequence.sourceFile, 'sequence.sourceFile', 255, 1);
      array(sequence.annotationSources, 'sequence.annotationSources', 2_000);
      for (const item of sequence.annotationSources) {
        const source = object(item, 'annotationSource', [
          'id',
          'kind',
          'recordId',
          'name',
          'fileName',
          'sequence',
          'notes',
          'capturedAt',
        ]);
        id(source.id, 'annotationSource.id');
        if (sourceIds.has(source.id)) invalid('annotationSource.id (doublon)');
        sourceIds.add(source.id);
        id(source.recordId, 'annotationSource.recordId');
        choice(source.kind, 'annotationSource.kind', ['sequence', 'primer']);
        string(source.name, 'annotationSource.name', 200, 1);
        if (source.fileName !== null) string(source.fileName, 'annotationSource.fileName', 255, 1);
        string(
          source.sequence,
          'annotationSource.sequence',
          source.kind === 'primer' ? 2_000 : 1_000_000,
          1,
        );
        if (!DNA.test(source.sequence)) invalid('annotationSource.sequence');
        string(source.notes, 'annotationSource.notes', 100_000);
        date(source.capturedAt, 'annotationSource.capturedAt');
      }
    }
    if (!v1) {
      array(sequence.annotations, 'sequence.annotations', 2_000);
      const ids = new Set<string>();
      for (const item of sequence.annotations) {
        const a = object(item, 'annotation', [
          'id',
          'name',
          'start',
          'end',
          'color',
          'notes',
          'needsReview',
          ...(!legacy ? ['role', 'strand', 'sourceId'] : []),
        ]);
        id(a.id, 'annotation.id');
        if (ids.has(a.id)) invalid('annotation.id (doublon)');
        ids.add(a.id);
        string(a.name, 'annotation.name', 200, 1);
        if (!a.name.trim()) invalid('annotation.name');
        string(a.notes, 'annotation.notes', 20_000);
        string(a.color, 'annotation.color', 7, 7);
        if (!/^#[0-9a-fA-F]{6}$/.test(a.color)) invalid('annotation.color');
        boolean(a.needsReview, 'annotation.needsReview');
        if (!legacy) {
          choice(a.role, 'annotation.role', ['region', 'up', 'down', 'primer', 'fragment']);
          if (a.strand !== null) choice(a.strand, 'annotation.strand', ['+', '-', 'both']);
          if (a.sourceId !== null) {
            id(a.sourceId, 'annotation.sourceId');
            if (!sourceIds.has(a.sourceId)) invalid('annotation.sourceId (source absente)');
            if (a.strand === null) invalid('annotation.strand');
          }
        }
        if (a.start === null && a.end === null) {
          if (!a.needsReview) invalid('annotation.needsReview');
        } else if (
          !Number.isInteger(a.start) ||
          !Number.isInteger(a.end) ||
          (a.start as number) < 1 ||
          (a.end as number) < (a.start as number) ||
          (a.end as number) > sequence.sequence.length
        )
          invalid('annotation.coordinates');
      }
    }
  }
  const primerIds = new Set<string>();
  for (const item of state.primers) {
    const primer = object(item, 'primer', [
      'id',
      'name',
      'sequence',
      'orientation',
      'notes',
      'tags',
      'projectIds',
      'favorite',
      'status',
      'createdAt',
      'updatedAt',
      ...(!legacy ? ['sourceFile'] : []),
    ]);
    baseFields(primer, 'primer', primerIds);
    if (!legacy && primer.sourceFile !== null)
      string(primer.sourceFile, 'primer.sourceFile', 255, 1);
    string(primer.sequence, 'primer.sequence', 2_000, 1);
    if (!DNA.test(primer.sequence)) invalid('primer.sequence (alphabet ADN IUPAC)');
    choice(primer.orientation, 'primer.orientation', ['forward', 'reverse', 'other']);
    choice(primer.status, 'primer.status', ['active', 'archived']);
    string(primer.notes, 'primer.notes', 100_000);
    boolean(primer.favorite, 'primer.favorite');
    array(primer.tags, 'primer.tags', 100);
    for (const tag of primer.tags) string(tag, 'primer.tags', 80, 1);
    if (new Set(primer.tags).size !== primer.tags.length) invalid('primer.tags (doublon)');
    array(primer.projectIds, 'primer.projectIds', 2_000);
    for (const projectId of primer.projectIds) {
      id(projectId, 'primer.projectIds');
      if (!projectIds.has(projectId)) invalid('primer.projectIds (projet absent)');
    }
    if (new Set(primer.projectIds).size !== primer.projectIds.length)
      invalid('primer.projectIds (doublon)');
  }
  const settings = object(state.settings, 'settings', [
    'name',
    'organization',
    'theme',
    'basesPerLine',
    ...(!v1 ? Object.keys(displayDefaults) : []),
  ]);
  string(settings.name, 'settings.name', 200);
  string(settings.organization, 'settings.organization', 200);
  choice(settings.theme, 'settings.theme', ['dark', 'light', 'system']);
  if (
    !Number.isInteger(settings.basesPerLine) ||
    (settings.basesPerLine as number) < 10 ||
    (settings.basesPerLine as number) > 120
  )
    invalid('settings.basesPerLine');
  if (!v1) {
    choice(settings.accent, 'settings.accent', [
      'mint',
      'blue',
      'violet',
      'amber',
      'coral',
      'rose',
      'forest',
      'cyan',
    ]);
    choice(settings.density, 'settings.density', ['comfortable', 'compact']);
    choice(settings.basePalette, 'settings.basePalette', ['classic', 'contrast', 'mono']);
    choice(settings.defaultSequenceView, 'settings.defaultSequenceView', ['edit', 'colored']);
    boolean(settings.groupBases, 'settings.groupBases');
    if (
      !Number.isInteger(settings.sequenceFontSize) ||
      (settings.sequenceFontSize as number) < 8 ||
      (settings.sequenceFontSize as number) > 22
    )
      invalid('settings.sequenceFontSize');
  }
  // JSON round trip also detaches callers from the persisted state.
  const result = JSON.parse(JSON.stringify(state));
  if (legacy) {
    if (v1) result.settings = { ...result.settings, ...displayDefaults };
    result.sequences = result.sequences.map((s: { annotations?: object[] }) => ({
      ...s,
      sourceFile: null,
      annotationSources: [],
      annotations: (s.annotations ?? []).map((a) => ({
        ...a,
        role: 'region',
        strand: null,
        sourceId: null,
      })),
    }));
    result.primers = result.primers.map((p: object) => ({ ...p, sourceFile: null }));
  }
  if (legacy || beforeLab) {
    result.schemaVersion = 4;
    result.notes = [];
    result.gels = [];
  } else validateLab(state, projectIds, invalid);
  return result as WorkspaceState;
}

export interface BackupEnvelope {
  format: 'geneforge';
  version: 1;
  exportedAt: string;
  checksum: string;
  state: WorkspaceState;
}

function checksum(state: unknown): string {
  return createHash('sha256').update(JSON.stringify(state)).digest('hex');
}

export function makeBackup(state: WorkspaceState): BackupEnvelope {
  return {
    format: 'geneforge',
    version: 1,
    exportedAt: new Date().toISOString(),
    checksum: checksum(state),
    state,
  };
}

export function validateBackup(value: unknown): WorkspaceState {
  const backup = object(value, 'backup', ['format', 'version', 'exportedAt', 'checksum', 'state']);
  if (backup.format !== 'geneforge' || backup.version !== 1)
    throw new ApiError(400, 'INVALID_BACKUP', 'Format de sauvegarde incompatible.');
  date(backup.exportedAt, 'backup.exportedAt');
  if (typeof backup.checksum !== 'string' || !/^[a-f0-9]{64}$/.test(backup.checksum))
    throw new ApiError(400, 'INVALID_BACKUP', 'Empreinte de sauvegarde invalide.');
  const actual = Buffer.from(checksum(backup.state), 'hex');
  const expected = Buffer.from(backup.checksum, 'hex');
  if (!timingSafeEqual(actual, expected))
    throw new ApiError(400, 'CHECKSUM_MISMATCH', 'La sauvegarde a été modifiée ou endommagée.');
  return validateState(backup.state, true);
}
