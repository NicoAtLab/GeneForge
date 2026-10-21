import { useEffect, useMemo, useRef, useState } from 'react';
import type { AnnotationSource, SequenceRecord, WorkspaceState } from '../types.ts';
import { remapAnnotations, reverseAnnotations } from '../core/annotations.ts';
import type { EditRange } from '../core/annotations.ts';
import {
  complement,
  normalizeSequence,
  reverseComplement,
  sequenceStats,
  validateSequence,
} from '../core/sequence.ts';
import { exportFasta } from '../core/formats.ts';
import { date, download, filename, now, number, percent } from '../lib.ts';
import type { Commit } from '../lib.ts';
import { Icon } from './Icon.tsx';
import { Composition, Heading } from './Common.tsx';
import { AnnotationsPanel } from './AnnotationsPanel.tsx';
import { AutomaticAnnotations } from './AutomaticAnnotations.tsx';
import { SequenceSearch } from './SequenceSearch.tsx';
import type { SequenceMatch } from '../core/search.ts';

type Snapshot = Pick<SequenceRecord, 'sequence' | 'annotations' | 'annotationSources'>;

export function SequenceEditor({
  record,
  state,
  commit,
  busy,
  setDirty,
  notify,
  onBack,
  onOpenSource,
}: {
  record: SequenceRecord;
  state: WorkspaceState;
  commit: Commit;
  busy: boolean;
  setDirty: (dirty: boolean) => void;
  notify: (message: string) => void;
  onBack: () => void;
  onOpenSource: (kind: AnnotationSource['kind'], id: string) => void;
}) {
  const [draft, setDraft] = useState(record),
    [history, setHistory] = useState<Snapshot[]>([]),
    [future, setFuture] = useState<Snapshot[]>([]);
  const [searchMatches, setSearchMatches] = useState<SequenceMatch[]>([]);
  const [selection, setSelection] = useState({ start: 0, end: 0 }),
    [view, setView] = useState<'edit' | 'colored'>(state.settings.defaultSequenceView);
  const [scrollTop, setScrollTop] = useState(0),
    [viewportHeight, setViewportHeight] = useState(460);
  const [zoom, setZoom] = useState(state.settings.sequenceFontSize),
    [bpl, setBpl] = useState(state.settings.basesPerLine);
  const [pendingPosition, setPendingPosition] = useState<{ index: number; top?: boolean } | null>(
    null,
  );
  const viewportRef = useRef<HTMLDivElement>(null);
  const [rangeStart, setRangeStart] = useState('1'),
    [rangeEnd, setRangeEnd] = useState('1');
  const inputRef = useRef<HTMLTextAreaElement>(null),
    searchRef = useRef<HTMLTextAreaElement>(null);
  const editHint = useRef<EditRange | undefined>(undefined);
  const dragAnchor = useRef<number | null>(null),
    keyboardAnchor = useRef(0),
    cursor = useRef(0);
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
  function changeSnapshot(next: Snapshot) {
    setHistory((h) => [
      ...h.slice(-29),
      {
        sequence: draft.sequence,
        annotations: draft.annotations,
        annotationSources: draft.annotationSources,
      },
    ]);
    setFuture([]);
    setDraft((d) => ({ ...d, ...next }));
  }
  function changeSequence(value: string) {
    const next = normalizeSequence(value);
    changeSnapshot({
      sequence: value,
      annotations: remapAnnotations(draft.annotations, normalized, next, editHint.current),
      annotationSources: draft.annotationSources,
    });
    editHint.current = undefined;
    setSelection({ start: 0, end: 0 });
  }
  function undo() {
    if (!history.length) return;
    setFuture((f) => [
      {
        sequence: draft.sequence,
        annotations: draft.annotations,
        annotationSources: draft.annotationSources,
      },
      ...f,
    ]);
    setDraft((d) => ({ ...d, ...history[history.length - 1] }));
    setHistory((h) => h.slice(0, -1));
    setSelection({ start: 0, end: 0 });
  }
  function redo() {
    if (!future.length) return;
    setHistory((h) => [
      ...h,
      {
        sequence: draft.sequence,
        annotations: draft.annotations,
        annotationSources: draft.annotationSources,
      },
    ]);
    setDraft((d) => ({ ...d, ...future[0] }));
    setFuture((f) => f.slice(1));
    setSelection({ start: 0, end: 0 });
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
      setDraft((current) =>
        current === draft ? saved : { ...current, updatedAt: saved.updatedAt },
      );
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
  useEffect(() => {
    const stop = () => {
      dragAnchor.current = null;
    };
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    window.addEventListener('blur', stop);
    return () => {
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
      window.removeEventListener('blur', stop);
    };
  }, []);
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const capture = (event: InputEvent) => {
      let start = input.selectionStart,
        end = input.selectionEnd;
      if (start === end && event.inputType === 'deleteContentBackward')
        start = Math.max(0, start - 1);
      if (start === end && event.inputType === 'deleteContentForward') end++;
      editHint.current = {
        start: normalizeSequence(input.value.slice(0, start)).length,
        end: normalizeSequence(input.value.slice(0, end)).length,
      };
    };
    input.addEventListener('beforeinput', capture);
    return () => input.removeEventListener('beforeinput', capture);
  }, [view]);
  const rowHeight = Math.ceil(zoom * 1.8) + 6;
  const totalRows = Math.ceil(normalized.length / bpl);
  const firstRow = Math.max(0, Math.min(totalRows - 1, Math.floor(scrollTop / rowHeight)) - 4);
  const endRow = Math.min(totalRows, firstRow + Math.ceil(viewportHeight / rowHeight) + 9);
  const visibleStart = firstRow * bpl,
    visibleEnd = Math.min(normalized.length, endRow * bpl);
  const pageSize = Math.max(0, visibleEnd - visibleStart),
    part = normalized.slice(visibleStart, visibleEnd);
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setViewportHeight(el.clientHeight));
    observer.observe(el);
    setViewportHeight(el.clientHeight);
    setScrollTop(el.scrollTop);
    return () => observer.disconnect();
  }, [view]);
  useEffect(() => {
    const el = viewportRef.current;
    if (!el || !pendingPosition) return;
    const offset = Math.floor(pendingPosition.index / bpl) * rowHeight;
    if (
      pendingPosition.top ||
      offset < el.scrollTop ||
      offset + rowHeight > el.scrollTop + el.clientHeight
    ) {
      el.scrollTop = Math.max(0, offset - (pendingPosition.top ? 0 : rowHeight * 2));
      setScrollTop(el.scrollTop);
    }
  }, [view, pendingPosition, bpl, rowHeight]);
  function changeZoom(next: number) {
    setPendingPosition({ index: Math.floor(scrollTop / rowHeight) * bpl, top: true });
    setZoom(Math.max(8, Math.min(22, next)));
  }
  const searchMask = useMemo(() => {
    const mask = new Uint8Array(pageSize);
    const offset = visibleStart;
    for (const match of searchMatches) {
      const start = Math.max(0, match.start - 1 - offset),
        end = Math.min(pageSize, match.end - offset);
      if (start < end) mask.fill(1, start, end);
    }
    return mask;
  }, [searchMatches, visibleStart, pageSize]);
  const rows = Array.from({ length: Math.ceil(part.length / bpl) }, (_, i) => ({
    position: visibleStart + i * bpl + 1,
    text: part.slice(i * bpl, (i + 1) * bpl),
  }));
  function selectedSequence() {
    return selection.end > selection.start
      ? normalized.slice(selection.start, selection.end)
      : normalized;
  }
  function chooseRange(start: number, end: number) {
    if (start < 0 || end <= start || end > normalized.length) return;
    setSelection({ start, end });
    setRangeStart(String(start + 1));
    setRangeEnd(String(end));
    setPendingPosition({ index: start });
    setView('colored');
    keyboardAnchor.current = start;
    cursor.current = end - 1;
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(selectedSequence());
      notify('Séquence copiée.');
    } catch {
      notify('Copie indisponible. Sélectionne le texte et utilise Ctrl+C.');
    }
  }
  const selectionStart = selection.start + 1;
  const selectionLength = selection.end - selection.start;
  const selectedText = normalized.slice(selection.start, selection.end);
  const selectedValid = selectionLength > 0 && validateSequence(selectedText).valid;
  useEffect(() => {
    if (selection.end > selection.start) {
      setRangeStart(String(selection.start + 1));
      setRangeEnd(String(selection.end));
    }
  }, [selection.start, selection.end]);
  const positions = useMemo(() => {
    const result = new Map<number, typeof draft.annotations>();
    for (const a of draft.annotations) {
      if (a.start === null || a.end === null) continue;
      for (let i = Math.max(a.start - 1, visibleStart); i < Math.min(a.end, visibleEnd); i++) {
        const entries = result.get(i);
        if (entries) entries.push(a);
        else result.set(i, [a]);
      }
    }
    return result;
  }, [draft.annotations, visibleStart, visibleEnd]);
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
              <SequenceSearch
                target={normalized}
                inputRef={searchRef}
                onHighlights={setSearchMatches}
                onSelect={chooseRange}
              />
              <div className="sequence-label">
                <span>
                  BRIN SENS <span className="muted">5′ → 3′</span>
                </span>
                <span className="muted">ADN · IUPAC</span>
              </div>
              <div className="sequence-zoom-toolbar">
                <button
                  className="button small secondary"
                  aria-label="Dézoomer la séquence"
                  disabled={zoom <= 8}
                  onClick={() => changeZoom(zoom - 1)}
                >
                  −
                </button>
                <label>
                  Zoom de la séquence
                  <input
                    aria-label="Zoom de la séquence"
                    type="range"
                    min={8}
                    max={22}
                    value={zoom}
                    onChange={(e) => changeZoom(Number(e.target.value))}
                  />
                </label>
                <button
                  className="button small secondary"
                  aria-label="Zoomer la séquence"
                  disabled={zoom >= 22}
                  onClick={() => changeZoom(zoom + 1)}
                >
                  +
                </button>
                <span className="tag">{zoom} px</span>
                <label>
                  Bases par ligne
                  <select
                    className="select"
                    aria-label="Bases par ligne de la séquence"
                    value={bpl}
                    onChange={(e) => {
                      setPendingPosition({
                        index: Math.floor(scrollTop / rowHeight) * bpl,
                        top: true,
                      });
                      setBpl(Number(e.target.value));
                    }}
                  >
                    {[10, 30, 40, 60, 80, 100, 120, 180, 240].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {view === 'edit' ? (
                <textarea
                  className="sequence-input"
                  style={{ fontSize: zoom }}
                  ref={inputRef}
                  aria-label="Séquence ADN"
                  value={draft.sequence}
                  spellCheck={false}
                  maxLength={1_000_000}
                  onKeyDown={(e) => {
                    if (!(e.ctrlKey || e.metaKey)) return;
                    if (e.key.toLowerCase() === 'z') {
                      e.preventDefault();
                      e.shiftKey ? redo() : undo();
                    }
                    if (e.key.toLowerCase() === 'y') {
                      e.preventDefault();
                      redo();
                    }
                  }}
                  onChange={(e) => changeSequence(e.target.value)}
                  onSelect={(e) =>
                    setSelection({
                      start: normalizeSequence(
                        draft.sequence.slice(0, e.currentTarget.selectionStart),
                      ).length,
                      end: normalizeSequence(draft.sequence.slice(0, e.currentTarget.selectionEnd))
                        .length,
                    })
                  }
                  placeholder="Saisir ou coller une séquence ADN…"
                />
              ) : (
                <div className="sequence-view">
                  <p className="muted small-text">
                    Glisse sur les bases pour sélectionner une région. Au clavier : flèches pour te
                    déplacer, Maj + flèches pour étendre.
                  </p>
                  <div
                    className="selectable-sequence continuous-sequence"
                    ref={viewportRef}
                    style={
                      {
                        '--sequence-font-size': zoom + 'px',
                        height: Math.min(460, Math.max(120, totalRows * rowHeight + 4)),
                      } as React.CSSProperties
                    }
                    onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
                    data-visible-start={visibleStart}
                    tabIndex={0}
                    role="textbox"
                    aria-label="Séquence colorée sélectionnable"
                    aria-readonly="true"
                    aria-multiline="true"
                    onCopy={(e) => {
                      e.preventDefault();
                      e.clipboardData.setData('text/plain', selectedSequence());
                    }}
                    onPointerDown={(e) => {
                      const cell = (e.target as HTMLElement).closest<HTMLElement>(
                        '[data-base-index]',
                      );
                      if (!cell || e.button !== 0) return;
                      e.preventDefault();
                      e.currentTarget.focus({ preventScroll: true });
                      const index = Number(cell.dataset.baseIndex);
                      if (!e.shiftKey) keyboardAnchor.current = index;
                      dragAnchor.current = keyboardAnchor.current;
                      cursor.current = index;
                      setSelection({
                        start: Math.min(dragAnchor.current, index),
                        end: Math.max(dragAnchor.current, index) + 1,
                      });
                    }}
                    onPointerMove={(e) => {
                      if (dragAnchor.current === null) return;
                      const cell = (e.target as HTMLElement).closest<HTMLElement>(
                        '[data-base-index]',
                      );
                      if (!cell) return;
                      const index = Number(cell.dataset.baseIndex);
                      cursor.current = index;
                      setSelection({
                        start: Math.min(dragAnchor.current, index),
                        end: Math.max(dragAnchor.current, index) + 1,
                      });
                    }}
                    onKeyDown={(e) => {
                      if (!normalized.length) return;
                      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
                        e.preventDefault();
                        setSelection({ start: 0, end: normalized.length });
                        return;
                      }
                      const moves: Record<string, number> = {
                        ArrowLeft: -1,
                        ArrowRight: 1,
                        ArrowUp: -bpl,
                        ArrowDown: bpl,
                      };
                      if (!(e.key in moves)) return;
                      e.preventDefault();
                      const index = Math.max(
                        0,
                        Math.min(normalized.length - 1, cursor.current + moves[e.key]),
                      );
                      if (!e.shiftKey) keyboardAnchor.current = index;
                      cursor.current = index;
                      setSelection({
                        start: Math.min(keyboardAnchor.current, index),
                        end: Math.max(keyboardAnchor.current, index) + 1,
                      });
                      setPendingPosition({ index });
                    }}
                  >
                    <div
                      className="sequence-scrollspace"
                      style={{
                        height: Math.max(rowHeight, totalRows * rowHeight),
                        minWidth:
                          76 +
                          zoom *
                            (0.72 * bpl +
                              (state.settings.groupBases ? 0.7 * Math.floor((bpl - 1) / 10) : 0)),
                      }}
                    >
                      {rows.length ? (
                        rows.map((row) => (
                          <div
                            className="sequence-row"
                            key={row.position}
                            style={{
                              position: 'absolute',
                              top: Math.floor((row.position - 1) / bpl) * rowHeight,
                              height: rowHeight,
                            }}
                          >
                            <span className="row-position">{number(row.position)}</span>
                            <span className="base-group">
                              {row.text.split('').map((base, i) => {
                                const index = row.position - 1 + i;
                                const annotations = positions.get(index) ?? [];
                                const colors = [...new Set(annotations.map((a) => a.color))].slice(
                                  0,
                                  8,
                                );
                                const background =
                                  colors.length > 1
                                    ? `linear-gradient(to bottom, ${colors.map((color, n) => `${color} ${(n * 100) / colors.length}% ${((n + 1) * 100) / colors.length}%`).join(', ')})`
                                    : colors[0];
                                return (
                                  <span
                                    key={index}
                                    data-base-index={index}
                                    className={`nucleotide base-${'ATGC'.includes(base) ? base.toLowerCase() : 'n'} ${annotations.length ? 'annotated-base' : ''} ${searchMask[index - visibleStart] ? 'search-hit' : ''} ${index >= selection.start && index < selection.end ? 'selected-base' : ''} ${state.settings.groupBases && i > 0 && i % 10 === 0 ? 'base-spacer' : ''}`}
                                    style={background ? { background } : undefined}
                                    title={[
                                      `${index + 1} · ${base}`,
                                      ...annotations
                                        .slice(0, 8)
                                        .map(
                                          (a) =>
                                            `${a.name} (${a.start}–${a.end})${a.needsReview ? ' · À vérifier' : ''}${a.notes ? '\n' + a.notes : ''}`,
                                        ),
                                      ...(annotations.length > 8
                                        ? [
                                            `Et ${annotations.length - 8} autres annotations, listées ci-dessous.`,
                                          ]
                                        : []),
                                    ].join('\n')}
                                  >
                                    {base}
                                  </span>
                                );
                              })}
                            </span>
                          </div>
                        ))
                      ) : (
                        <p className="muted">Cette séquence est vide.</p>
                      )}
                    </div>
                  </div>
                  <p className="muted small-text continuous-status">
                    Une seule vue · défilement à la molette · {number(normalized.length)} bases
                  </p>
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
              {selectedValid && (
                <div className="selection-summary" aria-live="polite">
                  <strong>
                    {selectionStart}–{selection.end} · {number(selectionLength)} nt
                  </strong>
                  <span>{percent((100 * selectionLength) / normalized.length)} du total</span>
                  <span>GC {percent(sequenceStats(selectedText).gc)}</span>
                  <a href="#sequence-annotations">Annoter cette région ↓</a>
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
                  onClick={() => {
                    changeSnapshot({
                      sequence: reverseComplement(normalized),
                      annotations: reverseAnnotations(draft.annotations, normalized.length),
                      annotationSources: draft.annotationSources,
                    });
                    setSelection({ start: 0, end: 0 });
                  }}
                >
                  Complément inverse
                </button>
              </div>
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
          {validation.valid && (
            <AutomaticAnnotations
              state={state}
              targetId={draft.id}
              target={normalized}
              annotations={draft.annotations}
              sources={draft.annotationSources}
              onSelect={chooseRange}
              notify={notify}
              onApply={(annotations, annotationSources) => {
                changeSnapshot({ sequence: draft.sequence, annotations, annotationSources });
                setView('colored');
              }}
            />
          )}
          {validation.valid && (
            <AnnotationsPanel
              annotations={draft.annotations}
              length={normalized.length}
              selection={selection}
              onSelect={chooseRange}
              onChange={(annotations) =>
                changeSnapshot({
                  sequence: draft.sequence,
                  annotations,
                  annotationSources: draft.annotationSources.filter((s) =>
                    annotations.some((a) => a.sourceId === s.id),
                  ),
                })
              }
              sources={draft.annotationSources}
              state={state}
              target={normalized}
              canNavigate={!dirty}
              onOpenSource={onOpenSource}
            />
          )}
        </div>
        <aside className="inspector">
          <div className="panel selection-panel" aria-label="Statistiques de la sélection">
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
              {selectedValid && (
                <>
                  <div className="metric">
                    <span>Part de la séquence</span>
                    <strong>{percent((100 * selectionLength) / normalized.length)}</strong>
                  </div>
                  <Composition sequence={selectedText} />
                </>
              )}
              {selectionLength > 0 && !selectedValid && (
                <p className="notice warning">La sélection contient des caractères invalides.</p>
              )}
              <form
                className="range-selector"
                onSubmit={(e) => {
                  e.preventDefault();
                  chooseRange(Number(rangeStart) - 1, Number(rangeEnd));
                }}
              >
                <label className="field">
                  Début de sélection
                  <input
                    className="input"
                    type="number"
                    min={1}
                    max={normalized.length}
                    required
                    value={rangeStart}
                    onChange={(e) => setRangeStart(e.target.value)}
                  />
                </label>
                <label className="field">
                  Fin de sélection
                  <input
                    className="input"
                    type="number"
                    min={Number(rangeStart) || 1}
                    max={normalized.length}
                    required
                    value={rangeEnd}
                    onChange={(e) => setRangeEnd(e.target.value)}
                  />
                </label>

                <button className="button small secondary" disabled={!normalized.length}>
                  Sélectionner la région
                </button>
              </form>
            </div>
          </div>
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
          <p className="muted small-text">
            FASTA conserve les bases. La sauvegarde complète conserve aussi les annotations et les
            notes.
          </p>
        </aside>
      </div>
    </>
  );
}
