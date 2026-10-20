import { createHash, timingSafeEqual } from 'node:crypto';
import type { WorkspaceState } from '../src/types.ts';

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

export function validateState(value: unknown): WorkspaceState {
  const state = object(value, 'state', [
    'schemaVersion',
    'revision',
    'projects',
    'sequences',
    'primers',
    'settings',
  ]);
  if (state.schemaVersion !== 1) invalid('schemaVersion');
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
    ]);
    baseFields(sequence, 'sequence', sequenceIds);
    id(sequence.projectId, 'sequence.projectId');
    if (!projectIds.has(sequence.projectId)) invalid('sequence.projectId (projet absent)');
    string(sequence.sequence, 'sequence.sequence', 1_000_000);
    if (!DNA.test(sequence.sequence)) invalid('sequence.sequence (alphabet ADN IUPAC)');
    choice(sequence.topology, 'sequence.topology', ['linear', 'circular']);
    string(sequence.notes, 'sequence.notes', 100_000);
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
    ]);
    baseFields(primer, 'primer', primerIds);
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
  // JSON round trip also detaches callers from the persisted state.
  return JSON.parse(JSON.stringify(state)) as WorkspaceState;
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
  return validateState(backup.state);
}
