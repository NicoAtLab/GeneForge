import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { emptyState, WorkspaceStore } from '../server/storage.ts';
import { makeBackup, validateBackup, validateState } from '../server/validation.ts';

const stamp = '2026-10-13T10:00:00.000Z';
function legacy() {
  return {
    schemaVersion: 1,
    revision: 7,
    settings: { name: 'Ancien profil', organization: 'Local', theme: 'light', basesPerLine: 40 },
    projects: [
      {
        id: 'p',
        name: 'Projet conservé',
        description: '',
        color: '#123456',
        pinned: true,
        createdAt: stamp,
        updatedAt: stamp,
      },
    ],
    sequences: [
      {
        id: 's',
        projectId: 'p',
        name: 'Séquence conservée',
        sequence: 'ACGTNN',
        notes: 'Notes anciennes',
        topology: 'linear',
        createdAt: stamp,
        updatedAt: stamp,
      },
    ],
    primers: [],
  };
}
function envelope<T>(state: T) {
  return {
    format: 'geneforge',
    version: 1,
    exportedAt: stamp,
    checksum: createHash('sha256').update(JSON.stringify(state)).digest('hex'),
    state,
  };
}
test('v1 backups validate their original checksum before migrating all data', () => {
  const original = legacy();
  const migrated = validateBackup(envelope(original));
  assert.equal(migrated.schemaVersion, 2);
  assert.equal(migrated.revision, 7);
  assert.equal(migrated.settings.theme, 'light');
  assert.equal(migrated.settings.basesPerLine, 40);
  assert.equal(migrated.settings.sequenceFontSize, 14);
  assert.deepEqual(migrated.sequences[0], { ...original.sequences[0], annotations: [] });
  const corrupted = envelope(original);
  corrupted.state.settings.name = 'Changed';
  assert.throws(() => validateBackup(corrupted), /modifiée ou endommagée/);
  assert.throws(() => validateState(original), /schemaVersion/);
  assert.throws(() => validateBackup(envelope({ ...legacy(), schemaVersion: 99 })));
  assert.throws(() => validateBackup(envelope({ ...legacy(), surprise: true })));
});
test('SQLite v1 migration is persistent, keeps revision and writes an untouched recovery backup', () => {
  const dir = mkdtempSync(join(tmpdir(), 'geneforge-migration-'));
  let store: WorkspaceStore | undefined;
  try {
    const db = new DatabaseSync(join(dir, 'geneforge.sqlite'));
    db.exec(
      'CREATE TABLE workspace (id INTEGER PRIMARY KEY, revision INTEGER, state_json TEXT, updated_at TEXT); PRAGMA user_version=1;',
    );
    db.prepare('INSERT INTO workspace VALUES(1,7,?,?)').run(JSON.stringify(legacy()), stamp);
    db.close();
    store = new WorkspaceStore(dir);
    assert.equal(store.read().schemaVersion, 2);
    assert.equal(store.read().revision, 7);
    const files = readdirSync(join(dir, 'backups'));
    assert.equal(files.length, 1);
    const backup = JSON.parse(readFileSync(join(dir, 'backups', files[0]), 'utf8'));
    assert.deepEqual(backup.state, legacy());
    assert.deepEqual(validateBackup(backup), store.read());
    store.close();
    store = new WorkspaceStore(dir);
    assert.equal(store.read().settings.name, 'Ancien profil');
    assert.equal(readdirSync(join(dir, 'backups')).length, 1);
  } finally {
    store?.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test('annotations and preferences round-trip; out-of-bounds or unreviewed orphan records fail', () => {
  const state = validateBackup(envelope(legacy()));
  state.sequences[0].annotations = [
    {
      id: 'a',
      name: 'Repère',
      start: 2,
      end: 5,
      color: '#79bdfa',
      notes: 'Mémo',
      needsReview: false,
    },
  ];
  state.settings.accent = 'violet';
  assert.deepEqual(validateBackup(makeBackup(state)), state);
  state.sequences[0].annotations[0].end = 7;
  assert.throws(() => validateState(state), /coordinates/);
  state.sequences[0].annotations[0].start = null;
  state.sequences[0].annotations[0].end = null;
  assert.throws(() => validateState(state), /needsReview/);
  state.sequences[0].annotations[0].needsReview = true;
  assert.deepEqual(validateState(state), state);
  state.settings.sequenceFontSize = 999;
  assert.throws(() => validateState(state), /sequenceFontSize/);
  const fresh = emptyState();
  assert.equal(fresh.schemaVersion, 2);
});
