import type { WorkspaceState } from '../types.ts';
export interface ContextChoice {
  kind: 'note' | 'gel' | 'primer' | 'sequence' | 'project';
  id: string;
}
export function assistantContext(state: WorkspaceState, choices: ContextChoice[]) {
  if (choices.length > 12) throw new Error('Choisis au plus 12 sources.');
  const sources = choices.map((choice, index) => {
    const id = `S${index + 1}`;
    if (choice.kind === 'note') {
      const n = state.notes.find((n) => n.id === choice.id);
      if (!n) throw new Error('Note source absente.');
      return {
        id,
        name: n.name,
        kind: choice.kind,
        recordId: n.id,
        data: {
          text: n.body,
          fileReferences: n.fileReferences,
          elabUrl: n.elabUrl,
          gelIds: n.gelIds,
        },
      };
    }
    if (choice.kind === 'gel') {
      const g = state.gels.find((g) => g.id === choice.id);
      if (!g) throw new Error('Gel source absent.');
      return {
        id,
        name: g.name,
        kind: choice.kind,
        recordId: g.id,
        data: {
          notes: g.notes,
          file: g.image.fileName,
          sha256: g.image.sha256,
          crop: g.crop,
          polarity: g.polarity,
          lanes: g.lanes.map((l, i) => ({
            number: i + 1,
            label: l.label,
            description: l.description,
            primers: l.primers,
          })),
          bands: g.bands,
          elabUrl: g.elabUrl,
        },
      };
    }
    if (choice.kind === 'primer') {
      const p = state.primers.find((p) => p.id === choice.id);
      if (!p) throw new Error('Amorce source absente.');
      return {
        id,
        name: p.name,
        kind: choice.kind,
        recordId: p.id,
        data: {
          sequence: p.sequence,
          orientation: p.orientation,
          notes: p.notes,
          sourceFile: p.sourceFile,
        },
      };
    }
    if (choice.kind === 'sequence') {
      const s = state.sequences.find((s) => s.id === choice.id);
      if (!s) throw new Error('Séquence source absente.');
      // Metadata-only: sending a megabase is both unnecessary and unexpectedly expensive.
      return {
        id,
        name: s.name,
        kind: choice.kind,
        recordId: s.id,
        data: {
          length: s.sequence.length,
          notes: s.notes,
          annotations: s.annotations,
          sourceFile: s.sourceFile,
          sequenceIncluded: false,
        },
      };
    }
    const p = state.projects.find((p) => p.id === choice.id);
    if (!p) throw new Error('Projet source absent.');
    return {
      id,
      name: p.name,
      kind: choice.kind,
      recordId: p.id,
      data: { description: p.description },
    };
  });
  const text = JSON.stringify(sources, null, 2);
  if (text.length > 80_000)
    throw new Error('Ce contexte dépasse 80 000 caractères. Choisis moins de sources.');
  return { sources, text };
}
