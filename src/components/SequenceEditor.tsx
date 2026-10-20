import { useEffect, useMemo, useRef, useState } from 'react';
import type { SequenceRecord, WorkspaceState } from '../types.ts';
import {
  complement,
  findMotifs,
  normalizeSequence,
  reverseComplement,
  sequenceStats,
  validateSequence,
} from '../core/sequence.ts';
import { exportFasta } from '../core/formats.ts';
import { date, download, filename, now, number, percent } from '../lib.ts';
import type { Commit } from '../lib.ts';
import { Icon } from './Icon.tsx';
import { Bases, Composition, Heading } from './Common.tsx';

export function SequenceEditor({
  record,
  state,
  commit,
  busy,
  setDirty,
  notify,
  onBack,
}: {
  record: SequenceRecord;
  state: WorkspaceState;
  commit: Commit;
  busy: boolean;
  setDirty: (dirty: boolean) => void;
  notify: (message: string) => void;
  onBack: () => void;
}) {
  const [draft, setDraft] = useState(record),
    [history, setHistory] = useState<string[]>([]),
    [future, setFuture] = useState<string[]>([]);
  const [motif, setMotif] = useState(''),
    [selection, setSelection] = useState({ start: 0, end: 0 }),
    [page, setPage] = useState(0),
    [view, setView] = useState<'edit' | 'colored'>('edit');
  const inputRef = useRef<HTMLTextAreaElement>(null),
    searchRef = useRef<HTMLInputElement>(null);
  const normalized = useMemo(() => normalizeSequence(draft.sequence), [draft.sequence]);
  const validation = useMemo(() => validateSequence(draft.sequence), [draft.sequence]);
  const stats = useMemo(
    () => (validation.valid ? sequenceStats(normalized) : null),
    [normalized, validation.valid],
  );
  const dirty = JSON.stringify(draft) !== JSON.stringify(record);
  useEffect(() => {
    setDirty(dirty);
    return () => setDirty(false);
  }, [dirty, setDirty]);
  function changeSequence(value: string) {
    setHistory((h) => [...h.slice(-29), draft.sequence]);
    setFuture([]);
    setDraft((d) => ({ ...d, sequence: value }));
  }
  function undo() {
    if (!history.length) return;
    setFuture((f) => [draft.sequence, ...f]);
    setDraft((d) => ({ ...d, sequence: history[history.length - 1] }));
    setHistory((h) => h.slice(0, -1));
  }
  function redo() {
    if (!future.length) return;
    setHistory((h) => [...h, draft.sequence]);
    setDraft((d) => ({ ...d, sequence: future[0] }));
    setFuture((f) => f.slice(1));
  }
  async function save() {
    if (!validation.valid || !draft.name.trim()) return;
    const saved = { ...draft, name: draft.name.trim(), sequence: normalized, updatedAt: now() };
    if (
      await commit(
        (s) => ({ ...s, sequences: s.sequences.map((r) => (r.id === record.id ? saved : r)) }),
        'Séquence enregistrée.',
      )
    )
      setDraft(saved);
  }
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void save();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });
  const hits = useMemo(() => {
    try {
      return motif.trim() ? findMotifs(normalized, motif) : [];
    } catch {
      return [];
    }
  }, [normalized, motif]);
  const bpl = state.settings.basesPerLine;
  const pageSize = bpl * 12,
    totalPages = Math.max(1, Math.ceil(normalized.length / pageSize));
  const visiblePage = Math.min(page, totalPages - 1),
    part = normalized.slice(visiblePage * pageSize, (visiblePage + 1) * pageSize);
  const rows = Array.from({ length: Math.ceil(part.length / bpl) }, (_, i) => ({
    position: visiblePage * pageSize + i * bpl + 1,
    text: part.slice(i * bpl, (i + 1) * bpl),
  }));
  function selectedSequence() {
    return selection.end > selection.start
      ? normalizeSequence(draft.sequence.slice(selection.start, selection.end))
      : normalized;
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(selectedSequence());
      notify('Séquence copiée.');
    } catch {
      notify('Copie indisponible. Sélectionne le texte et utilise Ctrl+C.');
    }
  }
  const selectionStart = normalizeSequence(draft.sequence.slice(0, selection.start)).length + 1;
  const selectionLength = normalizeSequence(
    draft.sequence.slice(selection.start, selection.end),
  ).length;
  return (
    <>
      <Heading
        eyebrow={state.projects.find((p) => p.id === record.projectId)?.name || 'Séquences'}
        title={record.name}
        actions={
          <>
            <button className="button secondary" onClick={onBack}>
              <Icon name="arrow-left" />
              Bibliothèque
            </button>
            <button
              className="button primary"
              disabled={busy || !dirty || !validation.valid || !draft.name.trim()}
              onClick={() => void save()}
            >
              <Icon name="save" />
              {busy ? 'Enregistrement…' : 'Enregistrer'}
              <kbd>Ctrl S</kbd>
            </button>
          </>
        }
      >
        Édition ADN ·{' '}
        {dirty ? 'Modifications non enregistrées' : `Enregistrée le ${date(record.updatedAt)}`}
      </Heading>
      <div className="editor-layout">
        <div className="editor-main">
          <div className="panel">
            <div className="toolbar">
              <div className="tabs">
                <button
                  className={`tab ${view === 'edit' ? 'active' : ''}`}
                  onClick={() => setView('edit')}
                >
                  Édition
                </button>
                <button
                  className={`tab ${view === 'colored' ? 'active' : ''}`}
                  onClick={() => setView('colored')}
                >
                  Vue colorée
                </button>
              </div>
              <div className="history-actions">
                <button
                  className="button icon-button ghost"
                  disabled={!history.length}
                  title="Annuler la dernière modification"
                  aria-label="Annuler"
                  onClick={undo}
                >
                  <Icon name="undo" />
                </button>
                <button
                  className="button icon-button ghost"
                  disabled={!future.length}
                  aria-label="Rétablir"
                  onClick={redo}
                >
                  <Icon name="redo" />
                </button>
              </div>
            </div>
            <div className="panel-body">
              <div className="form-grid">
                <label className="field">
                  Nom
                  <input
                    className="input"
                    value={draft.name}
                    maxLength={200}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  />
                </label>
                <label className="field">
                  Topologie
                  <select
                    className="select"
                    value={draft.topology}
                    onChange={(e) =>
                      setDraft({ ...draft, topology: e.target.value as SequenceRecord['topology'] })
                    }
                  >
                    <option value="linear">Linéaire</option>
                    <option value="circular">Circulaire</option>
                  </select>
                </label>
              </div>
              <div className="sequence-label">
                <span>
                  BRIN SENS <span className="muted">5′ → 3′</span>
                </span>
                <span className="muted">ADN · IUPAC</span>
              </div>
              {view === 'edit' ? (
                <textarea
                  className="sequence-input"
                  ref={inputRef}
                  aria-label="Séquence ADN"
                  value={draft.sequence}
                  spellCheck={false}
                  maxLength={1_000_000}
                  onChange={(e) => changeSequence(e.target.value)}
                  onSelect={(e) =>
                    setSelection({
                      start: e.currentTarget.selectionStart,
                      end: e.currentTarget.selectionEnd,
                    })
                  }
                  placeholder="Saisir ou coller une séquence ADN…"
                />
              ) : (
                <div className="sequence-view">
                  {rows.length ? (
                    rows.map((row) => (
                      <div className="sequence-row" key={row.position}>
                        <span className="row-position">{number(row.position)}</span>
                        <span className="base-group">
                          <Bases sequence={row.text} />
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="muted">Cette séquence est vide.</p>
                  )}
                  <div className="toolbar">
                    <button
                      className="button small secondary"
                      disabled={visiblePage === 0}
                      onClick={() => setPage(visiblePage - 1)}
                    >
                      Précédent
                    </button>
                    <span className="muted">
                      Page {visiblePage + 1} / {totalPages}
                    </span>
                    <button
                      className="button small secondary"
                      disabled={visiblePage + 1 >= totalPages}
                      onClick={() => setPage(visiblePage + 1)}
                    >
                      Suivant
                    </button>
                  </div>
                </div>
              )}
              {!validation.valid && (
                <div className="notice error" role="alert">
                  Caractères invalides :{' '}
                  {validation.invalid
                    .slice(0, 8)
                    .map((x) => `${x.character} (position ${x.position})`)
                    .join(', ')}
                  . Alphabet ADN IUPAC attendu.
                </div>
              )}
              <div className="toolbar">
                <button
                  className="button small secondary"
                  onClick={copy}
                  disabled={!validation.valid}
                >
                  <Icon name="copy" />
                  Copier {selectionLength ? 'la sélection' : ''}
                </button>
                <button
                  className="button small secondary"
                  disabled={!validation.valid}
                  onClick={() => {
                    void navigator.clipboard
                      .writeText(complement(normalized))
                      .then(() => notify('Complément copié (3′ → 5′).'))
                      .catch(() => notify('Copie indisponible.'));
                  }}
                >
                  Copier le complément
                </button>
                <button
                  className="button small secondary"
                  disabled={!validation.valid}
                  onClick={() => changeSequence(reverseComplement(normalized))}
                >
                  Complément inverse
                </button>
              </div>
              <label className="field">
                Rechercher un motif exact
                <input
                  className="input mono"
                  ref={searchRef}
                  placeholder="Ex. ACGT"
                  value={motif}
                  onChange={(e) => setMotif(e.target.value.toUpperCase())}
                />
              </label>
              {motif && (
                <p className="muted">
                  {hits.length} occurrence(s)
                  {hits.length > 0 && (
                    <>
                      {' '}
                      · positions :{' '}
                      {hits.slice(0, 20).map((pos, i) => (
                        <button
                          key={pos}
                          className="position-link"
                          onClick={() => {
                            setView('edit');
                            setTimeout(() => {
                              inputRef.current?.focus();
                              if (draft.sequence !== normalized) {
                                changeSequence(normalized);
                              }
                              setTimeout(
                                () =>
                                  inputRef.current?.setSelectionRange(
                                    pos - 1,
                                    pos - 1 + normalizeSequence(motif).length,
                                  ),
                                0,
                              );
                            }, 0);
                          }}
                        >
                          {pos}
                          {i < Math.min(19, hits.length - 1) ? ', ' : ''}
                        </button>
                      ))}
                      {hits.length > 20 ? '…' : ''}
                    </>
                  )}{' '}
                  · Recherche littérale, sans traversée de l’origine.
                </p>
              )}
              <label className="field">
                Notes
                <textarea
                  className="textarea"
                  rows={3}
                  value={draft.notes}
                  maxLength={10000}
                  onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                  placeholder="Provenance, remarques et contexte de la séquence"
                />
              </label>
            </div>
          </div>
        </div>
        <aside className="inspector">
          <div className="panel">
            <div className="panel-heading">
              <h3>Propriétés</h3>
              <Icon name="dna" />
            </div>
            <div className="panel-body">
              <div className="metric">
                <span>Longueur</span>
                <strong>
                  {number(normalized.length)} <small>nt</small>
                </strong>
              </div>
              <div className="metric">
                <span>Teneur en GC</span>
                <strong>{percent(stats?.gc ?? null)}</strong>
              </div>
              <div className="metric">
                <span>Teneur en AT</span>
                <strong>{percent(stats?.at ?? null)}</strong>
              </div>
              <div className="metric">
                <span>Bases ambiguës</span>
                <strong>{stats?.ambiguous ?? '—'}</strong>
              </div>
              <div className="metric">
                <span>Topologie</span>
                <span className="tag">
                  {draft.topology === 'linear' ? 'Linéaire' : 'Circulaire'}
                </span>
              </div>
            </div>
          </div>
          <div className="panel">
            <div className="panel-heading">
              <h3>Composition</h3>
            </div>
            <div className="panel-body">
              {validation.valid && <Composition sequence={normalized} />}
            </div>
          </div>
          <div className="panel">
            <div className="panel-heading">
              <h3>Sélection</h3>
            </div>
            <div className="panel-body">
              <p>
                {selectionLength
                  ? `${selectionStart}–${selectionStart + selectionLength - 1} · ${selectionLength} nt`
                  : 'Sélectionne des bases dans l’éditeur.'}
              </p>
              <p className="muted small-text">Coordonnées à partir de 1, bornes incluses.</p>
            </div>
          </div>
          <button
            className="button secondary"
            disabled={!validation.valid || !normalized.length}
            onClick={() =>
              download(
                exportFasta([{ name: draft.name, sequence: normalized }]),
                `${filename(draft.name)}.fasta`,
              )
            }
          >
            <Icon name="download" />
            Exporter FASTA
          </button>
        </aside>
      </div>
    </>
  );
}
