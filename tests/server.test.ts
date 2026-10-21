import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createGeneForgeServer } from '../server/index.ts';
import { emptyState } from '../server/storage.ts';
import { makeBackup, validateState } from '../server/validation.ts';
import { validateAnalysis } from '../server/primer3.ts';
import type { WorkspaceState } from '../src/types.ts';

const temporary = mkdtempSync(join(tmpdir(), 'geneforge-server-test-'));
const staticDir = join(temporary, 'dist');
mkdirSync(staticDir);
writeFileSync(join(staticDir, 'index.html'), '<!doctype html><title>GeneForge test</title>');
writeFileSync(join(staticDir, 'app.js'), 'window.test=true;');
let app: ReturnType<typeof createGeneForgeServer>;
let baseUrl: string;

async function start(dataDir = join(temporary, 'data')): Promise<void> {
  app = createGeneForgeServer({ dataDir, staticDir });
  await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
}

function sampleState(revision = 0): WorkspaceState {
  const date = '2026-10-13T10:00:00.000Z';
  return {
    ...emptyState(),
    revision,
    projects: [
      {
        id: 'project-one',
        name: 'Test local',
        description: 'Projet de test',
        color: '#34b8a2',
        pinned: true,
        createdAt: date,
        updatedAt: date,
      },
    ],
    sequences: [
      {
        id: 'sequence-one',
        projectId: 'project-one',
        name: 'Exemple',
        sequence: 'ACGTNRY',
        topology: 'linear',
        annotations: [],
        annotationSources: [],
        sourceFile: null,
        notes: 'Test',
        createdAt: date,
        updatedAt: date,
      },
    ],
    primers: [
      {
        id: 'primer-one',
        name: 'Oligo exemple',
        sequence: 'ACGTACGT',
        orientation: 'forward',
        sourceFile: null,
        notes: '',
        tags: ['test'],
        projectIds: ['project-one'],
        favorite: false,
        status: 'active',
        createdAt: date,
        updatedAt: date,
      },
    ],
  };
}

async function put(state: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return fetch(`${baseUrl}/api/state`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(state),
  });
}

before(async () => {
  await start();
});
after(async () => {
  await app.close();
  rmSync(temporary, { recursive: true, force: true });
});

test('initial workspace is empty and health exposes counts, not private content', async () => {
  const response = await fetch(`${baseUrl}/api/state`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), emptyState());
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  const health = await (await fetch(`${baseUrl}/api/health`)).json();
  assert.deepEqual(health.counts, { projects: 0, sequences: 0, primers: 0, notes: 0, gels: 0 });
  assert.equal(typeof health.primer3.available, 'boolean');
  assert.equal(health.sequences, undefined);
});

test('atomic save increments revision and persists after closing/reopening SQLite', async () => {
  const result = await put(sampleState());
  assert.equal(result.status, 200);
  const saved = await result.json();
  assert.equal(saved.revision, 1);
  await app.close();
  await start();
  assert.deepEqual(await (await fetch(`${baseUrl}/api/state`)).json(), {
    ...sampleState(),
    revision: 1,
  });
});

test('stale concurrent write fails without overwriting committed data', async () => {
  const stale = sampleState(0);
  stale.projects[0].name = 'Stale value';
  const result = await put(stale);
  assert.equal(result.status, 409);
  assert.equal((await result.json()).error.code, 'REVISION_CONFLICT');
  assert.equal(app.store.read().projects[0].name, 'Test local');
  const first = sampleState(1);
  const second = sampleState(1);
  const responses = await Promise.all([put(first), put(second)]);
  assert.deepEqual(responses.map((response) => response.status).sort(), [200, 409]);
  assert.equal(app.store.read().revision, 2);
});

test('validation rejects invalid alphabet, dangling references, duplicate IDs and extra fields', async () => {
  const attempts: unknown[] = [];
  const alphabet = sampleState(2);
  alphabet.sequences[0].sequence = 'ACGU';
  attempts.push(alphabet);
  const reference = sampleState(2);
  reference.sequences[0].projectId = 'missing';
  attempts.push(reference);
  const duplicate = sampleState(2);
  duplicate.projects.push({ ...duplicate.projects[0] });
  attempts.push(duplicate);
  const primerReference = sampleState(2);
  primerReference.primers[0].projectIds.push('missing');
  attempts.push(primerReference);
  attempts.push({ ...sampleState(2), arbitrary: true });
  for (const state of attempts) assert.equal((await put(state)).status, 400);
  assert.equal(app.store.read().revision, 2);
});

test('wrong origins and non-JSON writes are rejected before changing state', async () => {
  const result = await put(sampleState(2), { Origin: 'https://malicious.example' });
  assert.equal(result.status, 403);
  assert.equal((await result.json()).error.code, 'ORIGIN_REJECTED');
  const text = await fetch(`${baseUrl}/api/state`, {
    method: 'PUT',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(sampleState(2)),
  });
  assert.equal(text.status, 415);
  const invalidJson = await fetch(`${baseUrl}/api/state`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Origin: baseUrl },
    body: '{bad json',
  });
  assert.equal(invalidJson.status, 400);
  assert.equal(app.store.read().revision, 2);
});

