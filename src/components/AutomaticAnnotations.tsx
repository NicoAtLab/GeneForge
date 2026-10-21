import { useEffect, useMemo, useRef, useState } from 'react';
import type { AnnotationSource, SequenceAnnotation, WorkspaceState } from '../types.ts';
import type { SearchResult } from '../core/search.ts';
import { naturalNames } from '../core/ordering.ts';
import { createAutomaticAnnotations, roleLabels } from '../core/automaticAnnotations.ts';
import type { SourceChoice } from '../core/automaticAnnotations.ts';
import { runSequenceSearch } from '../sequenceSearch.ts';
import { now, number, uid } from '../lib.ts';

export function AutomaticAnnotations({
  state,
  targetId,
  target,
  annotations,
  sources,
  onApply,
  onSelect,
  notify,
}: {
  state: WorkspaceState;
  targetId: string;
  target: string;
  annotations: SequenceAnnotation[];
  sources: AnnotationSource[];
  onApply: (annotations: SequenceAnnotation[], sources: AnnotationSource[]) => void;
  onSelect: (start: number, end: number) => void;
  notify: (message: string) => void;
}) {
  const [expanded, setExpanded] = useState(false),
    [kind, setKind] = useState<'sequence' | 'primer'>('sequence');
  const [filter, setFilter] = useState(''),
    [selected, setSelected] = useState<Record<string, SequenceAnnotation['role']>>({});
  const [both, setBoth] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [results, setResults] = useState<{ key: string; result: SearchResult }[] | null>(null);
  const controller = useRef<AbortController | null>(null);
  const available = useMemo<SourceChoice[]>(
    () => [
      ...state.sequences
        .filter((s) => s.id !== targetId && s.sequence.length)
        .map((s) => ({
          key: `sequence:${s.id}`,
          kind: 'sequence' as const,
          recordId: s.id,
          name: s.name,
          sequence: s.sequence,
          notes: s.notes,
          fileName: s.sourceFile,
          role: 'fragment' as const,
        })),
      ...state.primers
        .filter((p) => p.status === 'active')
        .sort(naturalNames)
        .map((p) => ({
          key: `primer:${p.id}`,
          kind: 'primer' as const,
          recordId: p.id,
          name: p.name,
          sequence: p.sequence,
          notes: p.notes,
          fileName: p.sourceFile,
          role: 'primer' as const,
        })),
    ],
    [state.sequences, state.primers, targetId],
  );
  const choices = useMemo(
    () => available.filter((s) => selected[s.key]).map((s) => ({ ...s, role: selected[s.key] })),
    [available, selected],
  );
  const shown = available.filter(
    (s) =>
      s.kind === kind &&
      `${s.name} ${s.fileName ?? ''}`.toLocaleLowerCase().includes(filter.toLocaleLowerCase()),
  );
  useEffect(() => {
    controller.current?.abort();
    setResults(null);
    setError('');
    setBusy(false);
  }, [choices, target, both]);
  useEffect(() => () => controller.current?.abort(), []);
  function toggle(source: SourceChoice, enabled: boolean) {
    if (enabled && choices.length >= 200) {
      notify('Choisis au plus 200 sources par analyse.');
      return;
    }
    setSelected((previous) => {
      const next = { ...previous };
      if (enabled) next[source.key] = source.role;
      else delete next[source.key];
      return next;
    });
  }
  async function analyze() {
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setBusy(true);
    setError('');
    setResults(null);
    try {
      const response = await runSequenceSearch(
        {
          target,
          queries: choices.map((c) => ({ key: c.key, sequence: c.sequence })),
          bothStrands: both,
          limit: 2000,
        },
        request.signal,
      );
      if (!request.signal.aborted) setResults(response.results);
    } catch (e) {
      if (!request.signal.aborted) setError((e as Error).message);
    } finally {
      if (!request.signal.aborted) setBusy(false);
    }
  }
  const total = results?.reduce((sum, r) => sum + r.result.total, 0) ?? 0;
  const truncated = results?.some((r) => r.result.truncated) ?? false;
  return (
    <section className="panel automatic-panel" aria-label="Annotation automatique">
      <div className="panel-heading">
        <h3>Annotation automatique</h3>
        <button
          className="button small secondary"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? 'Replier' : 'Choisir des fragments ou amorces'}
        </button>
      </div>
      {expanded && (
        <div className="panel-body">
          <p className="muted">
            Retrouve des séquences déjà présentes dans tes projets et ta bibliothèque. Chaque
            correspondance conserve une copie de sa source et un lien vers sa fiche.
          </p>
          <fieldset disabled={busy} className="automatic-controls">
            <div className="form-grid">
              <label className="field">
                Sources à afficher
                <select
                  className="select"
                  value={kind}
                  onChange={(e) => setKind(e.target.value as typeof kind)}
                >
                  <option value="sequence">Fragments des projets</option>
                  <option value="primer">Amorces actives</option>
                </select>
              </label>
              <label className="field">
                Filtrer les sources
                <input
                  className="input"
                  placeholder="Nom ou fichier d’origine"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                />
              </label>
            </div>
            <div className="toolbar">
              <button
                className="button small secondary"
                onClick={() =>
                  setSelected((previous) => {
                    const next = { ...previous };
                    for (const source of shown.slice(0, 100)) {
                      if (Object.keys(next).length >= 200) break;
                      if (!next[source.key]) next[source.key] = source.role;
                    }
                    return next;
                  })
                }
              >
                Sélectionner les sources affichées
              </button>
              <button
                className="button small ghost"
                disabled={!choices.length}
                onClick={() => setSelected({})}
              >
                Retirer toutes les sources
              </button>
            </div>
            <div className="source-picker">
              {shown.slice(0, 100).map((source) => (
                <label className="source-choice" key={source.key}>
                  <input
                    type="checkbox"
                    aria-label={`Choisir ${source.name}`}
                    checked={Boolean(selected[source.key])}
                    onChange={(e) => toggle(source, e.target.checked)}
                  />
                  <span>
                    <strong>{source.name}</strong>
                    <small>
                      {number(source.sequence.length)} nt
                      {source.fileName ? ` · ${source.fileName}` : ''}
                    </small>
                  </span>
                </label>
              ))}
              {!shown.length && (
                <p className="muted">
                  Aucune source disponible. Importe les fragments FASTA dans un projet ou les
                  amorces dans leur bibliothèque.
                </p>
              )}
            </div>
            {shown.length > 100 && (
              <p className="muted small-text">
                100 sources affichées sur {number(shown.length)}. Utilise le filtre pour trouver les
                autres.
              </p>
            )}
            <h4>Sources choisies · {choices.length} / 200</h4>
            <div className="chosen-sources">
              {choices.map((source) => (
                <div className="chosen-source" key={source.key}>
                  <span>{source.name}</span>
                  <select
                    className="select"
                    aria-label={`Catégorie de ${source.name}`}
                    value={source.role}
                    onChange={(e) =>
                      setSelected({
                        ...selected,
                        [source.key]: e.target.value as SequenceAnnotation['role'],
                      })
                    }
                  >
                    {(['up', 'down', 'primer', 'fragment'] as const).map((role) => (
                      <option key={role} value={role}>
                        {roleLabels[role]}
                      </option>
                    ))}
                  </select>
                  <button
                    className="button small ghost"
                    aria-label={`Retirer ${source.name}`}
                    onClick={() => toggle(source, false)}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <label className="checkbox-label">
              <input type="checkbox" checked={both} onChange={(e) => setBoth(e.target.checked)} />
              Rechercher les deux sens (complément inverse inclus)
            </label>
            <p className="muted small-text">
              Correspondance exacte du fragment entier, lettres IUPAC littérales. Up et Down sont
              des catégories choisies ; le sens +/− est déterminé par la correspondance.
            </p>
            <button
              className="button primary"
              disabled={!choices.length || !target.length}
              onClick={() => void analyze()}
            >
              Analyser les sources choisies
            </button>
          </fieldset>
          {busy && (
            <div className="toolbar">
              <span role="status">Analyse locale en cours…</span>
              <button
                className="button secondary"
                onClick={() => {
                  controller.current?.abort();
                  setBusy(false);
                }}
              >
                Annuler l’analyse
              </button>
            </div>
          )}
          {error && (
            <p className="notice error" role="alert">
              {error}
            </p>
          )}
          {results && (
            <div className="auto-preview">
              <h4>Aperçu · {number(total)} correspondance(s)</h4>
              {results.map(({ key, result }) => {
                const source = choices.find((c) => c.key === key);
                if (!source) return null;
                return (
                  <div className="auto-result" key={key}>
                    <strong>
                      {roleLabels[source.role]} · {source.name}
                    </strong>
                    <span className={result.total ? 'tag' : 'muted'}>
                      {result.total ? `${number(result.total)} trouvé(s)` : 'Absent'}
                    </span>
                    <div className="match-list">
                      {result.matches.slice(0, 20).map((match) => (
                        <button
                          key={`${match.start}-${match.strand}`}
                          className="position-link"
                          onClick={() => onSelect(match.start - 1, match.end)}
                        >
                          {match.start}–{match.end} ({match.strand === 'both' ? '±' : match.strand})
                        </button>
                      ))}
                    </div>
                    {result.total > 20 && (
                      <small className="muted">
                        20 positions affichées au maximum ; toutes les correspondances seront
                        ajoutées si l’aperçu est complet.
                      </small>
                    )}
                  </div>
                );
              })}
              {truncated && (
                <p className="notice warning">
                  Plus de 2 000 correspondances : aperçu limité. Choisis moins de sources ou des
                  fragments plus longs avant d’annoter.
                </p>
              )}
              <button
                className="button primary"
                disabled={!total || truncated}
                onClick={() => {
                  try {
                    const next = createAutomaticAnnotations(
                      annotations,
                      sources,
                      choices,
                      results,
                      uid,
                      now(),
                    );
                    if (next.added) onApply(next.annotations, next.annotationSources);
                    notify(
                      `${next.added} annotation(s) ajoutée(s), ${next.skipped} doublon(s) ignoré(s). Enregistre la séquence pour les conserver.`,
                    );
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                Ajouter les annotations trouvées
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
