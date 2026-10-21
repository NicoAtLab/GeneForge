import type { AnnotationSource, SequenceAnnotation, WorkspaceState } from '../types.ts';
import { exportFasta } from '../core/formats.ts';
import { reverseComplement } from '../core/sequence.ts';
import { date, download, filename, number } from '../lib.ts';
import { Modal } from './Modal.tsx';

export function AnnotationSourceView({
  source,
  annotation,
  target,
  state,
  canNavigate,
  onOpen,
  onClose,
}: {
  source: AnnotationSource;
  annotation: SequenceAnnotation;
  target: string;
  state: WorkspaceState;
  canNavigate: boolean;
  onOpen: (kind: AnnotationSource['kind'], id: string) => void;
  onClose: () => void;
}) {
  const current = (source.kind === 'sequence' ? state.sequences : state.primers).find(
    (s) => s.id === source.recordId,
  );
  const expected = annotation.strand === '-' ? reverseComplement(source.sequence) : source.sequence;
  const stillMatches =
    annotation.start !== null &&
    annotation.end !== null &&
    target.slice(annotation.start - 1, annotation.end) === expected;
  return (
    <Modal title={`Source : ${source.name}`} onClose={onClose} wide>
      <div className="modal-body">
        <p>Copie conservée au moment de l’annotation, le {date(source.capturedAt)}.</p>
        <dl className="source-metadata">
          <dt>Fiche</dt>
          <dd>
            {source.name} · {source.kind === 'primer' ? 'Amorce' : 'Séquence'}
          </dd>
          <dt>Fichier d’origine</dt>
          <dd>{source.fileName || 'Non renseigné (fiche locale ou ancien import)'}</dd>
          <dt>Longueur</dt>
          <dd>{number(source.sequence.length)} nt</dd>
          <dt>Sens trouvé</dt>
          <dd>
            {annotation.strand === 'both'
              ? '+ et − (fragment identique à son complément inverse)'
              : annotation.strand}
          </dd>
          <dt>État actuel</dt>
          <dd>
            {stillMatches
              ? 'La région correspond exactement à la source conservée.'
              : 'La région actuelle ne correspond plus exactement à la source conservée.'}
          </dd>
        </dl>
        {source.notes && <p className="annotation-notes">{source.notes}</p>}
        <pre className="source-sequence">
          {source.sequence.slice(0, 240)}
          {source.sequence.length > 240 ? '…' : ''}
        </pre>
        <p className="muted small-text">
          L’export FASTA contient la séquence source complète conservée. Le nom du fichier d’origine
          est une référence ; son contenu original et son chemin sur le disque ne sont pas archivés.
        </p>
        {current && current.sequence !== source.sequence && (
          <p className="notice warning">
            La fiche d’origine a été modifiée depuis l’annotation. La copie ci-dessus reste
            inchangée.
          </p>
        )}
        {!current && (
          <p className="notice">
            La fiche d’origine a été supprimée. Sa copie reste consultable et exportable ici.
          </p>
        )}
        {!canNavigate && current && (
          <p className="muted small-text">Enregistre la séquence pour ouvrir la fiche d’origine.</p>
        )}
      </div>
      <div className="modal-footer">
        <button
          className="button secondary"
          onClick={() =>
            download(
              exportFasta([{ name: source.name, sequence: source.sequence }]),
              `${filename(source.name)}-source.fasta`,
            )
          }
        >
          Exporter la source FASTA
        </button>
        {current && (
          <button
            className="button primary"
            disabled={!canNavigate}
            onClick={() => {
              onClose();
              onOpen(source.kind, source.recordId);
            }}
          >
            Ouvrir la fiche d’origine
          </button>
        )}
        <button className="button secondary" onClick={onClose}>
          Fermer
        </button>
      </div>
    </Modal>
  );
}
