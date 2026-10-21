import { useEffect } from 'react';
import { createPortal } from 'react-dom';
export interface Report {
  title: string;
  text: string;
  figures: { name: string; url: string }[];
}
export function ReportView({ report, onClose }: { report: Report; onClose: () => void }) {
  useEffect(() => {
    document.body.classList.add('report-open');
    const old = document.title;
    document.title = report.title;
    return () => {
      document.body.classList.remove('report-open');
      document.title = old;
    };
  }, [report.title]);
  return createPortal(
    <div className="report-overlay" role="dialog" aria-modal="true" aria-label="Aperçu du rapport">
      <div className="report-toolbar">
        <span>Rapport prêt à imprimer · choisir « Enregistrer au format PDF »</span>
        <button className="button primary" onClick={() => window.print()}>
          Imprimer / enregistrer en PDF
        </button>
        <button className="button secondary" onClick={onClose}>
          Fermer le rapport
        </button>
      </div>
      <article className="report-paper">
        <div className="report-brand">GeneForge · Notes et résultats</div>
        <h1>{report.title}</h1>
        {report.figures.map((f, i) => (
          <figure key={i}>
            <img src={f.url} alt={f.name} />
            <figcaption>{f.name}</figcaption>
          </figure>
        ))}
        <div className="report-text">{report.text}</div>
      </article>
    </div>,
    document.body,
  );
}
