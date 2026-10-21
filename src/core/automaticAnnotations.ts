import type { AnnotationSource, SequenceAnnotation } from '../types.ts';
import type { SearchResult } from './search.ts';

export interface SourceChoice {
  key: string;
  kind: AnnotationSource['kind'];
  recordId: string;
  name: string;
  sequence: string;
  notes: string;
  fileName: string | null;
  role: SequenceAnnotation['role'];
}
export const roleLabels = {
  region: 'Région',
  up: 'Up',
  down: 'Down',
  primer: 'Amorce',
  fragment: 'Fragment',
};
export const roleColors = {
  region: '#f4ca64',
  up: '#79bdfa',
  down: '#c4a2ef',
  primer: '#f4ca64',
  fragment: '#7ed6a5',
};

export function createAutomaticAnnotations(
  annotations: SequenceAnnotation[],
  sources: AnnotationSource[],
  choices: SourceChoice[],
  results: { key: string; result: SearchResult }[],
  makeId: () => string,
  capturedAt: string,
) {
  const nextAnnotations = [...annotations],
    nextSources = [...sources];
  let skipped = 0;
  for (const { key, result } of results) {
    const choice = choices.find((c) => c.key === key);
    if (!choice || result.queryLength !== choice.sequence.length || result.truncated)
      throw new Error('L’aperçu est incomplet ou a changé. Relance l’analyse.');
    if (!result.matches.length) continue;
    let source = nextSources.find(
      (s) =>
        s.kind === choice.kind && s.recordId === choice.recordId && s.sequence === choice.sequence,
    );
    if (!source) {
      source = {
        id: makeId(),
        kind: choice.kind,
        recordId: choice.recordId,
        name: choice.name,
        fileName: choice.fileName,
        sequence: choice.sequence,
        notes: choice.notes,
        capturedAt,
      };
      nextSources.push(source);
    }
    for (const match of result.matches) {
      if (
        nextAnnotations.some(
          (a) =>
            a.sourceId === source.id &&
            a.start === match.start &&
            a.end === match.end &&
            a.strand === match.strand &&
            a.role === choice.role &&
            !a.needsReview,
        )
      ) {
        skipped++;
        continue;
      }
      nextAnnotations.push({
        id: makeId(),
        name: `${roleLabels[choice.role]} · ${choice.name}`.slice(0, 200),
        start: match.start,
        end: match.end,
        color: roleColors[choice.role],
        notes: '',
        needsReview: false,
        role: choice.role,
        strand: match.strand,
        sourceId: source.id,
      });
    }
  }
  if (nextAnnotations.length > 2000)
    throw new Error(
      'La limite de 2 000 annotations serait dépassée. Réduis la sélection de sources.',
    );
  return {
    annotations: nextAnnotations,
    annotationSources: nextSources,
    added: nextAnnotations.length - annotations.length,
    skipped,
  };
}
