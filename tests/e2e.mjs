import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { chromium } from 'playwright';
import { createGeneForgeServer } from '../server/index.ts';

const dataDir = mkdtempSync(join(tmpdir(), 'geneforge-e2e-'));
const artifacts = resolve('artifacts');
mkdirSync(artifacts, { recursive: true });
const app = createGeneForgeServer({ dataDir, staticDir: resolve('dist') });
await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + app.server.address().port;
let browser;
let page;
const errors = [];
let steps = 0;
async function step(name, fn) {
  await fn();
  steps++;
  console.log('PASS ' + steps + ' ' + name);
}
async function state() {
  return (await fetch(base + '/api/state')).json();
}
async function until(fn) {
  const end = Date.now() + 10000;
  while (Date.now() < end) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 75));
  }
  throw new Error('Timed out waiting for persisted state');
}
async function navigation(label) {
  await page.getByRole('navigation').getByRole('button', { name: label, exact: true }).click();
}
try {
  browser = await chromium.launch({
    headless: true,
    ...(process.env.GENEFORGE_BROWSER ? { channel: process.env.GENEFORGE_BROWSER } : {}),
  });
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(base);
  await step('empty dashboard and project creation', async () => {
    await page.getByRole('heading', { name: 'Bienvenue dans GeneForge' }).waitFor();
    await page.getByRole('button', { name: 'Nouveau projet', exact: true }).click();
    await page.getByLabel('Nom du projet').fill('Projet de validation');
    await page
      .getByLabel('Description', { exact: true })
      .fill('Données artificielles pour les tests de l’interface.');
    await page.getByRole('button', { name: 'Créer le projet', exact: true }).click();
    await until(async () => (await state()).projects.length === 1);
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
  });
  await step('sequence creation, normalization and persistence', async () => {
    await page.getByRole('button', { name: 'Nouvelle séquence', exact: false }).click();
    await page
      .getByRole('dialog')
      .getByLabel('Nom', { exact: true })
      .fill('Séquence de validation');
    await page.getByLabel('Séquence ADN · facultative').fill('acgt nry acgt');
    await page.getByRole('button', { name: 'Créer et ouvrir' }).click();
    await page.getByRole('heading', { name: 'Séquence de validation' }).waitFor();
    assert.equal((await state()).sequences[0].sequence, 'ACGTNRYACGT');
    await page
      .getByRole('textbox', { name: 'Séquence ADN', exact: true })
      .fill('ACGTTGCAAGTCGATCGT');
    await page.getByRole('button', { name: /^Enregistrer/ }).click();
    await until(async () => (await state()).sequences[0].sequence === 'ACGTTGCAAGTCGATCGT');
    await page.reload();
    await navigation('Séquences');
    await page.getByRole('button', { name: 'Séquence de validation', exact: true }).click();
    assert.equal(
      await page.getByRole('textbox', { name: 'Séquence ADN', exact: true }).inputValue(),
      'ACGTTGCAAGTCGATCGT',
    );
  });
  await step(
    'invalid DNA is visible and cannot be saved; undo and exact motif search',
    async () => {
      const box = page.getByRole('textbox', { name: 'Séquence ADN', exact: true });
      await box.fill('ACGT!');
      await page.getByRole('alert').filter({ hasText: 'Caractères invalides' }).waitFor();
      assert(await page.getByRole('button', { name: /^Enregistrer/ }).isDisabled());
      await page.getByRole('button', { name: 'Annuler', exact: true }).click();
      assert.equal(await box.inputValue(), 'ACGTTGCAAGTCGATCGT');
      await page.getByLabel('Rechercher un motif exact').fill('CGT');
      await page.getByText(/2 occurrence/).waitFor();
      await page.getByRole('button', { name: 'Vue colorée', exact: true }).click();
      await page.getByText('Page 1 / 1', { exact: true }).waitFor();
    },
  );
  await step('primer CRUD and duplicate detection', async () => {
    await navigation('Bibliothèque d’amorces');
    await page.getByRole('button', { name: 'Ajouter une amorce', exact: true }).first().click();
    let modal = page.getByRole('dialog');
    await modal.getByLabel('Nom', { exact: true }).fill('Oligo de validation');
    await modal.getByLabel('Séquence · 5′ → 3′').fill('ACGTTGCAAGTCGATCGT');
    await modal.getByLabel('Tags · séparés par des virgules').fill('test, artificiel');
    await modal.getByRole('button', { name: 'Enregistrer', exact: true }).click();
    await until(async () => (await state()).primers.length === 1);
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: 'Ajouter une amorce', exact: true }).first().click();
    modal = page.getByRole('dialog');
    await modal.getByLabel('Nom', { exact: true }).fill('Doublon');
    await modal.getByLabel('Séquence · 5′ → 3′').fill('ACGTTGCAAGTCGATCGT');
    await modal.getByText(/Cette séquence existe déjà/).waitFor();
    assert(await modal.getByRole('button', { name: 'Enregistrer', exact: true }).isDisabled());
    await modal.getByRole('button', { name: 'Annuler', exact: true }).click();
  });
  await step('Primer3 returns a real local Tm and reacts to changed parameters', async () => {
    await page.getByRole('button', { name: 'Analyser Oligo de validation', exact: true }).click();
    await page.getByRole('button', { name: 'Calculer avec Primer3' }).click();
    await page.getByText(/Calculé avec primer3-py 2.3.1/).waitFor();
    const first = await page.locator('.tm-value').first().textContent();
    assert(!first.includes('—'));
    await page.getByLabel('Ions monovalents (mM)').fill('100');
    assert((await page.locator('.tm-value').first().textContent()).includes('—'));
    await page.getByRole('button', { name: 'Calculer avec Primer3' }).click();
    await page.getByText(/Calculé avec primer3-py 2.3.1/).waitFor();
    assert.notEqual(await page.locator('.tm-value').first().textContent(), first);
  });
  await step('FASTA import previews before saving and exports correct content', async () => {
    await navigation('Séquences');
    await page.getByRole('button', { name: 'Importer FASTA', exact: true }).click();
    await page
      .getByLabel('Fichier à importer')
      .setInputFiles({
        name: 'test.fasta',
        mimeType: 'text/plain',
        buffer: Buffer.from('>Séquence importée\nACGTACGTNN\n'),
      });
    await page.getByRole('button', { name: 'Importer 1 entrée(s)', exact: true }).click();
    await until(async () => (await state()).sequences.length === 2);
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    const saved = page.waitForEvent('download');
    await page.getByRole('button', { name: 'FASTA', exact: true }).click();
    const content = readFileSync(await (await saved).path(), 'utf8');
    assert(content.includes('>Séquence importée\nACGTACGTNN'));
  });
  await step('primer CSV import skips duplicate sequences', async () => {
    await navigation('Bibliothèque d’amorces');
    await page.getByRole('button', { name: 'Importer', exact: true }).click();
    await page
      .getByLabel('Fichier à importer')
      .setInputFiles({
        name: 'test.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from(
          'name,sequence,notes,tags\nDoublon,ACGTTGCAAGTCGATCGT,,\nNouvel oligo,TTGCAACGTAGCTACGTA,Test,import\n',
        ),
      });
    await page.getByText(/1 doublon\(s\) ignoré/).waitFor();
    await page.getByRole('button', { name: 'Importer 1 entrée(s)', exact: true }).click();
    await until(async () => (await state()).primers.length === 2);
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: 'Archiver Nouvel oligo', exact: true }).click();
    await until(
      async () =>
        (await state()).primers.find((p) => p.name === 'Nouvel oligo').status === 'archived',
    );
    await page.getByLabel('Statut des amorces').selectOption('archived');
    await page.getByRole('button', { name: 'Restaurer Nouvel oligo', exact: true }).click();
    await until(
      async () =>
        (await state()).primers.find((p) => p.name === 'Nouvel oligo').status === 'active',
    );
  });
  let backup;
  await step('preferences and complete backup export', async () => {
    await page.getByRole('button', { name: 'Préférences & sauvegardes', exact: true }).click();
    await page.getByLabel('Nom d’affichage').fill('Validation');
    await page.getByLabel('Laboratoire / organisation').fill('Espace de démonstration');
    await page.getByRole('button', { name: 'Enregistrer les préférences' }).click();
    await until(async () => (await state()).settings.name === 'Validation');
    const saved = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Exporter une sauvegarde complète' }).click();
    backup = readFileSync(await (await saved).path(), 'utf8');
    assert.equal(JSON.parse(backup).format, 'geneforge');
    assert.equal(JSON.parse(backup).state.sequences.length, 2);
  });
  await step('global search and verified backup restoration', async () => {
    await page.keyboard.press('Control+k');
    await page.getByLabel('Recherche globale').fill('importée');
    await page.getByRole('button', { name: 'Séquence importée Séquence' }).click();
    await page.getByRole('heading', { name: 'Séquence importée', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Préférences & sauvegardes', exact: true }).click();
    await page.getByLabel('Nom d’affichage').fill('Après sauvegarde');
    await page.getByRole('button', { name: 'Enregistrer les préférences' }).click();
    await until(async () => (await state()).settings.name === 'Après sauvegarde');
    await navigation('Projets');
    await page.getByRole('button', { name: 'Modifier Projet de validation', exact: true }).click();
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Supprimer le projet', exact: true }).click();
    await until(async () => (await state()).projects.length === 0);
    assert.equal((await state()).sequences.length, 0);
    assert.equal((await state()).primers.length, 2);
    assert((await state()).primers.every((p) => p.projectIds.length === 0));
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: 'Préférences & sauvegardes', exact: true }).click();
    await page
      .getByLabel('Sauvegarde à restaurer')
      .setInputFiles({
        name: 'valid.geneforge.json',
        mimeType: 'application/json',
        buffer: Buffer.from(backup),
      });
    await page.getByRole('button', { name: 'Remplacer l’espace par cette sauvegarde' }).click();
    await until(async () => (await state()).settings.name === 'Validation');
    assert.equal((await state()).projects.length, 1);
    assert.equal((await state()).sequences.length, 2);
    await page.reload();
    await page.getByRole('heading', { name: /Bonjour, Validation/ }).waitFor();
  });
  await step('desktop and mobile layout; no runtime errors', async () => {
    await page.screenshot({ path: join(artifacts, 'dashboard-1440.png'), fullPage: true });
    await page.setViewportSize({ width: 1080, height: 720 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: join(artifacts, 'dashboard-1080.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: join(artifacts, 'dashboard-mobile.png'), fullPage: true });
    await page.getByRole('button', { name: 'Préférences & sauvegardes', exact: true }).click();
    await page.getByLabel('Thème').selectOption('light');
    await page.getByRole('button', { name: 'Enregistrer les préférences' }).click();
    await until(async () => (await state()).settings.theme === 'light');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await navigation('Vue d’ensemble');
    await page.screenshot({ path: join(artifacts, 'dashboard-light.png'), fullPage: true });
    await navigation('Séquences');
    await page.getByRole('button', { name: 'Séquence de validation', exact: true }).click();
    await page.screenshot({ path: join(artifacts, 'editor.png'), fullPage: true });
    await navigation('Bibliothèque d’amorces');
    await page.getByRole('button', { name: 'Analyser Oligo de validation', exact: true }).click();
    await page.getByRole('button', { name: 'Calculer avec Primer3' }).click();
    await page.getByText(/Calculé avec primer3-py 2.3.1/).waitFor();
    await page.screenshot({ path: join(artifacts, 'analyzer.png'), fullPage: true });
    assert.deepEqual(errors, []);
  });
  console.log('Completed ' + steps + ' browser workflows with temporary data.');
} catch (error) {
  if (page)
    await page
      .screenshot({ path: join(artifacts, 'e2e-failure.png'), fullPage: true })
      .catch(() => {});
  throw error;
} finally {
  await browser?.close();
  await app.close();
  rmSync(dataDir, { recursive: true, force: true });
}
