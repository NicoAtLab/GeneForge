import { useState } from 'react';
import { analyzeOligo, normalizeSequence, validateSequence } from '../core/sequence.ts';
import { api, number, percent } from '../lib.ts';
import { Bases, Composition, Heading } from './Common.tsx';
import { Icon } from './Icon.tsx';

interface Thermodynamics {
  tm: number;
  engine: string;
  version: string;
  method: string;
  saltCorrection: string;
  parameters: Record<string, number>;
}
export function OligoAnalyzer({
  initialSequence = '',
  onSave,
}: {
  initialSequence?: string;
  onSave: (sequence: string) => void;
}) {
  const [sequence, setSequence] = useState(initialSequence),
    [parameters, setParameters] = useState({
      mv_conc: 50,
      dv_conc: 1.5,
      dntp_conc: 0.6,
      dna_conc: 50,
    });
  const [result, setResult] = useState<Thermodynamics | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const normalized = normalizeSequence(sequence),
    validation = validateSequence(sequence);
  const analysis = validation.valid && normalized ? analyzeOligo(normalized) : null;
  async function calculate() {
    setBusy(true);
    setError('');
    setResult(null);
    try {
      setResult(
        await api<Thermodynamics>('/api/analyze', {
          method: 'POST',
          body: JSON.stringify({ sequence: normalized, ...parameters }),
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Heading
        eyebrow="Outils scientifiques"
        title="Analyseur d’oligos"
        actions={
          <button
            className="button primary"
            disabled={!analysis}
            onClick={() => onSave(normalized)}
          >
            <Icon name="plus" />
            Enregistrer dans la bibliothèque
          </button>
        }
      >
        Composition et température de fusion, avec des méthodes explicites.
      </Heading>
      <div className="oligo-layout">
        <div>
          <div className="panel">
            <div className="panel-heading">
              <h3>Séquence à analyser</h3>
              <span className="tag">ADN simple brin</span>
            </div>
            <div className="panel-body">
              <label className="field">
                Séquence 5′ → 3′
                <textarea
                  className="sequence-input oligo-input"
                  aria-label="Séquence de l’oligo"
                  spellCheck={false}
                  disabled={busy}
                  maxLength={2000}
                  value={sequence}
                  onChange={(e) => {
                    setSequence(e.target.value);
                    setResult(null);
                    setError('');
                  }}
                  placeholder="Colle un oligonucléotide…"
                />
              </label>
              {!validation.valid && (
                <div className="notice error">
                  Caractère invalide à la position {validation.invalid[0]?.position}. Utilise
                  l’alphabet ADN IUPAC.
                </div>
              )}
              <div className="stat-grid oligo-stats">
                <div className="stat-card">
                  <span className="stat-label">Longueur</span>
                  <strong className="stat-value">
                    {number(normalized.length)} <small>nt</small>
                  </strong>
                </div>
                <div className="stat-card">
                  <span className="stat-label">GC</span>
                  <strong className="stat-value">{percent(analysis?.stats.gc ?? null)}</strong>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Bases ambiguës</span>
                  <strong className="stat-value">{analysis?.stats.ambiguous ?? '—'}</strong>
                </div>
              </div>
              {analysis && <Composition sequence={normalized} />}
            </div>
          </div>
          <div className="panel">
            <div className="panel-heading">
              <h3>Température de fusion</h3>
              <span className="tag">Calcul local</span>
            </div>
            <div className="panel-body">
              <div className="tm-comparison">
                <div>
                  <span className="eyebrow">PRIMER3 · SANTALUCIA</span>
                  <div className="tm-value">
                    {result ? result.tm.toLocaleString('fr-FR', { maximumFractionDigits: 2 }) : '—'}{' '}
                    <small>°C</small>
                  </div>
                  <p className="muted">Nearest Neighbor · correction saline SantaLucia</p>
                </div>
                <div>
                  <span className="eyebrow">ESTIMATION · WALLACE</span>
                  <div className="tm-value secondary-value">
                    {analysis?.wallaceTm ?? '—'} <small>°C</small>
                  </div>
                  <p className="muted">2 × (A + T) + 4 × (G + C) · 14–20 nt</p>
                </div>
              </div>
              <div className="form-grid">
                {(
                  [
                    { key: 'mv_conc', label: 'Ions monovalents', unit: 'mM' },
                    { key: 'dv_conc', label: 'Mg²⁺', unit: 'mM' },
                    { key: 'dntp_conc', label: 'dNTP', unit: 'mM' },
                    { key: 'dna_conc', label: 'Oligonucléotides', unit: 'nM' },
                  ] as const
                ).map((field) => (
                  <label className="field" key={field.key}>
                    {field.label} ({field.unit})
                    <input
                      className="input"
                      type="number"
                      min={field.key === 'dna_conc' ? 0.01 : 0}
                      max={field.key === 'dna_conc' ? 100000 : field.key === 'mv_conc' ? 1000 : 100}
                      step="any"
                      value={Number.isFinite(parameters[field.key]) ? parameters[field.key] : ''}
                      disabled={busy}
                      onChange={(e) => {
                        setParameters({ ...parameters, [field.key]: e.target.valueAsNumber });
                        setResult(null);
                      }}
                    />
                  </label>
                ))}
              </div>
              <button
                className="button primary"
                disabled={
                  busy ||
                  !analysis ||
                  analysis.stats.ambiguous > 0 ||
                  normalized.length < 2 ||
                  normalized.length > 60 ||
                  Object.values(parameters).some((v) => !Number.isFinite(v) || v < 0) ||
                  parameters.dna_conc <= 0
                }
                onClick={() => void calculate()}
              >
                <Icon name="flask" />
                {busy ? 'Calcul en cours…' : 'Calculer avec Primer3'}
              </button>
              {result && (
                <div className="notice success">
                  Calculé avec {result.engine} {result.version}. ADN non modifié, 2–60 bases A/T/G/C
                  ; paramètres affichés ci-dessus. Le modèle estime la fusion d’un duplex.
                </div>
              )}
              {error && (
                <div className="notice error" role="alert">
                  {error}
                </div>
              )}
              <p className="muted small-text">
                La température dépend du modèle et des concentrations. Les bases ambiguës ne sont
                pas acceptées par ce calcul Primer3. Le mode Paire d’oligos calcule aussi
                l’hétérodimère entre deux amorces. Les hairpins, homodimères et modifications
                chimiques ne sont pas évalués.
              </p>
            </div>
          </div>
        </div>
        <aside className="inspector">
          <div className="panel">
            <div className="panel-heading">
              <h3>Brins complémentaires</h3>
            </div>
            <div className="panel-body">
              <label className="field">
                Complément · 3′ → 5′
                <div className="sequence-preview">
                  {analysis ? (
                    <Bases sequence={analysis.complement} />
                  ) : (
                    <span className="muted">—</span>
                  )}
                </div>
              </label>
              <label className="field">
                Complément inverse · 5′ → 3′
                <div className="sequence-preview">
                  {analysis ? (
                    <Bases sequence={analysis.reverseComplement} />
                  ) : (
                    <span className="muted">—</span>
                  )}
                </div>
              </label>
            </div>
          </div>
          <div className="panel">
            <div className="panel-heading">
              <h3>Observations</h3>
              <Icon name="info" />
            </div>
            <div className="panel-body">
              {analysis ? (
                <>
                  {analysis.warnings.map((w) => (
                    <p className="muted" key={w}>
                      {w}
                    </p>
                  ))}
                  {analysis.homopolymers.length ? (
                    <>
                      <p>Homopolymères (≥ 4 bases)</p>
                      {analysis.homopolymers.map((h) => (
                        <p key={h.start}>
                          <span className="tag">
                            {h.base} × {h.length}
                          </span>{' '}
                          <span className="muted">position {h.start}</span>
                        </p>
                      ))}
                    </>
                  ) : (
                    <p className="muted">Aucun homopolymère de 4 bases ou plus.</p>
                  )}
                </>
              ) : (
                <p className="muted">
                  Saisis une séquence pour afficher sa composition et ses répétitions simples.
                </p>
              )}
            </div>
          </div>
          <p className="muted small-text">
            Documentation :{' '}
            <a href="https://primer3.org/manual.html" target="_blank" rel="noreferrer">
              Primer3 <Icon name="external" size={12} />
            </a>
            . Aucun envoi de séquences sur Internet.
          </p>
        </aside>
      </div>
    </>
  );
}
