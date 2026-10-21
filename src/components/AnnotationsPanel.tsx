import { useState } from 'react';
import type { AnnotationSource, SequenceAnnotation, WorkspaceState } from '../types.ts';
import { roleLabels } from '../core/automaticAnnotations.ts';
import { AnnotationSourceView } from './AnnotationSourceView.tsx';
import { highlightColors } from '../preferences.ts';
import { uid } from '../lib.ts';
import { Modal } from './Modal.tsx';

export function AnnotationsPanel({
  annotations,
  length,
  selection,
  onChange,
  onSelect,
  sources,
  state,
  target,
  canNavigate,
  onOpenSource,
}: {
  annotations: SequenceAnnotation[];
  length: number;
  selection: { start: number; end: number };
  onChange: (annotations: SequenceAnnotation[]) => void;
  onSelect: (start: number, end: number) => void;
  sources: AnnotationSource[];
  state: WorkspaceState;
  target: string;
  canNavigate: boolean;
  onOpenSource: (kind: AnnotationSource['kind'], id: string) => void;
}) {
  const [editing, setEditing] = useState<SequenceAnnotation | null>(null);
  const [filter, setFilter] = useState('');
  const [sourceAnnotation, setSourceAnnotation] = useState<SequenceAnnotation | null>(null);
  const openedSource = sources.find((s) => s.id === sourceAnnotation?.sourceId);
  const selected = selection.end > selection.start;
  const valid =
    editing &&
    editing.name.trim() &&
    editing.start !== null &&
    editing.end !== null &&
    Number.isInteger(editing.start) &&
    Number.isInteger(editing.end) &&
    editing.start >= 1 &&
    editing.end >= editing.start &&
    editing.end <= length;
  return (
    <section
      id="sequence-annotations"
      className="panel annotation-panel"
      aria-label="Annotations de la séquence"
    >
      <div className="panel-heading">
        <h3>
          Annotations <span className="tag">{annotations.length}</span>
        </h3>
        <button
          className="button small primary"
          disabled={!selected || annotations.length >= 2000}
          onClick={() =>
            setEditing({
              id: uid(),
              name: '',
              start: selection.start + 1,
              end: selection.end,
              color: highlightColors[0].value,
              notes: '',
              needsReview: false,
              role: 'region',
              strand: null,
              sourceId: null,
            })
          }
        >
          Surligner la sélection
        </button>
      </div>
      <div className="panel-body">
        <p className="muted small-text">
          Sélectionne une région, choisis une couleur et ajoute tes informations. Les annotations
          peuvent se chevaucher. Enregistre la séquence pour les conserver.
        </p>
        {annotations.length > 3 && (
          <input
            className="input"
            aria-label="Filtrer les annotations"
            placeholder="Chercher dans les annotations…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        )}
        {!annotations.length && <p className="muted">Aucune région annotée pour le moment.</p>}
        {annotations
          .filter((a) =>
            `${a.name} ${a.notes} ${roleLabels[a.role]} ${sources.find((s) => s.id === a.sourceId)?.fileName ?? ''}`
              .toLocaleLowerCase()
              .includes(filter.toLocaleLowerCase()),
          )
          .map((a) => (
            <article className="annotation-card" key={a.id} style={{ borderLeftColor: a.color }}>
              <div className="annotation-title">
                <button
                  className="text-link"
                  disabled={a.start === null}
                  onClick={() => {
                    if (a.start !== null && a.end !== null) onSelect(a.start - 1, a.end);
                  }}
                >
                  {a.name}
                </button>
                <span className="tag">
                  {a.start === null ? 'Région supprimée' : `${a.start}–${a.end}`}
                </span>
                {a.needsReview && <span className="review-badge">À vérifier</span>}
                <span className="tag">
                  {roleLabels[a.role]}
                  {a.strand ? ` · ${a.strand === 'both' ? '±' : a.strand}` : ''}
                </span>
              </div>
              {a.sourceId && (
                <button className="source-link" onClick={() => setSourceAnnotation(a)}>
                  Source : {sources.find((s) => s.id === a.sourceId)?.name ?? 'Source conservée'}
                </button>
              )}
              {a.notes && <p className="annotation-notes">{a.notes}</p>}
              {a.needsReview && (
                <p className="muted small-text">
                  Le texte de cette région a changé. Vérifie ses coordonnées et ses informations.
                </p>
              )}
              <div className="toolbar">
                <button className="button small secondary" onClick={() => setEditing({ ...a })}>
                  Modifier {a.name}
                </button>
                <button
                  className="button small ghost"
                  onClick={() => {
                    if (window.confirm(`Supprimer l’annotation « ${a.name} » ?`))
                      onChange(annotations.filter((item) => item.id !== a.id));
                  }}
                >
                  Supprimer {a.name}
                </button>
              </div>
            </article>
          ))}
      </div>
      {openedSource && sourceAnnotation && (
        <AnnotationSourceView
          source={openedSource}
          annotation={sourceAnnotation}
          target={target}
          state={state}
          canNavigate={canNavigate}
          onOpen={onOpenSource}
          onClose={() => setSourceAnnotation(null)}
        />
      )}
      {editing && (
        <Modal
          title={
            annotations.some((a) => a.id === editing.id)
              ? 'Modifier l’annotation'
              : 'Surligner une région'
          }
          onClose={() => setEditing(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!valid) return;
              const saved = { ...editing, name: editing.name.trim(), needsReview: false };
              onChange(
                annotations.some((a) => a.id === saved.id)
                  ? annotations.map((a) => (a.id === saved.id ? saved : a))
                  : [...annotations, saved],
              );
              setEditing(null);
            }}
          >
            <div className="modal-body">
              <label className="field">
                Nom de l’annotation
                <input
                  className="input"
                  required
                  autoFocus
                  maxLength={200}
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                />
              </label>
              <label className="field">
                Catégorie de l’annotation
                <select
                  className="select"
                  value={editing.role}
                  onChange={(e) =>
                    setEditing({ ...editing, role: e.target.value as SequenceAnnotation['role'] })
                  }
                >
                  {Object.entries(roleLabels).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="form-grid">
                <label className="field">
                  Début de l’annotation
                  <input
                    className="input"
                    type="number"
                    required
                    min={1}
                    max={length}
                    value={editing.start ?? ''}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        start: e.target.value === '' ? null : Number(e.target.value),
                      })
                    }
                  />
                </label>
                <label className="field">
                  Fin de l’annotation
                  <input
                    className="input"
                    type="number"
                    required
                    min={editing.start ?? 1}
                    max={length}
                    value={editing.end ?? ''}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        end: e.target.value === '' ? null : Number(e.target.value),
                      })
                    }
                  />
                </label>
              </div>
              <p className="muted small-text">Coordonnées à partir de 1, bornes incluses.</p>
              {selected && (
                <button
                  type="button"
                  className="button small secondary"
                  onClick={() =>
                    setEditing({ ...editing, start: selection.start + 1, end: selection.end })
                  }
                >
                  Utiliser la sélection actuelle
                </button>
              )}
              <fieldset className="highlight-picker">
                <legend>Couleur du surligneur</legend>
                {highlightColors.map((color) => (
                  <label key={color.value} style={{ background: color.value }}>
                    <input
                      type="radio"
                      name="highlight-color"
                      value={color.value}
                      checked={editing.color === color.value}
                      onChange={() => setEditing({ ...editing, color: color.value })}
                    />
                    {color.label}
                  </label>
                ))}
              </fieldset>
              <label className="field">
                Informations de l’annotation
                <textarea
                  className="textarea"
                  rows={4}
                  maxLength={20000}
                  value={editing.notes}
                  placeholder="Description, provenance, observations…"
                  onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
                />
              </label>
              {editing.needsReview && (
                <p className="notice warning">
                  Valider confirmera que tu as vérifié cette annotation.
                </p>
              )}
            </div>
            <div className="modal-footer">
              <button type="button" className="button secondary" onClick={() => setEditing(null)}>
                Annuler
              </button>
              <button className="button primary" disabled={!valid}>
                Valider l’annotation
              </button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}
