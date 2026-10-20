import { useState } from 'react';
import type { Settings, WorkspaceState } from '../types.ts';
import { api, download, readFile } from '../lib.ts';
import type { Commit } from '../lib.ts';
import { Heading } from './Common.tsx';
import { Icon } from './Icon.tsx';
export function SettingsPage({
  state,
  commit,
  busy,
  onRestore,
  notify,
}: {
  state: WorkspaceState;
  commit: Commit;
  busy: boolean;
  onRestore: (value: unknown) => Promise<void>;
  notify: (message: string) => void;
}) {
  const [settings, setSettings] = useState<Settings>(state.settings),
    [pendingBackup, setPendingBackup] = useState<unknown>(null),
    [backupName, setBackupName] = useState('');
  async function backup() {
    try {
      const data = await api<unknown>('/api/backup');
      download(
        JSON.stringify(data, null, 2),
        'GeneForge-' + new Date().toISOString().slice(0, 10) + '.geneforge.json',
        'application/json',
      );
      notify('Sauvegarde exportée.');
    } catch (e) {
      notify((e as Error).message);
    }
  }
  async function load(file?: File) {
    setPendingBackup(null);
    if (!file) return;
    try {
      const value = JSON.parse(await readFile(file));
      if (value?.format !== 'geneforge' || value?.version !== 1)
        throw new Error('Ce fichier n’est pas une sauvegarde GeneForge compatible.');
      setPendingBackup(value);
      setBackupName(file.name);
    } catch (e) {
      notify((e as Error).message);
    }
  }
  return (
    <>
      <Heading eyebrow="Votre espace" title="Préférences & sauvegardes">
        Un profil local, des données qui restent sur votre ordinateur.
      </Heading>
      <div className="settings-grid">
        <div className="panel">
          <div className="panel-heading">
            <h3>Profil & apparence</h3>
            <Icon name="settings" />
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void commit((s) => ({ ...s, settings }), 'Préférences enregistrées.');
            }}
          >
            <div className="panel-body">
              <label className="field">
                Nom d’affichage
                <input
                  className="input"
                  maxLength={200}
                  value={settings.name}
                  onChange={(e) => setSettings({ ...settings, name: e.target.value })}
                  placeholder="Votre nom"
                />
              </label>
              <label className="field">
                Laboratoire / organisation
                <input
                  className="input"
                  maxLength={200}
                  value={settings.organization}
                  onChange={(e) => setSettings({ ...settings, organization: e.target.value })}
                  placeholder="Votre laboratoire"
                />
              </label>
              <label className="field">
                Thème
                <select
                  className="select"
                  value={settings.theme}
                  onChange={(e) =>
                    setSettings({ ...settings, theme: e.target.value as Settings['theme'] })
                  }
                >
                  <option value="dark">Sombre</option>
                  <option value="light">Clair</option>
                  <option value="system">Selon le système</option>
                </select>
              </label>
              <label className="field">
                Bases par ligne dans la vue colorée
                <select
                  className="select"
                  value={settings.basesPerLine}
                  onChange={(e) =>
                    setSettings({ ...settings, basesPerLine: Number(e.target.value) })
                  }
                >
                  {[30, 40, 60, 80, 100, 120].map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </label>
              <button className="button primary" disabled={busy}>
                <Icon name="save" />
                Enregistrer les préférences
              </button>
            </div>
          </form>
        </div>
        <div>
          <div className="panel">
            <div className="panel-heading">
              <h3>Sauvegarde de l’espace</h3>
              <Icon name="shield" />
            </div>
            <div className="panel-body">
              <p>
                Projets, séquences, amorces et préférences, regroupés dans un fichier JSON avec
                empreinte d’intégrité SHA-256.
              </p>
              <button className="button secondary" onClick={() => void backup()}>
                <Icon name="download" />
                Exporter une sauvegarde complète
              </button>
              <hr />
              <label className="field">
                Restaurer une sauvegarde
                <input
                  className="input"
                  type="file"
                  accept=".json"
                  aria-label="Sauvegarde à restaurer"
                  onChange={(e) => void load(e.target.files?.[0])}
                />
              </label>
              {pendingBackup !== null && (
                <div className="notice warning">
                  <p>
                    <strong>{backupName}</strong>
                  </p>
                  <p>
                    La restauration remplacera tout l’espace actuel. Une copie préalable sera
                    conservée dans le dossier local data/backups.
                  </p>
                  <button
                    className="button danger"
                    disabled={busy}
                    onClick={() => {
                      void onRestore(pendingBackup)
                        .then(() => setPendingBackup(null))
                        .catch(() => {});
                    }}
                  >
                    Remplacer l’espace par cette sauvegarde
                  </button>
                </div>
              )}
              <p className="muted small-text">
                Les modifications validées sont écrites dans SQLite. L’éditeur de séquences utilise
                un enregistrement manuel (Ctrl+S). Exportez régulièrement une copie sur un autre
                support.
              </p>
            </div>
          </div>
          <div className="panel">
            <div className="panel-heading">
              <h3>
                GeneForge <span className="tag">0.1.0</span>
              </h3>
            </div>
            <div className="panel-body">
              <p>Molecular Design Workspace</p>
              <p className="muted">
                MVP local : projets, séquences ADN, bibliothèque d’amorces et analyse d’oligos avec
                Primer3.
              </p>
              <p className="muted small-text">
                Cartes plasmidiques, annotations, alignements Biopython, chromatogrammes et
                installateur natif : prochaines étapes. Ces modules ne sont pas inclus dans cette
                livraison.
              </p>
              <a
                className="text-link"
                href="https://github.com/NicoAtLab/GeneForge"
                target="_blank"
                rel="noreferrer"
              >
                Dépôt du projet <Icon name="external" size={14} />
              </a>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
