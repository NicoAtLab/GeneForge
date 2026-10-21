import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { emptyState, WorkspaceStore } from '../server/storage.ts';
import { validateState, makeBackup, validateBackup } from '../server/validation.ts';
import {
  bandMeasurement,
  dragRect,
  laneProfile,
  laneRect,
  safeWebUrl,
  signalAt,
} from '../src/core/gels.ts';
import type { GelRecord } from '../src/types.ts';

const stamp = '2026-10-20T10:00:00.000Z';
const bytes = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',
  'base64',
);
function fixture() {
  const state = emptyState();
  const gel: GelRecord = {
    id: 'g',
    name: 'Gel artificiel',
    projectId: null,
    notes: 'Observation saisie',
    elabUrl: 'https://lipme-elab.toulouse.inrae.fr/',
    image: {
      dataUrl: 'data:image/png;base64,' + bytes.toString('base64'),
      fileName: 'artificial.png',
      width: 1,
      height: 1,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    },
    crop: { x: 0, y: 0, width: 1, height: 1 },
    lanes: [
      {
        id: 'l',
        label: 'Piste test',
        description: 'Sans échantillon réel',
        primers: [
          {
            recordId: 'deleted',
            name: 'Oligo test',
            sequence: 'ACGTTGCAAGTCGATCGT',
            orientation: 'forward',
            notes: 'Artificiel',
            sourceFile: 'test.csv',
            capturedAt: stamp,
          },
        ],
      },
    ],
    bands: [
      {
        id: 'b',
        laneId: 'l',
        label: 'Contour test',
        color: '#ff6384',
        x: 0,
        y: 0,
        width: 1,
        height: 1,
      },
    ],
    polarity: 'dark',
    figureBackground: 'white',
    createdAt: stamp,
    updatedAt: stamp,
  };
  state.gels = [gel];
  state.notes = [
    {
      id: 'n',
      name: 'Note test',
      projectId: null,
      body: 'Observation <script> textuelle',
      fileReferences: '\\\\serveur\\collection.xlsx',
      elabUrl: gel.elabUrl,
      gelIds: ['g'],
      createdAt: stamp,
      updatedAt: stamp,
    },
  ];
  return state;
}
test('equal lanes exactly cover a fractional crop without gaps, including large lane counts', () => {
  const crop = { x: 11.3, y: 17.5, width: 997, height: 700 };
  for (const count of [1, 3, 7, 48]) {
    const rects = Array.from({ length: count }, (_, i) => laneRect(crop, count, i));
    assert.equal(rects[0].x, crop.x);
    assert(Math.abs(rects.at(-1)!.x + rects.at(-1)!.width - crop.x - crop.width) < 1e-9);
    rects.forEach((r, i) => {
      assert.equal(r.width, crop.width / count);
      if (i) assert(Math.abs(r.x - rects[i - 1].x - rects[i - 1].width) < 1e-9);
    });
  }
  assert.throws(() => laneRect(crop, 0, 0));
  assert.deepEqual(
    dragRect({ x: 10, y: 10 }, { x: -10, y: 50 }, { x: 0, y: 0, width: 30, height: 30 }),
    { x: 0, y: 10, width: 10, height: 20 },
  );
});
test('pixel profiles and ellipse measurements have known values in both image polarities', () => {
  const pixels = new Uint8ClampedArray([
    0, 0, 0, 255, 255, 255, 255, 255, 100, 100, 100, 255, 200, 200, 200, 255,
  ]);
  const region = { x: 0, y: 0, width: 2, height: 2 };
  assert(Math.abs(laneProfile(pixels, 2, 2, region, 'dark')[0].signal - 127.5) < 1e-9);
  const dark = bandMeasurement(pixels, 2, 2, region, 'dark'),
    light = bandMeasurement(pixels, 2, 2, region, 'light');
  assert.equal(dark.count, 4);
  assert(Math.abs(dark.sum - 555) < 1e-9);
  assert(Math.abs(dark.mean + light.mean - 255) < 1e-9);
  assert.equal(dark.saturatedPercent, 25);
  assert.equal(signalAt(new Uint8ClampedArray([255, 255, 255, 0]), 0, 'dark'), 0);
  assert.equal(signalAt(new Uint8ClampedArray([0, 0, 0, 0]), 0, 'light'), 0);
});
test('notes, original images and deleted primer snapshots survive native backup restoration', () => {
  const state = fixture();
  assert.deepEqual(validateState(state), state);
  assert.deepEqual(validateBackup(makeBackup(state)), state);
  const dir = mkdtempSync(join(tmpdir(), 'geneforge-lab-'));
  let store: WorkspaceStore | undefined;
  try {
    store = new WorkspaceStore(dir);
    store.save(state);
    store.close();
    store = new WorkspaceStore(dir);
    assert.equal(store.read().gels[0].lanes[0].primers[0].recordId, 'deleted');
    assert.equal(store.read().gels[0].image.dataUrl, state.gels[0].image.dataUrl);
  } finally {
    store?.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test('image integrity, unsafe links, malformed lanes and out-of-bounds contours are rejected', () => {
  for (const mutate of [
    (s: ReturnType<typeof fixture>) => {
      s.gels[0].image.sha256 = '0'.repeat(64);
    },
    (s: ReturnType<typeof fixture>) => {
      s.gels[0].bands[0].width = 2;
    },
    (s: ReturnType<typeof fixture>) => {
      s.gels[0].bands[0].laneId = 'missing';
    },
    (s: ReturnType<typeof fixture>) => {
      s.notes[0].elabUrl = 'javascript:alert(1)';
    },
    (s: ReturnType<typeof fixture>) => {
      s.gels[0].lanes.push(s.gels[0].lanes[0]);
    },
    (s: ReturnType<typeof fixture>) => {
      s.gels[0].crop.height = Infinity;
    },
  ]) {
    const state = fixture();
    mutate(state);
    assert.throws(() => validateState(state));
  }
  assert(safeWebUrl('https://example.org/path?id=1'));
  assert(!safeWebUrl('https://user:secret@example.org'));
  assert(!safeWebUrl('file:///C:/data'));
});
test('SQLite v3 migration keeps source annotations exactly and writes a verified recovery backup', () => {
  const { notes: _, gels: __, ...fields } = emptyState();
  const original = { ...fields, schemaVersion: 3, revision: 11 };
  const dir = mkdtempSync(join(tmpdir(), 'geneforge-v3-'));
  let store: WorkspaceStore | undefined;
  try {
    const db = new DatabaseSync(join(dir, 'geneforge.sqlite'));
    db.exec(
      'CREATE TABLE workspace (id INTEGER PRIMARY KEY, revision INTEGER, state_json TEXT, updated_at TEXT); PRAGMA user_version=3;',
    );
    db.prepare('INSERT INTO workspace VALUES(1,11,?,?)').run(JSON.stringify(original), stamp);
    db.close();
    store = new WorkspaceStore(dir);
    assert.deepEqual(store.read(), { ...original, schemaVersion: 4, notes: [], gels: [] });
    const backup = JSON.parse(
      readFileSync(join(dir, 'backups', readdirSync(join(dir, 'backups'))[0]), 'utf8'),
    );
    assert.deepEqual(backup.state, original);
    assert.deepEqual(validateBackup(backup), store.read());
  } finally {
    store?.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
