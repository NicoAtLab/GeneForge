import { useState } from 'react';
import type { Primer } from '../types.ts';
import { OligoAnalyzer } from './OligoAnalyzer.tsx';
import { PairOligoAnalyzer } from './PairOligoAnalyzer.tsx';
export function OligoWorkspace({
  initialSequence = '',
  primers,
  onSave,
}: {
  initialSequence?: string;
  primers: Primer[];
  onSave: (s: string) => void;
}) {
  const [pair, setPair] = useState(false);
  return (
    <>
      <div className="oligo-mode" aria-label="Mode d’analyse">
        <button
          className={'button ' + (!pair ? 'primary' : 'secondary')}
          aria-pressed={!pair}
          onClick={() => setPair(false)}
        >
          Un oligo
        </button>
        <button
          className={'button ' + (pair ? 'primary' : 'secondary')}
          aria-pressed={pair}
          onClick={() => setPair(true)}
        >
          Paire d’oligos
        </button>
      </div>
      {pair ? (
        <PairOligoAnalyzer initialSequence={initialSequence} primers={primers} onSave={onSave} />
      ) : (
        <OligoAnalyzer initialSequence={initialSequence} onSave={onSave} />
      )}
    </>
  );
}
