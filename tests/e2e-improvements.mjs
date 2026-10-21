import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { createGeneForgeServer } from '../server/index.ts';
import { emptyState } from '../server/storage.ts';
const dataDir = mkdtempSync(join(tmpdir(), 'geneforge-improvements-')),
  artifacts = resolve('artifacts');
mkdirSync(artifacts, { recursive: true });
const app = createGeneForgeServer({ dataDir, staticDir: resolve('dist') }),
  stamp = '2026-10-21T10:00:00.000Z';
const tail = 'TTAGGCCATGGAACCTTTAA',
  longDna = 'ACGT'.repeat(249995) + tail;
app.store.save({
  ...emptyState(),
  projects: [
    {
      id: 'p',
      name: 'Projet artificiel',
      description: '',
      color: '#123456',
      pinned: false,
      createdAt: stamp,
      updatedAt: stamp,
    },
  ],
  sequences: [
    {
      id: 's',
      projectId: 'p',
      name: 'Grand fragment artificiel',
      sequence: longDna,
      topology: 'linear',
      notes: '',
      annotations: [],
      annotationSources: [],
      sourceFile: null,
      createdAt: stamp,
      updatedAt: stamp,
    },
  ],
  primers: ['N10', 'N2', 'N1', 'N60'].map((name, i) => ({
    id: 'n' + i,
    name,
    sequence: i % 2 ? 'ACGATCGACTTGCAACGT' : 'ACGTTGCAAGTCGATCGT',
    orientation: 'other',
    notes: 'Données artificielles',
    sourceFile: null,
    tags: [],
    projectIds: [],
    favorite: false,
    status: 'active',
    createdAt: stamp,
    updatedAt: stamp,
  })),
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
  console.log('PASS IMPROVEMENT ' + ++steps + ' ' + name);
}
async function until(fn) {
  const end = Date.now() + 10000;
  while (Date.now() < end) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('Timed out');
}
async function nav(name) {
  await page.getByRole('navigation').getByRole('button', { name, exact: true }).click();
}
try {
  browser = await chromium.launch({
    headless: true,
    ...(process.env.GENEFORGE_BROWSER ? { channel: process.env.GENEFORGE_BROWSER } : {}),
  });
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.goto(base);
  await step('library and pair choices use natural N1, N2, N10, N60 order', async () => {
    await nav('Bibliothèque d’amorces');
    assert.deepEqual(await page.locator('tbody tr .table-name').allTextContents(), [
      'N1',
      'N2',
      'N10',
      'N60',
    ]);
    const names = await page
      .locator('tbody tr')
      .evaluateAll((rows) => rows.map((r) => r.querySelector('td')?.textContent));
    const text = await page.locator('tbody').innerText();
    assert(text.indexOf('N1') < text.indexOf('N2'));
    assert(text.indexOf('N2') < text.indexOf('N10'));
    assert(text.indexOf('N10') < text.indexOf('N60'));
    await nav('Analyseur d’oligos');
    await page.getByRole('button', { name: 'Paire d’oligos', exact: true }).click();
    assert.deepEqual(
      await page
        .getByLabel('Choisir l’oligo 1', { exact: true })
        .locator('option')
        .allTextContents(),
      ['Choisir une amorce…', 'N1', 'N2', 'N10', 'N60'],
    );
  });
  await step(
    'two-primer analysis uses real Primer3 and exports both oligos and conditions',
    async () => {
      await page.getByLabel('Choisir l’oligo 1', { exact: true }).selectOption('n2');
      await page.getByLabel('Choisir l’oligo 2', { exact: true }).selectOption('n1');
      await page
        .getByRole('button', { name: 'Analyser la paire avec Primer3', exact: true })
        .click();
      await page.getByRole('region', { name: 'Résultats de la paire' }).waitFor();
      await page.getByText(/Interaction prédite par Primer3/).waitFor();
      await page.getByText(/kcal\/mol/).waitFor();
      const event = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Exporter les résultats de la paire' }).click();
      const file = await event;
      await file.saveAs(join(artifacts, 'pair-result.json'));
      const result = JSON.parse(readFileSync(join(artifacts, 'pair-result.json'), 'utf8'));
      assert.equal(result.sequences.length, 2);
      assert.equal(result.result.parameters.mv_conc, 50);
      assert.equal(result.result.engine, 'primer3-py');
      assert(result.result.heterodimer.structureFound);
      await page.screenshot({ path: join(artifacts, 'oligo-pair.png'), fullPage: true });
    },
  );
  await step(
    'one continuous virtual view scrolls a megabase with the wheel and finds its last bases',
    async () => {
      await nav('Séquences');
      await page.getByRole('button', { name: 'Grand fragment artificiel', exact: true }).click();
      await page.getByRole('button', { name: 'Vue colorée', exact: true }).click();
      const viewport = page.getByRole('textbox', {
        name: 'Séquence colorée sélectionnable',
        exact: true,
      });
      await viewport.scrollIntoViewIfNeeded();
      await viewport.hover();
      await page.mouse.wheel(0, 1100);
      await until(async () => await viewport.evaluate((el) => el.scrollTop > 500));
      assert((await page.locator('[data-base-index]').count()) < 4000);
      assert.equal(await page.getByText(/^Page \d+ \/ /).count(), 0);
      await page.getByLabel('Rechercher dans cette séquence').fill(tail);
      await page
        .getByText('Trouvé : 1 occurrence(s) · fragment de 20 nt', { exact: true })
        .waitFor();
      await page.locator('[data-base-index="999999"]').waitFor();
      assert.equal(await page.locator('.search-hit').count(), 20);
      await page.getByRole('button', { name: 'Dézoomer la séquence', exact: true }).click();
      assert.equal(
        await page.getByLabel('Zoom de la séquence', { exact: true }).inputValue(),
        '13',
      );
      await page.getByLabel('Zoom de la séquence', { exact: true }).fill('8');
      await page.getByLabel('Bases par ligne de la séquence', { exact: true }).selectOption('120');
      await page.locator('[data-base-index="999999"]').waitFor();
      await page.screenshot({ path: join(artifacts, 'continuous-sequence.png'), fullPage: true });
    },
  );
  await step('new accents persist and light theme keeps tinted navigation and panels', async () => {
    await page.getByRole('button', { name: 'Préférences & sauvegardes', exact: true }).click();
    await page.getByLabel('Thème', { exact: true }).selectOption('light');
    await page.getByLabel('Couleur d’accent', { exact: true }).selectOption('coral');
    await page.getByRole('button', { name: 'Enregistrer les préférences', exact: true }).click();
    await until(() => state().settings.accent === 'coral');
    await page.waitForFunction(() => document.documentElement.dataset.accent === 'coral');
    await page.screenshot({ path: join(artifacts, 'light-coral.png'), fullPage: true });
  });
  await step(
    'twelve lanes are detected automatically at import and remain adjustable',
    async () => {
      await nav('Gels');
      const image = await page.evaluate(() => {
        const c = document.createElement('canvas');
        c.width = 960;
        c.height = 300;
        const x = c.getContext('2d');
        x.fillStyle = '#080808';
        x.fillRect(0, 0, 960, 300);
        for (let l = 0; l < 12; l++) {
          x.fillStyle = '#ddd';
          x.fillRect(l * 80 + 20, 60 + (l % 3) * 10, 40, 10);
          x.fillStyle = '#fff';
          x.fillRect(l * 80 + 20, 180, 40, 12);
        }
        return c.toDataURL('image/png').split(',')[1];
      });
      await page.getByLabel('Image du gel', { exact: true }).setInputFiles({
        name: 'Douze pistes.png',
        mimeType: 'image/png',
        buffer: Buffer.from(image, 'base64'),
      });
      await page.getByRole('heading', { name: 'Douze pistes', exact: true }).waitFor();
      assert.equal(state().gels[0].lanes.length, 12);
      assert.equal(await page.getByLabel('Nombre de pistes', { exact: true }).inputValue(), '12');
      await page.getByRole('button', { name: 'Choisir la piste 12', exact: true }).click();
      await page
        .getByRole('button', { name: 'Détecter automatiquement les pistes', exact: true })
        .click();
      await page
        .getByText(/Détection automatique : 12 pistes proposées/)
        .first()
        .waitFor();
      await page.getByRole('button', { name: 'Enregistrer le gel', exact: true }).click();
      await page.screenshot({ path: join(artifacts, 'auto-twelve-lanes.png'), fullPage: true });
    },
  );
  await step('continuous sequence and pair forms fit mobile without runtime errors', async () => {
    await nav('Analyseur d’oligos');
    await page.getByRole('button', { name: 'Paire d’oligos', exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: join(artifacts, 'pair-mobile.png'), fullPage: true });
    await nav('Séquences');
    await page.getByRole('button', { name: 'Grand fragment artificiel', exact: true }).click();
    await page.getByRole('button', { name: 'Vue colorée', exact: true }).click();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.deepEqual(errors, []);
  });
  console.log('Completed ' + steps + ' new improvement workflows.');
} catch (error) {
  await page
    ?.screenshot({ path: join(artifacts, 'improvements-failure.png'), fullPage: true })
    .catch(() => {});
  throw error;
} finally {
  await browser?.close();
  await app.close();
  rmSync(dataDir, { recursive: true, force: true });
}
