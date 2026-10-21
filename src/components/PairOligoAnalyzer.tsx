import { useState } from 'react';
import type { Primer } from '../types.ts';
import { api, download, number, percent } from '../lib.ts';
import { normalizeSequence, sequenceStats, validateSequence } from '../core/sequence.ts';
import { naturalNames } from '../core/ordering.ts';
import { Heading, Composition } from './Common.tsx';

interface PairResult {
  first: { tm: number };
  second: { tm: number };
  deltaTm: number;
  heterodimer: {
    structureFound: boolean;
    tm: number | null;
    dgCalMol: number | null;
    structure: string | null;
  };
  temperature: number;
  maxLoop: number;
  engine: string;
  version: string;
  parameters: Record<string, number>;
}
export function PairOligoAnalyzer({
  primers,
  onSave,
  initialSequence,
}: {
  primers: Primer[];
  onSave: (s: string) => void;
  initialSequence: string;
}) {
  const [sequences, setSequences] = useState([initialSequence, '']),
    [params, setParams] = useState({
      mv_conc: 50,
      dv_conc: 1.5,
      dntp_conc: 0.6,
      dna_conc: 50,
      temp_c: 37,
    });
  const [result, setResult] = useState<PairResult | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const normalized = sequences.map(normalizeSequence),
    valid = normalized.map((s) => validateSequence(s).valid);
  const stats = normalized.map((s, i) => (valid[i] && s.length ? sequenceStats(s) : null));
  const choices = primers.filter((p) => p.status === 'active').sort(naturalNames);
  function change(index: number, value: string) {
    setSequences((s) => s.map((v, i) => (i === index ? value : v)));
    setResult(null);
    setError('');
  }
  async function calculate() {
    setBusy(true);
    setResult(null);
    setError('');
    try {
      setResult(
        await api<PairResult>('/api/analyze-pair', {
          method: 'POST',
          body: JSON.stringify({ sequence1: normalized[0], sequence2: normalized[1], ...params }),
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const canCalculate =
    normalized.every((s) => /^[ACGT]{2,60}$/.test(s)) &&
    normalized.some((s) => s.length < 60) &&
    Object.values(params).every(Number.isFinite) &&
    params.dna_conc > 0;
  return (
    <>
      <Heading eyebrow="Deux amorces · conditions communes" title="Analyser une paire d’oligos">
        Compare les Tm et calcule l’interaction entre les deux séquences avec Primer3.
      </Heading>
      <div className="pair-inputs">
        {sequences.map((sequence, i) => (
          <section className="panel" key={i}>
            <div className="panel-heading">
              <h3>
                Oligo {i + 1}
                {i === 0 ? ' · Forward' : ' · Reverse'}
              </h3>
              <span className="tag">5′ → 3′</span>
            </div>
            <div className="panel-body">
              <label className="field">
                Depuis la bibliothèque
                <select
                  className="select"
                  aria-label={'Choisir l’oligo ' + (i + 1)}
                  value=""
                  disabled={busy}
                  onChange={(e) => {
                    const p = choices.find((p) => p.id === e.target.value);
                    if (p) change(i, p.sequence);
                  }}
                >
                  <option value="">Choisir une amorce…</option>
                  {choices.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Séquence de l’oligo {i + 1}
                <textarea
                  className="sequence-input oligo-input"
                  aria-label={'Séquence de l’oligo ' + (i + 1)}
                  maxLength={2000}
                  disabled={busy}
                  spellCheck={false}
                  value={sequence}
                  onChange={(e) => change(i, e.target.value)}
                />
              </label>
              {!valid[i] && <p className="notice error">ADN IUPAC invalide.</p>}
              <p className="pair-composition">
                {number(normalized[i].length)} nt · GC {percent(stats[i]?.gc ?? null)}
              </p>
              {stats[i] && <Composition sequence={normalized[i]} />}
              <button
                className="button small secondary"
                disabled={!stats[i]}
                onClick={() => onSave(normalized[i])}
              >
                Enregistrer l’oligo {i + 1}
              </button>
            </div>
          </section>
        ))}
      </div>
      <section className="panel pair-conditions">
        <div className="panel-heading">
          <h3>Conditions communes de calcul</h3>
          <span className="tag">Moteur local</span>
        </div>
        <div className="panel-body">
          <div className="pair-parameters">
            {(
              [
                ['mv_conc', 'Ions monovalents (mM)', 0, 1000],
                ['dv_conc', 'Mg²⁺ (mM)', 0, 100],
                ['dntp_conc', 'dNTP (mM)', 0, 100],
                ['dna_conc', 'Oligonucléotides (nM)', 0.01, 100000],
                ['temp_c', 'Température pour ΔG (°C)', 0, 100],
              ] as const
            ).map(([k, label, min, max]) => (
              <label className="field" key={k}>
                {label}
                <input
                  className="input"
                  type="number"
                  min={min}
                  max={max}
                  step="any"
                  disabled={busy}
                  value={Number.isFinite(params[k]) ? params[k] : ''}
                  onChange={(e) => {
                    setParams({ ...params, [k]: e.target.valueAsNumber });
                    setResult(null);
                  }}
                />
              </label>
            ))}
          </div>
          <button
            className="button primary"
            disabled={busy || !canCalculate}
            onClick={() => void calculate()}
          >
            {busy ? 'Calcul de la paire…' : 'Analyser la paire avec Primer3'}
          </button>
          <p className="muted small-text">
            Deux séquences A/C/G/T de 2 à 60 bases, saisies chacune en 5′→3′, dont au moins une de
            moins de 60 bases. Ne complémente pas manuellement l’amorce Reverse.
          </p>
          {error && (
            <p role="alert" className="notice error">
              {error}
            </p>
          )}
        </div>
      </section>
      {result && (
        <section className="panel pair-results" aria-label="Résultats de la paire">
          <div className="panel-heading">
            <h3>Résultats de la paire</h3>
            <span className="tag">
              {result.engine} {result.version}
            </span>
          </div>
          <div className="panel-body">
            <div className="stat-grid">
              <div className="stat-card">
                <span className="stat-label">Tm oligo 1</span>
                <strong className="stat-value">
                  {result.first.tm.toFixed(2)} <small>°C</small>
                </strong>
              </div>
              <div className="stat-card">
                <span className="stat-label">Tm oligo 2</span>
                <strong className="stat-value">
                  {result.second.tm.toFixed(2)} <small>°C</small>
                </strong>
              </div>
              <div className="stat-card">
                <span className="stat-label">Écart absolu de Tm</span>
                <strong className="stat-value">
                  {result.deltaTm.toFixed(2)} <small>°C</small>
                </strong>
              </div>
            </div>
            <h3>Hétérodimère entre les deux oligos</h3>
            <p>
              {result.heterodimer.structureFound
                ? 'Interaction prédite par Primer3.'
                : 'Aucune structure d’hétérodimère trouvée par ce modèle.'}
            </p>
            {result.heterodimer.structureFound && (
              <>
                <p>
                  Tm de l’hétérodimère : {result.heterodimer.tm?.toFixed(2)} °C · ΔG à{' '}
                  {result.temperature} °C : {((result.heterodimer.dgCalMol ?? 0) / 1000).toFixed(2)}{' '}
                  kcal/mol
                </p>
                <pre className="dimer-structure">{result.heterodimer.structure}</pre>
              </>
            )}
            <p className="muted small-text">
              Tm individuelles : SantaLucia, correction saline SantaLucia. Interaction :
              calc_heterodimer, boucle maximale {result.maxLoop} bases. Ces prédictions
              n’établissent pas à elles seules la compatibilité PCR ou la spécificité de la paire.
            </p>
            <button
              className="button secondary"
              onClick={() =>
                download(
                  JSON.stringify({ sequences: normalized, result }, null, 2),
                  'paire-oligos-geneforge.json',
                  'application/json',
                )
              }
            >
              Exporter les résultats de la paire
            </button>
          </div>
        </section>
      )}
    </>
  );
}
