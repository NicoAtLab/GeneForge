import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { SearchResult, SequenceMatch } from '../core/search.ts';
import { runSequenceSearch } from '../sequenceSearch.ts';
import { number } from '../lib.ts';

export function SequenceSearch({
  target,
  inputRef,
  onHighlights,
  onSelect,
}: {
  target: string;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  onHighlights: (matches: SequenceMatch[]) => void;
  onSelect: (start: number, end: number) => void;
}) {
  const [query, setQuery] = useState(''),
    [both, setBoth] = useState(false);
  const [result, setResult] = useState<SearchResult | null>(null),
    [error, setError] = useState('');
  const [busy, setBusy] = useState(false),
    [current, setCurrent] = useState(0);
  const callbacks = useRef({ onHighlights, onSelect });
  const previousQuery = useRef({ query: '', both: false });
  callbacks.current = { onHighlights, onSelect };
  useEffect(() => {
    const navigate = query !== previousQuery.current.query || both !== previousQuery.current.both;
    previousQuery.current = { query, both };
    const controller = new AbortController();
    setResult(null);
    setError('');
    setCurrent(0);
    callbacks.current.onHighlights([]);
    setBusy(Boolean(query.trim()));
    if (!query.trim()) return () => controller.abort();
    const timer = setTimeout(() => {
      void runSequenceSearch(
        { target, queries: [{ key: 'search', sequence: query }], bothStrands: both, limit: 5000 },
        controller.signal,
      )
        .then(({ results }) => {
          if (controller.signal.aborted) return;
          const found = results[0].result;
          setResult(found);
          callbacks.current.onHighlights(found.matches);
          if (found.matches[0] && navigate)
            callbacks.current.onSelect(found.matches[0].start - 1, found.matches[0].end);
        })
        .catch((e) => {
          if (!controller.signal.aborted) setError(e.message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setBusy(false);
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [target, query, both]);
  function jump(index: number) {
    if (!result?.matches.length) return;
    const next = (index + result.matches.length) % result.matches.length;
    const match = result.matches[next];
    setCurrent(next);
    onSelect(match.start - 1, match.end);
  }
  return (
    <section className="sequence-search" aria-label="Recherche dans la séquence">
      <label className="field">
        Rechercher dans cette séquence
        <textarea
          className="textarea mono"
          ref={inputRef}
          rows={2}
          maxLength={2_000_000}
          placeholder="Colle la séquence à retrouver, courte ou longue…"
          value={query}
          spellCheck={false}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <div className="toolbar search-options">
        <label className="checkbox-label">
          <input type="checkbox" checked={both} onChange={(e) => setBoth(e.target.checked)} />
          Chercher aussi le complément inverse
        </label>
        {query && (
          <button className="button small ghost" onClick={() => setQuery('')}>
            Effacer la recherche
          </button>
        )}
      </div>
      <p className="muted small-text">
        Correspondance exacte du fragment entier. Espaces et casse ignorés. Les lettres IUPAC sont
        comparées littéralement. Sans traversée de l’origine.
      </p>
      <div role="status" aria-live="polite">
        {busy && <p className="muted">Recherche en cours…</p>}
        {error && <p className="notice error">{error}</p>}
        {result &&
          (result.total ? (
            <div className="search-results">
              <strong>
                Trouvé : {number(result.total)} occurrence(s) · fragment de{' '}
                {number(result.queryLength)} nt
              </strong>
              <div className="toolbar">
                <button className="button small secondary" onClick={() => jump(current - 1)}>
                  Occurrence précédente
                </button>
                <span>
                  {current + 1} / {result.matches.length}
                </span>
                <button className="button small secondary" onClick={() => jump(current + 1)}>
                  Occurrence suivante
                </button>
              </div>
              <div className="match-list">
                {result.matches
                  .slice(Math.floor(current / 20) * 20, Math.floor(current / 20) * 20 + 20)
                  .map((match, index) => (
                    <button
                      key={`${match.start}-${match.strand}`}
                      className="position-link"
                      aria-current={
                        current === Math.floor(current / 20) * 20 + index ? 'true' : undefined
                      }
                      onClick={() => jump(Math.floor(current / 20) * 20 + index)}
                    >
                      {match.start}–{match.end} ({match.strand === 'both' ? '±' : match.strand})
                    </button>
                  ))}
              </div>
              {result.truncated && (
                <p className="notice warning">
                  Le total est complet ; seuls les 5 000 premiers résultats collectés sont affichés
                  et surlignés. Précise la séquence recherchée pour réduire ce nombre.
                </p>
              )}
            </div>
          ) : (
            <p className="notice">Aucune correspondance exacte dans cette séquence.</p>
          ))}
      </div>
    </section>
  );
}