test('DNS rebinding Host header is rejected', async () => {
  const status = await new Promise<number>((resolve) => {
    const req = request(
      `${baseUrl}/api/state`,
      { headers: { Host: 'malicious.example' } },
      (response) => {
        response.resume();
        resolve(response.statusCode!);
      },
    );
    req.end();
  });
  assert.equal(status, 403);
});

test('backup has checksum and failed restore leaves database unchanged', async () => {
  const response = await fetch(`${baseUrl}/api/backup`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-disposition')!, /attachment/);
  const backup = await response.json();
  assert.equal(backup.format, 'geneforge');
  assert.match(backup.checksum, /^[a-f0-9]{64}$/);
  backup.state.projects[0].name = 'Tampered';
  const restore = await fetch(`${baseUrl}/api/restore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(backup),
  });
  assert.equal(restore.status, 400);
  assert.equal((await restore.json()).error.code, 'CHECKSUM_MISMATCH');
  assert.equal(app.store.read().projects[0].name, 'Test local');
  const invalid = sampleState();
  invalid.sequences[0].projectId = 'missing';
  const structurallyInvalid = await fetch(`${baseUrl}/api/restore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(makeBackup(invalid)),
  });
  assert.equal(structurallyInvalid.status, 400);
  assert.equal(app.store.read().revision, 2);
});

test('restore writes a recovery backup and advances current revision instead of importing it', async () => {
  const imported = sampleState(500);
  imported.projects[0].name = 'Restauré';
  const response = await fetch(`${baseUrl}/api/restore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(makeBackup(imported)),
  });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.revision, 3);
  assert.equal(result.projects[0].name, 'Restauré');
  const backupDir = join(temporary, 'data', 'backups');
  const backups = readdirSync(backupDir);
  assert.equal(backups.length, 1);
  const previous = JSON.parse(readFileSync(join(backupDir, backups[0]), 'utf8'));
  assert.equal(previous.state.revision, 2);
  assert.equal(previous.state.projects[0].name, 'Test local');
});

test('SPA fallback serves app, unknown API/assets and hidden files do not', async () => {
  const page = await fetch(`${baseUrl}/projects`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /GeneForge test/);
  assert.equal(
    (await fetch(`${baseUrl}/app.js`)).headers.get('content-type'),
    'text/javascript; charset=utf-8',
  );
  assert.equal((await fetch(`${baseUrl}/api/unknown`)).status, 404);
  assert.equal((await fetch(`${baseUrl}/missing.js`)).status, 404);
  assert.equal((await fetch(`${baseUrl}/.env`)).status, 404);
  assert.equal((await fetch(`${baseUrl}/api/state`, { method: 'DELETE' })).status, 405);
});

test('analysis rejects ambiguous bases and invalid physical parameters before invoking Python', async () => {
  const valid = {
    sequence: 'ACGTACGTACGT',
    mv_conc: 50,
    dv_conc: 1.5,
    dntp_conc: 0.6,
    dna_conc: 50,
  };
  for (const invalid of [
    { ...valid, sequence: 'ACGTN' },
    { ...valid, dna_conc: 0 },
    { ...valid, mv_conc: -1 },
    { ...valid, mv_conc: '50' },
    { ...valid, mv_conc: 0, dv_conc: 0 },
    { ...valid, extra: true },
  ]) {
    const response = await fetch(`${baseUrl}/api/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(invalid),
    });
    assert.equal(response.status, 400);
  }
  assert.throws(() => validateAnalysis({ ...valid, dna_conc: Infinity }));
  assert.throws(() => validateAnalysis({ ...valid, mv_conc: true }));
});

test('Primer3 endpoint provides a real result or an explicit unavailable response', async () => {
  const response = await fetch(`${baseUrl}/api/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sequence: 'ACGTACGTACGT',
      mv_conc: 50,
      dv_conc: 1.5,
      dntp_conc: 0.6,
      dna_conc: 50,
    }),
  });
  const result = await response.json();
  if (response.status === 503) {
    assert.equal(result.error.code, 'ENGINE_UNAVAILABLE');
  } else {
    assert.equal(response.status, 200);
    assert.equal(result.engine, 'primer3-py');
    assert.equal(result.method, 'SantaLucia');
    assert.equal(typeof result.tm, 'number');
    assert.ok(Number.isFinite(result.tm));
  }
});

test('field validation rejects excessively large records and accepts an empty sequence draft', () => {
  const state = sampleState();
  state.sequences[0].sequence = '';
  assert.equal(validateState(state).sequences[0].sequence, '');
  state.sequences[0].sequence = 'A'.repeat(1_000_001);
  assert.throws(() => validateState(state));
  state.sequences[0].sequence = 'ACGT';
  state.settings.basesPerLine = 0;
  assert.throws(() => validateState(state));
});
