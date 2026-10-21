import { useEffect, useRef, useState } from 'react';
import type { WorkNote, WorkspaceState } from '../types.ts';
import { date, now, uid, download, filename } from '../lib.ts';
import type { Commit } from '../lib.ts';
import { ELAB_URL, safeWebUrl } from '../core/gels.ts';
import { copyReport, gelFigure, noteText } from '../gelFiles.ts';
import { Heading, Empty } from './Common.tsx';
import { ReportView } from './ReportView.tsx';
import type { Report } from './ReportView.tsx';

export function NotesPage({
  state,
  commit,
  busy,
  setDirty,
  notify,
  onOpenGel,
  initialId,
}: {
  state: WorkspaceState;
  commit: Commit;
  busy: boolean;
  setDirty: (v: boolean) => void;
  notify: (s: string) => void;
  onOpenGel: (id: string) => void;
  initialId: string | null;
}) {
  const initial = state.notes.find((n) => n.id === initialId) ?? null;
  const [draft, setDraft] = useState<WorkNote | null>(initial),
    [filter, setFilter] = useState(''),
    [report, setReport] = useState<Report | null>(null);
  const baseline = useRef(JSON.stringify(initial));
  const dirty = !!draft && JSON.stringify(draft) !== baseline.current;
  useEffect(() => {
    setDirty(dirty);
    return () => setDirty(false);
  }, [dirty, setDirty]);
  function open(note: WorkNote | null) {
    if (dirty && !confirm('Abandonner les modifications de cette note ?')) return;
    baseline.current = JSON.stringify(note);
    setDraft(note);
  }
  function create() {
    const time = now();
    const note: WorkNote = {
      id: uid(),
      name: 'Nouvelle note',
      body: '',
      projectId: null,
      elabUrl: ELAB_URL,
      fileReferences: '',
      gelIds: [],
      createdAt: time,
      updatedAt: time,
    };
    open(note);
    baseline.current = '';
    setDirty(true);
  }
  async function save() {
    if (!draft || !draft.name.trim() || !safeWebUrl(draft.elabUrl)) return;
    const next = { ...draft, name: draft.name.trim(), updatedAt: now() };
    if (
      await commit(
        (s) => ({
          ...s,
          notes: s.notes.some((n) => n.id === next.id)
            ? s.notes.map((n) => (n.id === next.id ? next : n))
            : [...s.notes, next],
        }),
        'Note enregistrée.',
      )
    ) {
      baseline.current = JSON.stringify(next);
      setDraft(next);
      setDirty(false);
    }
  }
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void saveRef.current();
      }
    }
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  async function pdf() {
    if (!draft) return;
    try {
      const gels = state.gels.filter((g) => draft.gelIds.includes(g.id));
      const figures = await Promise.all(
        gels.map(async (g) => ({ name: g.name, url: await gelFigure(g) })),
      );
      setReport({
        title: draft.name,
        text: noteText(draft, state).slice(draft.name.length).trimStart(),
        figures,
      });
    } catch (e) {
      notify((e as Error).message);
    }
  }
  return (
    <>
      <Heading
        eyebrow="Écrire, relier, partager"
        title="Notes"
        actions={
          <button className="button primary" onClick={create}>
            Nouvelle note
          </button>
        }
      >
        Prépare tes observations et tes comptes rendus, puis copie-les dans e-Lab.
      </Heading>
      <div className="lab-split">
        <aside className="panel lab-browser">
          <label className="field">
            Rechercher une note
            <input className="input" value={filter} onChange={(e) => setFilter(e.target.value)} />
          </label>
          {state.notes
            .filter((n) =>
              (n.name + ' ' + n.body).toLocaleLowerCase().includes(filter.toLocaleLowerCase()),
            )
            .map((n) => (
              <button
                className={`lab-item ${draft?.id === n.id ? 'active' : ''}`}
                key={n.id}
                onClick={() => open(n)}
              >
                <strong>{n.name}</strong>
                <small>
                  {date(n.updatedAt)} · {n.gelIds.length} gel(s)
                </small>
              </button>
            ))}
          <a className="button secondary" href={ELAB_URL} target="_blank" rel="noreferrer">
            Ouvrir e-Lab LIPME ↗
          </a>
        </aside>
        {draft ? (
          <section className="panel lab-editor">
            <div className="toolbar lab-actions">
              <button
                className="button primary"
                disabled={busy || !draft.name.trim() || !safeWebUrl(draft.elabUrl)}
                onClick={() => void save()}
              >
                Enregistrer la note
              </button>
              <button
                className="button secondary"
                onClick={() =>
                  void copyReport(noteText(draft, state))
                    .then(() => notify('Note copiée : colle-la dans e-Lab.'))
                    .catch(() => notify('Copie indisponible. Utilise l’export texte.'))
                }
              >
                Copier pour e-Lab
              </button>
              <button className="button secondary" onClick={() => void pdf()}>
                Exporter PDF
              </button>
              <button
                className="button ghost"
                onClick={() => download(noteText(draft, state), `${filename(draft.name)}.txt`)}
              >
                Texte
              </button>
            </div>
            <label className="field">
              Titre de la note
              <input
                className="input"
                maxLength={200}
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </label>
            <label className="field">
              Projet de la note
              <select
                className="select"
                value={draft.projectId ?? ''}
                onChange={(e) => setDraft({ ...draft, projectId: e.target.value || null })}
              >
                <option value="">Sans projet</option>
                {state.projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Contenu de la note
              <textarea
                className="textarea note-body"
                maxLength={100000}
                value={draft.body}
                onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                placeholder="Objectif, observations, résultats, prochaines étapes…"
              />
            </label>
            <div className="form-grid">
              <label className="field">
                Lien vers l’entrée e-Lab
                <input
                  type="url"
                  className="input"
                  maxLength={2000}
                  value={draft.elabUrl}
                  onChange={(e) => setDraft({ ...draft, elabUrl: e.target.value })}
                />
                {!safeWebUrl(draft.elabUrl) && (
                  <small className="form-error">Lien HTTP ou HTTPS requis.</small>
                )}
              </label>
              <label className="field">
                Références de fichiers sur serveur
                <textarea
                  className="textarea"
                  maxLength={20000}
                  value={draft.fileReferences}
                  onChange={(e) => setDraft({ ...draft, fileReferences: e.target.value })}
                  placeholder="Chemins ou noms de fichiers de collection…"
                />
              </label>
            </div>
            <p className="muted small-text">
              Les références restent du texte à copier. Les fichiers du serveur ne sont pas importés
              ni modifiés.
            </p>
            <h3>Gels liés à cette note</h3>
            <div className="note-gel-links">
              {state.gels.map((g) => (
                <label className="checkbox-label" key={g.id}>
                  <input
                    type="checkbox"
                    checked={draft.gelIds.includes(g.id)}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        gelIds: e.target.checked
                          ? [...draft.gelIds, g.id]
                          : draft.gelIds.filter((id) => id !== g.id),
                      })
                    }
                  />
                  {g.name}
                </label>
              ))}
              {!state.gels.length && (
                <p className="muted">Importe une image dans Gels pour la joindre ici.</p>
              )}
              {draft.gelIds.map((id) => {
                const gel = state.gels.find((g) => g.id === id);
                return gel ? (
                  <button key={id} className="source-link" onClick={() => onOpenGel(id)}>
                    Ouvrir {gel.name} →
                  </button>
                ) : (
                  <p key={id} className="muted">
                    Gel supprimé : {id}
                  </p>
                );
              })}
            </div>
            <div className="toolbar">
              {draft.elabUrl && safeWebUrl(draft.elabUrl) && (
                <a
                  href={draft.elabUrl}
                  className="button secondary"
                  target="_blank"
                  rel="noreferrer"
                >
                  Ouvrir l’entrée e-Lab ↗
                </a>
              )}
              <button
                className="button danger"
                disabled={busy}
                onClick={async () => {
                  if (!confirm('Supprimer cette note ?')) return;
                  if (
                    await commit(
                      (s) => ({ ...s, notes: s.notes.filter((n) => n.id !== draft.id) }),
                      'Note supprimée.',
                    )
                  ) {
                    setDraft(null);
                    baseline.current = '';
                    setDirty(false);
                  }
                }}
              >
                Supprimer la note
              </button>
              <span className="muted small-text">
                {dirty ? 'Modifications non enregistrées · Ctrl+S' : 'Note enregistrée localement'}
              </span>
            </div>
          </section>
        ) : (
          <Empty
            title="Un espace pour tes notes"
            icon="file"
            action={
              <button className="button primary" onClick={create}>
                Écrire une note
              </button>
            }
          >
            Observations, liens e-Lab et figures de gels au même endroit.
          </Empty>
        )}
      </div>
      {report && <ReportView report={report} onClose={() => setReport(null)} />}
    </>
  );
}
