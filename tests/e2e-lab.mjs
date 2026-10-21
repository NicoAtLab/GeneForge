import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { createGeneForgeServer } from '../server/index.ts';
import { emptyState } from '../server/storage.ts';

const dataDir = mkdtempSync(join(tmpdir(), 'geneforge-lab-e2e-'));
const artifacts = resolve('artifacts');
mkdirSync(artifacts, { recursive: true });
const app = createGeneForgeServer({ dataDir, staticDir: resolve('dist') });
const stamp = '2026-10-20T10:00:00.000Z';
app.store.save({
  ...emptyState(),
  primers: [
    {
      id: 'primer-test',
      name: 'Amorce artificielle',
      sequence: 'ACGTTGCAAGTCGATCGT',
      orientation: 'forward',
      notes: 'Échantillon artificiel · validation',
      sourceFile: 'test.csv',
      tags: [],
      projectIds: [],
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
  steps++;
  console.log(`PASS LAB ${steps} ${name}`);
}
async function until(fn) {
  const end = Date.now() + 10000;
  while (Date.now() < end) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 60));
  }
  throw new Error('Timed out waiting for saved lab data');
}
async function nav(label) {
  await page.getByRole('navigation').getByRole('button', { name: label, exact: true }).click();
}
async function dragImage(x1, y1, x2, y2) {
  const svg = page.getByRole('img', { name: 'Gel à sélectionner et annoter' });
  await svg.scrollIntoViewIfNeeded();
  const b = await svg.boundingBox();
  await page.mouse.move(b.x + (x1 / 600) * b.width, b.y + (y1 / 360) * b.height);
  await page.mouse.down();
  await page.mouse.move(b.x + (x2 / 600) * b.width, b.y + (y2 / 360) * b.height, { steps: 10 });
  await page.mouse.up();
}
try {
  browser = await chromium.launch({
    headless: true,
    ...(process.env.GENEFORGE_BROWSER ? { channel: process.env.GENEFORGE_BROWSER } : {}),
  });
  page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.goto(base);
  await step('import original image, crop gel and divide equal lanes', async () => {
    const data = await page.evaluate(() => {
      const c = document.createElement('canvas');
      c.width = 600;
      c.height = 360;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#151515';
      ctx.fillRect(0, 0, 600, 360);
      ctx.fillStyle = '#000';
      ctx.fillRect(20, 30, 560, 310);
      for (let i = 0; i < 5; i++) {
        ctx.fillStyle = '#ccc';
        ctx.fillRect(45 + i * 112, 80 + i * 20, 55, 9);
        ctx.fillStyle = '#fff';
        ctx.fillRect(45 + i * 112, 180, 55, 12);
      }
      return c.toDataURL('image/png').split(',')[1];
    });
    await nav('Gels');
    await page
      .getByLabel('Image du gel', { exact: true })
      .setInputFiles({
        name: 'Gel artificiel.png',
        mimeType: 'image/png',
        buffer: Buffer.from(data, 'base64'),
      });
    await page.getByRole('heading', { name: 'Gel artificiel', exact: true }).waitFor();
    await page.getByLabel('Nombre de pistes', { exact: true }).fill('5');
    await page.getByRole('button', { name: 'Diviser en pistes égales' }).click();
    await dragImage(20, 30, 580, 340);
    await page.getByRole('button', { name: 'Enregistrer le gel', exact: true }).click();
    await until(
      () => state().gels[0].lanes.length === 5 && Math.abs(state().gels[0].crop.width - 560) < 0.01,
    );
    assert.equal(state().gels[0].image.fileName, 'Gel artificiel.png');
    assert.equal(state().gels[0].image.dataUrl.split(',')[1], data);
  });
  await step('lane descriptions, linked primer snapshots and real Primer3 conditions', async () => {
    await page.getByRole('button', { name: 'Choisir la piste 2', exact: true }).click();
    await page.getByLabel('Légende de la piste', { exact: true }).fill('Contrôle artificiel');
    await page
      .getByLabel('Description de la piste', { exact: true })
      .fill('Observation de test, sans données expérimentales.');
    await page
      .getByLabel('Ajouter une amorce à la piste', { exact: true })
      .selectOption('primer-test');
    await page.getByRole('button', { name: 'Calculer la Tm Primer3', exact: true }).click();
    await page
      .getByText(/Tm 5\d[,.]/)
      .first()
      .waitFor();
    await page.getByRole('button', { name: 'Conserver ce calcul dans la légende' }).click();
    await page.getByRole('button', { name: 'Enregistrer le gel', exact: true }).click();
    await until(() => state().gels[0].lanes[1].description.includes('mv_conc'));
    assert.equal(state().gels[0].lanes[1].primers[0].sequence, 'ACGTTGCAAGTCGATCGT');
  });
  await step(
    'manually circle a band, change color, undo/redo and save pixel coordinates',
    async () => {
      await page.getByRole('button', { name: '2 · Entourer une bande', exact: true }).click();
      await dragImage(148, 175, 214, 198);
      await page.getByLabel('Nom de la bande', { exact: true }).fill('Bande à conserver');
      await page.getByLabel('Couleur de la bande', { exact: true }).fill('#30b5ff');
      await page.getByRole('button', { name: 'Annuler', exact: true }).click();
      await page.getByRole('button', { name: 'Rétablir', exact: true }).click();
      await page.getByRole('button', { name: 'Bande à conserver', exact: true }).click();
      await page.getByText(/pixels · signal moyen/).waitFor();
      await page.getByRole('button', { name: 'Enregistrer le gel', exact: true }).click();
      await until(() => state().gels[0].bands.length === 1);
      assert.equal(state().gels[0].bands[0].color, '#30b5ff');
      assert.equal(state().gels[0].bands[0].laneId, state().gels[0].lanes[1].id);
      await page.screenshot({ path: join(artifacts, 'gel-studio.png'), fullPage: true });
    },
  );
  await step(
    'figure, individual equal-width lane, original image and measurement exports',
    async () => {
      for (const [label, name] of [
        ['Exporter la figure PNG', 'gel-figure.png'],
        ['Exporter cette piste PNG', 'gel-lane.png'],
        ['Image originale', 'gel-original.png'],
        ['Exporter les mesures CSV', 'gel-measures.csv'],
      ]) {
        const event = page.waitForEvent('download');
        await page.getByRole('button', { name: label, exact: true }).click();
        const file = await event;
        await file.saveAs(join(artifacts, name));
      }
      const figure = readFileSync(join(artifacts, 'gel-figure.png'));
      assert.equal(figure.subarray(1, 4).toString(), 'PNG');
      assert(
        readFileSync(join(artifacts, 'gel-measures.csv'), 'utf8').includes('Bande à conserver'),
      );
    },
  );
  await step('notes link gels and server references, copy for e-Lab and render PDF', async () => {
    await nav('Notes');
    await page.getByRole('button', { name: 'Nouvelle note', exact: true }).click();
    await page.getByLabel('Titre de la note', { exact: true }).fill('Observations artificielles');
    await page
      .getByLabel('Contenu de la note', { exact: true })
      .fill('Test de note pour e-Lab.\nAucune manipulation réelle.');
    await page
      .getByLabel('Références de fichiers sur serveur', { exact: true })
      .fill('\\\\serveur\\collection-test.xlsx');
    await page.getByLabel('Gel artificiel', { exact: true }).check();
    await page.getByRole('button', { name: 'Enregistrer la note', exact: true }).click();
    await until(() => state().notes.length === 1);
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.getByRole('button', { name: 'Copier pour e-Lab', exact: true }).click();
    await until(async () =>
      (await page.evaluate(() => navigator.clipboard.readText())).includes('Amorce artificielle'),
    );
    await page.getByRole('button', { name: 'Exporter PDF', exact: true }).click();
    await page.getByRole('dialog', { name: 'Aperçu du rapport' }).waitFor();
    await page.locator('.report-paper img').evaluate((img) => img.decode());
    await page.emulateMedia({ media: 'print' });
    await page.pdf({
      path: join(artifacts, 'note-gel-report.pdf'),
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
    });
    await page.emulateMedia({ media: 'screen' });
    await page.screenshot({ path: join(artifacts, 'note-report.png'), fullPage: false });
    assert.equal(
      readFileSync(join(artifacts, 'note-gel-report.pdf')).subarray(0, 4).toString(),
      '%PDF',
    );
    await page.getByRole('button', { name: 'Fermer le rapport', exact: true }).click();
  });
  await step(
    'assistant selected context, cited answer, note creation and error recovery',
    async () => {
      await page.route('**/api/assistant/status', (route) =>
        route.fulfill({ json: { configured: true, model: 'test-model' } }),
      );
      let calls = 0;
      await page.route('**/api/assistant', async (route) => {
        const body = route.request().postDataJSON();
        assert.equal(body.choices.length, 1);
        assert.equal(body.includeGelImages, false);
        assert.equal(body.choices[0].kind, 'note');
        calls++;
        if (calls === 2)
          return route.fulfill({
            status: 429,
            json: { error: { message: 'Limite de crédit de test' } },
          });
        return route.fulfill({
          json: {
            answer: 'Observation structurée à vérifier [S1].',
            model: 'test-model',
            incomplete: false,
            sources: [
              {
                id: 'S1',
                name: 'Observations artificielles',
                kind: 'note',
                recordId: state().notes[0].id,
              },
            ],
            usage: { inputTokens: 20, outputTokens: 10 },
          },
        });
      });
      await nav('Assistant IA');
      await page.getByLabel('Partager Note : Observations artificielles', { exact: true }).check();
      await page.getByLabel('Message à l’assistant', { exact: true }).fill('Reformule ma note.');
      await page.getByRole('button', { name: 'Envoyer à OpenAI', exact: true }).click();
      await page.getByText('Observation structurée à vérifier [S1].', { exact: true }).waitFor();
      await page.getByRole('button', { name: 'Conserver dans Notes', exact: true }).click();
      await until(() => state().notes.length === 2);
      assert(state().notes[1].body.includes('test-model'));
      await page.getByLabel('Message à l’assistant', { exact: true }).fill('Encore.');
      await page.getByRole('button', { name: 'Envoyer à OpenAI', exact: true }).click();
      await page.getByRole('alert').filter({ hasText: 'Limite de crédit' }).waitFor();
      assert.equal(
        await page.getByLabel('Message à l’assistant', { exact: true }).inputValue(),
        'Encore.',
      );
      await page.screenshot({ path: join(artifacts, 'assistant.png'), fullPage: true });
    },
  );
  await step(
    'backup restoration preserves gel image, contours, note and deleted primer snapshot',
    async () => {
      const original = state();
      app.store.save({ ...original, primers: [] });
      const backup = await (await fetch(base + '/api/backup')).json();
      app.store.save({ ...emptyState(), revision: state().revision });
      const response = await fetch(base + '/api/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(backup),
      });
      assert(response.ok);
      assert.equal(state().gels[0].image.dataUrl, original.gels[0].image.dataUrl);
      assert.equal(state().gels[0].bands[0].label, 'Bande à conserver');
      assert.equal(state().notes.length, 2);
      assert.equal(state().gels[0].lanes[1].primers[0].name, 'Amorce artificielle');
    },
  );
  await step(
    'mobile notes, gel editor and assistant have no horizontal page overflow',
    async () => {
      await page.reload();
      await page.setViewportSize({ width: 390, height: 844 });
      await nav('Gels');
      await page
        .getByRole('button', { name: /Gel artificiel/ })
        .last()
        .click();
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.screenshot({ path: join(artifacts, 'gel-mobile.png'), fullPage: true });
      await nav('Notes');
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await nav('Assistant IA');
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      assert.deepEqual(errors, []);
    },
  );
  console.log(`Completed ${steps} notes/gel/assistant browser workflows.`);
} catch (e) {
  await page
    ?.screenshot({ path: join(artifacts, 'e2e-lab-failure.png'), fullPage: true })
    .catch(() => {});
  throw e;
} finally {
  await browser?.close();
  await app.close();
  rmSync(dataDir, { recursive: true, force: true });
}
