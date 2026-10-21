import type { ReactNode } from 'react';
import { Icon } from './Icon.tsx';
import { percent } from '../lib.ts';
import { sequenceStats } from '../core/sequence.ts';
export function Heading({
  eyebrow,
  title,
  children,
  actions,
}: {
  eyebrow?: string;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {children && <p className="muted">{children}</p>}
      </div>
      <div className="heading-actions">{actions}</div>
    </div>
  );
}
export function Empty({
  icon = 'folder',
  title,
  children,
  action,
}: {
  icon?: string;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <Icon name={icon} size={34} />
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function Bases({ sequence }: { sequence: string }) {
  return (
    <span className="mono">
      {sequence.split('').map((b, i) => (
        <span key={i} className={`nucleotide base-${'ATGC'.includes(b) ? b.toLowerCase() : 'n'}`}>
          {b}
        </span>
      ))}
    </span>
  );
}
export function Composition({ sequence }: { sequence: string }) {
  const s = sequenceStats(sequence);
  const entries = [
    { name: 'A', value: s.a },
    { name: 'T', value: s.t },
    { name: 'G', value: s.g },
    { name: 'C', value: s.c },
    { name: 'N / IUPAC', value: s.ambiguous },
  ];
  return (
    <>
      <div className="composition-bar" aria-label="Composition nucléotidique">
        {entries.map((e) => (
          <span
            key={e.name}
            className={`base-${e.name[0].toLowerCase()}`}
            style={{ width: `${s.length ? (100 * e.value) / s.length : 0}%` }}
            title={`${e.name} : ${e.value}`}
          />
        ))}
      </div>
      <div className="composition-legend">
        {entries.map((e) => (
          <span key={e.name}>
            <i className={`base-${e.name[0].toLowerCase()}`} />
            {e.name}
            <strong>{e.value}</strong>
            <small>{percent(s.length ? (100 * e.value) / s.length : null)}</small>
          </span>
        ))}
      </div>
      <p className="muted small-text">
        Pourcentages : toutes les bases. GC : {percent(s.gc)} · AT : {percent(s.at)}. GC/AT : bases
        ambiguës exclues du dénominateur.
      </p>
    </>
  );
}
