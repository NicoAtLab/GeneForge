import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { chromium } from 'playwright';
import { createGeneForgeServer } from '../server/index.ts';
import { emptyState } from '../server/storage.ts';
import { reverseComplement } from '../src/core/sequence.ts';

const dataDir = mkdtempSync(join(tmpdir(), 'geneforge-search-e2e-'));
const artifacts = resolve('artifacts');
mkdirSync(artifacts, { recursive: true });
const app = createGeneForgeServer({ dataDir, staticDir: resolve('dist') });
const stamp = new Date().toISOString();
const up = 'AACCGTATGCTAGGCTACGA',
  down = 'TTAGCGGACATCGTAACGTC',
  primer = 'GCTACCATGATCGGATACCG';
const target =
  'G'.repeat(740) +
  up +
  'C'.repeat(40) +
  reverseComplement(down) +
  'A'.repeat(30) +
  primer +
  'T'.repeat(40) +
  up +
  'N'.repeat(800);
const record = (id, name, sequence) => ({
  id,
  name,
  sequence,
  projectId: 'project',
  topology: 'linear',
  notes: 'Données artificielles de validation.',
  annotations: [],
  annotationSources: [],
  sourceFile: 'fragments.fasta',
  createdAt: stamp,
  updatedAt: stamp,
});
app.store.save({
  ...emptyState(),
  projects: [
    {
      id: 'project',
      name: 'Recherche artificielle',
      description: '',
      color: '#79bdfa',
      pinned: false,
      createdAt: stamp,
      updatedAt: stamp,
    },
  ],
  sequences: [
    record('target', 'Grand fragment test', target),
    record('up', 'Fragment UP', up),
    record('down', 'Fragment DOWN', down),
    record('absent', 'Fragment absent', 'ACACACACTGTGTGTGACAA'),
  ],
  primers: [
    {
      id: 'primer',
      name: 'Amorce test',
      sequence: primer,
      notes: 'Source artificielle.',
      sourceFile: 'amorces.csv',
      orientation: 'other',
      tags: [],
      projectIds: ['project'],
      favorite: false,
      status: 'active',
      createdAt: stamp,
      updatedAt: stamp,
    },
  ],
});
await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + app.server.address().port;
let browser,
  page,
  steps = 0;
