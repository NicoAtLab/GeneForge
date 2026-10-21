import { useState } from 'react';
import type { Primer, Project, WorkspaceState } from '../types.ts';
import type { Commit } from '../lib.ts';
import { now, readFile, uid } from '../lib.ts';
import { normalizeSequence, validateSequence } from '../core/sequence.ts';
import { parseFasta, parsePrimerCsv } from '../core/formats.ts';
import { Modal } from './Modal.tsx';
import { Icon } from './Icon.tsx';

interface Props {
  state: WorkspaceState;
  commit: Commit;
  busy: boolean;
  onClose: () => void;
}
export function ProjectForm({
  state,
  commit,
  busy,
  onClose,
  project,
}: { project?: Project } & Props) {
  const [name, setName] = useState(project?.name ?? ''),
    [description, setDescription] = useState(project?.description ?? ''),
    [color, setColor] = useState(project?.color ?? '#39d5b0');
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const timestamp = now();
    const next: Project = {
      id: project?.id ?? uid(),
      name: name.trim(),
      description,
      color,
      pinned: project?.pinned ?? false,
      createdAt: project?.createdAt ?? timestamp,
      updatedAt: timestamp,
    };
    if (
      await commit(
        (s) => ({
          ...s,
          projects: project
            ? s.projects.map((p) => (p.id === project.id ? next : p))
            : [...s.projects, next],
        }),
        project ? 'Projet modifié.' : 'Projet créé.',
      )
    )
      onClose();
  }
  async function removeProject() {
    if (!project) return;
    const count = state.sequences.filter((s) => s.projectId === project.id).length;
    if (
      !window.confirm(
        'Supprimer définitivement « ' +
          project.name +
          ' » et ses ' +
          count +
          ' séquence(s) ? Les amorces resteront dans la bibliothèque. Une sauvegarde exportée permet de restaurer les données.',
      )
    )
      return;
    if (
      await commit(
        (s) => ({
          ...s,
          projects: s.projects.filter((p) => p.id !== project.id),
          sequences: s.sequences.filter((seq) => seq.projectId !== project.id),
          primers: s.primers.map((p) => ({
            ...p,
            projectIds: p.projectIds.filter((id) => id !== project.id),
          })),
          notes: s.notes.map((n) => (n.projectId === project.id ? { ...n, projectId: null } : n)),
          gels: s.gels.map((g) => (g.projectId === project.id ? { ...g, projectId: null } : g)),
        }),
        'Projet supprimé.',
      )
    )
      onClose();
  }
  return (
    <Modal title={project ? 'Modifier le projet' : 'Nouveau projet'} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="modal-body">
          <label className="field">
            Nom du projet
            <input
              className="input"
              required
              maxLength={200}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex. Étude de séquences"
            />
          </label>
          <label className="field">
            Description
            <textarea
              className="textarea"
              rows={3}
              maxLength={20000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Objectif et contexte du projet"
            />
          </label>
          <label className="field">
            Couleur
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
          </label>
          <p className="muted small-text">Les données sont conservées sur cet ordinateur.</p>
        </div>
        <div className="modal-footer">
          <button type="button" className="button secondary" onClick={onClose}>
            Annuler
          </button>
          <button
            type="button"
            className="button danger"
            hidden={!project}
            disabled={busy}
            onClick={() => void removeProject()}
          >
            Supprimer le projet
          </button>
          <button className="button primary" disabled={busy || !name.trim()}>
            {project ? 'Enregistrer' : 'Créer le projet'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function SequenceForm({
  state,
  commit,
  busy,
  onClose,
  projectId,
  onCreated,
}: { projectId?: string; onCreated: (id: string) => void } & Props) {
  const [name, setName] = useState(''),
    [project, setProject] = useState(projectId || state.projects[0]?.id || ''),
    [sequence, setSequence] = useState('');
  const normalized = normalizeSequence(sequence),
    validation = validateSequence(sequence);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const id = uid(),
      timestamp = now();
    if (
      await commit(
        (s) => ({
          ...s,
          sequences: [
            ...s.sequences,
            {
              id,
              projectId: project,
              name: name.trim(),
              sequence: normalized,
              annotations: [],
              annotationSources: [],
              sourceFile: null,
              topology: 'linear',
              notes: '',
              createdAt: timestamp,
              updatedAt: timestamp,
            },
          ],
        }),
        'Séquence créée.',
      )
    ) {
      onClose();
      onCreated(id);
    }
  }
  return (
    <Modal title="Nouvelle séquence" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="modal-body">
          <label className="field">
            Nom
            <input
              className="input"
              required
              maxLength={200}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nom de la séquence"
            />
          </label>
          <label className="field">
            Projet
            <select
              className="select"
              required
              value={project}
              onChange={(e) => setProject(e.target.value)}
            >
              {state.projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Séquence ADN · facultative
            <textarea
              className="textarea mono"
              rows={5}
              maxLength={1000000}
              value={sequence}
              spellCheck={false}
              onChange={(e) => setSequence(e.target.value)}
              placeholder="ACGT…"
            />
          </label>
          {!validation.valid && (
            <p className="form-error">
              Caractère invalide à la position {validation.invalid[0].position}.
            </p>
          )}
        </div>
        <div className="modal-footer">
          <button type="button" className="button secondary" onClick={onClose}>
            Annuler
          </button>
          <button
            className="button primary"
            disabled={busy || !project || !name.trim() || !validation.valid}
          >
            Créer et ouvrir
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function PrimerForm({
  state,
  commit,
  busy,
  onClose,
  primer,
  initialSequence = '',
}: { primer?: Primer; initialSequence?: string } & Props) {
  const [name, setName] = useState(primer?.name ?? ''),
    [sequence, setSequence] = useState(primer?.sequence ?? initialSequence),
    [notes, setNotes] = useState(primer?.notes ?? ''),
    [tags, setTags] = useState(primer?.tags.join(', ') ?? ''),
    [orientation, setOrientation] = useState<Primer['orientation']>(primer?.orientation ?? 'other'),
    [projectIds, setProjects] = useState(primer?.projectIds ?? []);
  const normalized = normalizeSequence(sequence),
    valid = validateSequence(sequence).valid;
  const duplicate = state.primers.find((p) => p.id !== primer?.id && p.sequence === normalized);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const timestamp = now();
    const next: Primer = {
      id: primer?.id ?? uid(),
      name: name.trim(),
      sequence: normalized,
      notes,
      sourceFile: primer?.sourceFile ?? null,
      tags: [
        ...new Set(
          tags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean),
        ),
      ],
      orientation,
      projectIds,
      favorite: primer?.favorite ?? false,
      status: primer?.status ?? 'active',
      createdAt: primer?.createdAt ?? timestamp,
      updatedAt: timestamp,
    };
    if (
      await commit(
        (s) => ({
          ...s,
          primers: primer
            ? s.primers.map((p) => (p.id === primer.id ? next : p))
            : [...s.primers, next],
        }),
        'Amorce enregistrée.',
      )
    )
      onClose();
  }
  return (
    <Modal title={primer ? 'Modifier l’amorce' : 'Ajouter une amorce'} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="modal-body">
          <div className="form-grid">
            <label className="field">
              Nom
              <input
                required
                maxLength={200}
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="field">
              Rôle
              <select
                className="select"
                value={orientation}
                onChange={(e) => setOrientation(e.target.value as Primer['orientation'])}
              >
                <option value="other">Non défini</option>
                <option value="forward">Forward</option>
                <option value="reverse">Reverse</option>
              </select>
            </label>
          </div>
          <label className="field">
            Séquence · 5′ → 3′
            <textarea
              className="textarea mono"
              required
              spellCheck={false}
              maxLength={2000}
              rows={3}
              value={sequence}
              onChange={(e) => setSequence(e.target.value)}
            />
          </label>
          {!valid && <p className="form-error">Seul l’alphabet ADN IUPAC est accepté.</p>}
          {duplicate && (
            <p className="form-error">
              Cette séquence existe déjà : {duplicate.name}. Modifie son association aux projets
              pour la réutiliser.
            </p>
          )}
          <label className="field">
            Tags · séparés par des virgules
            <input
              className="input"
              maxLength={1000}
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="Ex. contrôle, collection A"
            />
          </label>
          <label className="field">
            Notes
            <textarea
              className="textarea"
              rows={2}
              maxLength={10000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
          <fieldset className="project-checklist">
            <legend>Projets associés</legend>
            {state.projects.length ? (
              state.projects.map((p) => (
                <label key={p.id} className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={projectIds.includes(p.id)}
                    onChange={(e) =>
                      setProjects((ids) =>
                        e.target.checked ? [...ids, p.id] : ids.filter((id) => id !== p.id),
                      )
                    }
                  />
                  {p.name}
                </label>
              ))
            ) : (
              <span className="muted">Aucun projet. L’amorce restera dans la bibliothèque.</span>
            )}
          </fieldset>
        </div>
        <div className="modal-footer">
          <button type="button" className="button secondary" onClick={onClose}>
            Annuler
          </button>
          <button
            className="button primary"
            disabled={busy || !name.trim() || !normalized || !valid || !!duplicate}
          >
            Enregistrer
          </button>
        </div>
      </form>
    </Modal>
  );
}

interface ImportRow {
  name: string;
  sequence: string;
  notes?: string;
  tags?: string[];
}
export function ImportForm({
  state,
  commit,
  busy,
  onClose,
  kind,
  projectId,
}: { kind: 'sequence' | 'primer'; projectId?: string } & Props) {
  const [rows, setRows] = useState<ImportRow[]>([]),
    [error, setError] = useState(''),
    [fileName, setFileName] = useState(''),
    [project, setProject] = useState(projectId || state.projects[0]?.id || '');
  const existing = new Set(kind === 'primer' ? state.primers.map((p) => p.sequence) : []);
  const seen = new Set<string>();
  const fresh = rows.filter((r) => {
    if (existing.has(r.sequence) || seen.has(r.sequence)) return false;
    seen.add(r.sequence);
    return true;
  });
  async function load(file?: File) {
    setError('');
    setRows([]);
    if (!file) return;
    setFileName(file.name);
    try {
      const text = await readFile(file);
      const parsed =
        kind === 'sequence' || /^\s*>/.test(text) ? parseFasta(text) : parsePrimerCsv(text);
      if (kind === 'primer' && parsed.some((r) => r.sequence.length > 2000))
        throw new Error('Une amorce dépasse 2 000 bases.');
      if (parsed.some((r) => r.name.length > 200))
        throw new Error('Un nom dépasse 200 caractères.');
      setRows(parsed);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function submit() {
    const timestamp = now();
    const imported = kind === 'primer' ? fresh : rows;
    const success = await commit(
      (s) =>
        kind === 'sequence'
          ? {
              ...s,
              sequences: [
                ...s.sequences,
                ...imported.map((r) => ({
                  id: uid(),
                  projectId: project,
                  name: r.name,
                  sequence: r.sequence,
                  notes: r.notes ?? '',
                  topology: 'linear' as const,
                  annotations: [],
                  annotationSources: [],
                  sourceFile: fileName || null,
                  createdAt: timestamp,
                  updatedAt: timestamp,
                })),
              ],
            }
          : {
              ...s,
              primers: [
                ...s.primers,
                ...imported.map((r) => ({
                  id: uid(),
                  name: r.name,
                  sequence: r.sequence,
                  notes: r.notes ?? '',
                  tags: r.tags ?? [],
                  sourceFile: fileName || null,
                  projectIds: project ? [project] : [],
                  orientation: 'other' as const,
                  favorite: false,
                  status: 'active' as const,
                  createdAt: timestamp,
                  updatedAt: timestamp,
                })),
              ],
            },
      imported.length + ' entrée(s) importée(s).',
    );
    if (success) onClose();
  }
  return (
    <Modal
      title={kind === 'sequence' ? 'Importer des séquences FASTA' : 'Importer des amorces'}
      onClose={onClose}
      wide
    >
      <div className="modal-body">
        <label className="file-drop">
          <Icon name="upload" size={28} />
          <strong>Choisir un fichier local</strong>
          <span className="muted">
            {kind === 'sequence' ? 'FASTA (.fa, .fasta, .fna)' : 'CSV, TSV ou FASTA'} · 16 Mo
            maximum
          </span>
          <input
            type="file"
            aria-label="Fichier à importer"
            accept={kind === 'sequence' ? '.fa,.fasta,.fna,.txt' : '.csv,.tsv,.fa,.fasta,.txt'}
            onChange={(e) => void load(e.target.files?.[0])}
          />
        </label>
        {kind === 'primer' && (
          <p className="muted small-text">
            CSV / TSV : colonnes <code>name,sequence,notes,tags</code>. Notes et tags sont
            facultatifs ; séparer les tags par « ; ». Les doublons de séquence sont ignorés.
          </p>
        )}
        <label className="field">
          Projet de destination
          <select className="select" value={project} onChange={(e) => setProject(e.target.value)}>
            {kind === 'primer' && <option value="">Bibliothèque générale</option>}
            {state.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        {error && (
          <div role="alert" className="notice error">
            {error}
          </div>
        )}
        {rows.length > 0 && (
          <>
            <p>
              <strong>{fileName}</strong> · {rows.length} entrée(s)
              {kind === 'primer' && ' · ' + (rows.length - fresh.length) + ' doublon(s) ignoré(s)'}
            </p>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Nom</th>
                    <th>Séquence</th>
                    <th>Longueur</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 5).map((r, i) => (
                    <tr key={i}>
                      <td>{r.name}</td>
                      <td className="mono">
                        {r.sequence.slice(0, 28)}
                        {r.sequence.length > 28 ? '…' : ''}
                      </td>
                      <td>{r.sequence.length} nt</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length > 5 && <p className="muted small-text">Aperçu des 5 premières entrées.</p>}
          </>
        )}
      </div>
      <div className="modal-footer">
        <button className="button secondary" onClick={onClose}>
          Annuler
        </button>
        <button
          className="button primary"
          disabled={
            busy ||
            !rows.length ||
            !!error ||
            (kind === 'sequence' && !project) ||
            (kind === 'primer' && !fresh.length)
          }
          onClick={() => void submit()}
        >
          Importer {kind === 'primer' ? fresh.length : rows.length} entrée(s)
        </button>
      </div>
    </Modal>
  );
}