const errors = [];
const state = () => app.store.read();
async function step(name, fn) {
  await fn();
  console.log('PASS SEARCH ' + ++steps + ' ' + name);
}
async function until(fn) {
  const end = Date.now() + 10000;
  while (Date.now() < end) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 75));
  }
  throw new Error('Timed out waiting for state');
}
async function openTarget() {
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'Séquences', exact: true })
    .click();
  await page.getByRole('button', { name: 'Grand fragment test', exact: true }).click();
  await page.getByRole('heading', { name: 'Grand fragment test', exact: true }).waitFor();
}
try {
  browser = await chromium.launch({
    headless: true,
    ...(process.env.GENEFORGE_BROWSER ? { channel: process.env.GENEFORGE_BROWSER } : {}),
  });
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(base);
  await openTarget();
  await step(
    'long search, missing/invalid query, highlights, occurrence navigation and reverse complement',
    async () => {
      const search = page.getByLabel('Rechercher dans cette séquence');
      await search.fill(target.slice(730, 820).toLowerCase());
      await page
        .getByText('Trouvé : 1 occurrence(s) · fragment de 90 nt', { exact: true })
        .waitFor();
      await page.getByText('Page 2 / 3', { exact: true }).waitFor();
      assert.equal(await page.locator('.search-hit').count(), 90);
      await search.fill('ACACACACTGTGTGTGACAA');
      await page
        .getByText('Aucune correspondance exacte dans cette séquence.', { exact: true })
        .waitFor();
      assert.equal(await page.locator('.search-hit').count(), 0);
      await search.fill('ACGT!');
      await page
        .locator('.sequence-search')
        .getByText(/Caractères invalides/)
        .waitFor();
      await search.fill(up);
      await page
        .getByText('Trouvé : 2 occurrence(s) · fragment de 20 nt', { exact: true })
        .waitFor();
      await page.getByRole('button', { name: 'Occurrence suivante', exact: true }).click();
      await page
        .locator('.selection-panel')
        .getByText('911–930 · 20 nt', { exact: true })
        .waitFor();
      await search.fill(down);
      await page.getByLabel('Chercher aussi le complément inverse', { exact: true }).check();
      await page
        .getByText('Trouvé : 1 occurrence(s) · fragment de 20 nt', { exact: true })
        .waitFor();
      await page
        .locator('.sequence-search')
        .getByRole('button', { name: '801–820 (-)', exact: true })
        .waitFor();
      await page.screenshot({ path: join(artifacts, 'sequence-search.png'), fullPage: true });
      await page.getByRole('button', { name: 'Effacer la recherche', exact: true }).click();
    },
  );
  await step(
    'choose Up/Down/primer sources, preview absent and multiple hits, save and avoid duplicates',
    async () => {
      await page.getByRole('button', { name: 'Choisir des fragments ou amorces' }).click();
      for (const name of ['Fragment UP', 'Fragment DOWN', 'Fragment absent'])
        await page.getByRole('checkbox', { name: `Choisir ${name}`, exact: true }).check();
      await page.getByLabel('Catégorie de Fragment UP', { exact: true }).selectOption('up');
      await page.getByLabel('Catégorie de Fragment DOWN', { exact: true }).selectOption('down');
      await page.getByLabel('Sources à afficher').selectOption('primer');
      await page.getByRole('checkbox', { name: 'Choisir Amorce test', exact: true }).check();
      await page.getByRole('button', { name: 'Analyser les sources choisies' }).click();
      await page.getByRole('heading', { name: 'Aperçu · 4 correspondance(s)' }).waitFor();
      await page
        .locator('.auto-result')
        .filter({ hasText: 'Fragment absent' })
        .getByText('Absent', { exact: true })
        .waitFor();
      assert.equal(state().sequences[0].annotations.length, 0);
      await page.getByRole('button', { name: 'Ajouter les annotations trouvées' }).click();
      assert.equal(await page.locator('.annotation-card').count(), 4);
      await page.getByRole('button', { name: /^Enregistrer/ }).click();
      await until(() => state().sequences[0].annotations.length === 4);
      assert.equal(state().sequences[0].annotationSources.length, 3);
      assert.equal(state().sequences[0].annotations.find((a) => a.role === 'down').strand, '-');
      await page.getByRole('button', { name: 'Analyser les sources choisies' }).click();
      await page.getByRole('heading', { name: 'Aperçu · 4 correspondance(s)' }).waitFor();
      await page.getByRole('button', { name: 'Ajouter les annotations trouvées' }).click();
      await page.getByText(/0 annotation\(s\) ajoutée\(s\), 4 doublon/).waitFor();
      assert.equal(await page.locator('.annotation-card').count(), 4);
      await page.screenshot({ path: join(artifacts, 'automatic-annotations.png'), fullPage: true });
    },
  );
  await step(
    'snapshot links export the exact source and track original record changes',
    async () => {
      await page.getByRole('button', { name: 'Complément inverse', exact: true }).click();
      await page.getByRole('button', { name: 'Source : Fragment UP', exact: true }).first().click();
      let modal = page.getByRole('dialog', { name: 'Source : Fragment UP', exact: true });
      await modal
        .getByText('La région correspond exactement à la source conservée.', { exact: true })
        .waitFor();
      await modal.getByRole('button', { name: 'Fermer', exact: true }).last().click();
      await page.getByRole('button', { name: 'Annuler', exact: true }).click();
      await page.getByRole('button', { name: 'Source : Fragment UP', exact: true }).first().click();
      modal = page.getByRole('dialog');
      await modal.getByText('fragments.fasta', { exact: true }).waitFor();
      const download = page.waitForEvent('download');
      await modal.getByRole('button', { name: 'Exporter la source FASTA' }).click();
      assert.equal(readFileSync(await (await download).path(), 'utf8'), `>Fragment UP\n${up}\n`);
      await modal.getByRole('button', { name: 'Ouvrir la fiche d’origine' }).click();
      await page.getByRole('heading', { name: 'Fragment UP', exact: true }).waitFor();
      await page.getByLabel('Séquence ADN', { exact: true }).fill(up + 'A');
      await page.getByRole('button', { name: /^Enregistrer/ }).click();
      await until(() => state().sequences.find((s) => s.id === 'up').sequence === up + 'A');
      await openTarget();
      await page.getByRole('button', { name: 'Source : Fragment UP', exact: true }).first().click();
      await page.getByText(/La fiche d’origine a été modifiée/).waitFor();
      await page
        .getByRole('dialog')
        .getByRole('button', { name: 'Fermer', exact: true })
        .last()
        .click();
    },
  );
  await step(
    'deleted original records and backup restoration preserve annotation source snapshots',
    async () => {
      const current = state();
      app.store.save({
        ...current,
        sequences: current.sequences.filter((s) => s.id !== 'up'),
        primers: [],
      });
      await page.reload();
      await openTarget();
      await page.getByRole('button', { name: 'Source : Fragment UP', exact: true }).first().click();
      await page.getByText(/La fiche d’origine a été supprimée/).waitFor();
      await page
        .getByRole('dialog')
        .getByRole('button', { name: 'Fermer', exact: true })
        .last()
        .click();
      const backup = await (await fetch(base + '/api/backup')).text();
      app.store.save({ ...emptyState(), revision: state().revision });
      await page.reload();
      await page.getByRole('button', { name: 'Préférences & sauvegardes', exact: true }).click();
      await page.getByLabel('Sauvegarde à restaurer').setInputFiles({
        name: 'sources.geneforge.json',
        mimeType: 'application/json',
        buffer: Buffer.from(backup),
      });
      await page.getByRole('button', { name: 'Remplacer l’espace par cette sauvegarde' }).click();
      await until(() => state().sequences.length === 3);
      await openTarget();
      assert.equal(state().sequences[0].annotationSources[0].sequence, up);
      assert.equal(await page.locator('.annotation-card').count(), 4);
    },
  );
  await step(
    'automatic annotation panels and source viewer fit mobile without runtime errors',
    async () => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.getByRole('button', { name: 'Choisir des fragments ou amorces' }).click();
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.screenshot({ path: join(artifacts, 'automatic-mobile.png'), fullPage: true });
      await page
        .getByRole('button', { name: 'Source : Fragment DOWN', exact: true })
        .first()
        .click();
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      assert(
        await page
          .getByRole('dialog')
          .evaluate((dialog) => dialog.scrollWidth <= dialog.clientWidth),
      );
      await page
        .getByRole('button', { name: 'Ouvrir la fiche d’origine' })
        .scrollIntoViewIfNeeded();
      await page.screenshot({ path: join(artifacts, 'source-mobile.png'), fullPage: false });
      assert.deepEqual(errors, []);
    },
  );
  console.log(`Completed ${steps} search/annotation browser workflows.`);
} catch (error) {
  await page
    ?.screenshot({ path: join(artifacts, 'e2e-search-failure.png'), fullPage: true })
    .catch(() => {});
  throw error;
} finally {
  await browser?.close();
  await app.close();
  rmSync(dataDir, { recursive: true, force: true });
}
