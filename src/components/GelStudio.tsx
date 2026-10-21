import { useEffect, useMemo, useRef, useState } from 'react';
import type { GelRecord, GelBand, GelLane, PixelRect, WorkspaceState } from '../types.ts';
import type { Commit } from '../lib.ts';
import { api, date, filename, now, uid, download } from '../lib.ts';
import {
  bandMeasurement,
  dragRect,
  ELAB_URL,
  laneProfile,
  laneRect,
  safeWebUrl,
} from '../core/gels.ts';
import {
  copyReport,
  gelFigure,
  gelPixels,
  gelText,
  readGelImage,
  saveDataUrl,
} from '../gelFiles.ts';
import { Heading, Empty } from './Common.tsx';
import { ReportView } from './ReportView.tsx';
import type { Report } from './ReportView.tsx';
import { sequenceStats } from '../core/sequence.ts';

interface Props {
  state: WorkspaceState;
  commit: Commit;
  busy: boolean;
  setDirty: (v: boolean) => void;
  notify: (s: string) => void;
  activeId: string | null;
  onActive: (id: string | null, force?: boolean) => void;
  onPrimer: (id: string) => void;
}
export function GelStudio(props: Props) {
  const { state, commit, busy, notify, activeId, onActive } = props;
  const [importing, setImporting] = useState(false),
    [filter, setFilter] = useState('');
  const active = state.gels.find((g) => g.id === activeId);
  async function importImage(file: File) {
    setImporting(true);
    try {
      const image = await readGelImage(file),
        time = now();
      const gel: GelRecord = {
        id: uid(),
        name: file.name.replace(/\.[^.]+$/, ''),
        image,
        projectId: null,
        notes: '',
        elabUrl: ELAB_URL,
        crop: { x: 0, y: 0, width: image.width, height: image.height },
        lanes: Array.from({ length: 8 }, () => ({
          id: uid(),
          label: '',
          description: '',
          primers: [],
        })),
        bands: [],
        polarity: 'dark',
        figureBackground: 'white',
        createdAt: time,
        updatedAt: time,
      };
      if (await commit((s) => ({ ...s, gels: [...s.gels, gel] }), 'Image originale conservée.'))
        onActive(gel.id);
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setImporting(false);
    }
  }
  if (active) return <GelEditor key={active.id} {...props} record={active} />;
  return (
    <>
      <Heading
        eyebrow="Images et traçabilité"
        title="Gels"
        actions={
          <label className="button primary">
            Importer un gel
            <input
              className="visually-hidden"
              aria-label="Image du gel"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={importing || busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importImage(f);
                e.target.value = '';
              }}
            />
          </label>
        }
      >
        Numérote les pistes, relie les amorces et entoure les bandes à conserver.
      </Heading>
      <p className="muted small-text">
        PNG, JPEG ou WebP · 3 Mio par image · original conservé sans modification.
      </p>
      {importing && <p role="status">Lecture de l’image…</p>}
      <label className="field">
        Rechercher un gel
        <input className="input" value={filter} onChange={(e) => setFilter(e.target.value)} />
      </label>
      <div className="gel-gallery">
        {state.gels
          .filter((g) =>
            (g.name + ' ' + g.notes).toLocaleLowerCase().includes(filter.toLocaleLowerCase()),
          )
          .map((g) => (
            <button key={g.id} className="gel-card" onClick={() => onActive(g.id)}>
              <img src={g.image.dataUrl} alt={g.name} />
              <div>
                <strong>{g.name}</strong>
                <small>
                  {g.lanes.length} pistes · {g.bands.length} bandes · {date(g.updatedAt)}
                </small>
              </div>
            </button>
          ))}
      </div>
      {!state.gels.length && (
        <Empty title="De l’image au résultat annoté" icon="gel">
          Importe une image, sélectionne le gel et indique le nombre de pistes. Les légendes et les
          liens vers les amorces sont conservés avec l’image.
        </Empty>
      )}
    </>
  );
}
function GelEditor({
  record,
  state,
  commit,
  busy,
  setDirty,
  notify,
  onActive,
  onPrimer,
}: Props & { record: GelRecord }) {
  const [draft, setDraft] = useState(record),
    [history, setHistory] = useState<GelRecord[]>([]),
    [future, setFuture] = useState<GelRecord[]>([]);
  const saved = useRef(record),
    [mode, setMode] = useState<'crop' | 'band'>('crop'),
    [laneCount, setLaneCount] = useState(record.lanes.length);
  const [laneId, setLaneId] = useState(record.lanes[0].id),
    [bandId, setBandId] = useState<string | null>(null),
    [color, setColor] = useState('#ff6384');
  const [pixels, setPixels] = useState<ImageData | null>(null),
    [gesture, setGesture] = useState<PixelRect | null>(null),
    [report, setReport] = useState<Report | null>(null);
  const [tm, setTm] = useState<{
    name: string;
    sequence: string;
    tm: number;
    engine: string;
    version: string;
    method: string;
    saltCorrection: string;
    parameters: Record<string, number>;
  } | null>(null);
  const [tmBusy, setTmBusy] = useState(false),
    [params, setParams] = useState({ mv_conc: 50, dv_conc: 1.5, dntp_conc: 0.6, dna_conc: 50 });
  const drag = useRef<{ x: number; y: number; bounds: PixelRect; laneId: string } | null>(null);
  const dirty = draft !== saved.current;
  useEffect(() => {
    setDirty(dirty);
    return () => setDirty(false);
  }, [dirty, setDirty]);
  useEffect(() => {
    let live = true;
    void gelPixels(record)
      .then((p) => {
        if (live) setPixels(p);
      })
      .catch((e) => notify(e.message));
    return () => {
      live = false;
    };
  }, [record.image.dataUrl, notify]);
  function update(next: GelRecord) {
    setHistory((h) => [...h.slice(-29), draft]);
    setFuture([]);
    setDraft(next);
  }
  function undo() {
    if (!history.length) return;
    setFuture((f) => [draft, ...f]);
    setDraft(history.at(-1)!);
    setHistory((h) => h.slice(0, -1));
    setBandId(null);
  }
  function redo() {
    if (!future.length) return;
    setHistory((h) => [...h, draft]);
    setDraft(future[0]);
    setFuture((f) => f.slice(1));
    setBandId(null);
  }
  async function save() {
    if (!draft.name.trim() || !safeWebUrl(draft.elabUrl)) return;
    const next = { ...draft, name: draft.name.trim(), updatedAt: now() };
    if (
      await commit(
        (s) => ({ ...s, gels: s.gels.map((g) => (g.id === draft.id ? next : g)) }),
        'Gel et annotations enregistrés.',
      )
    ) {
      saved.current = next;
      setDraft(next);
      setDirty(false);
    }
  }
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void saveRef.current();
      }
    }
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  const selectedLane = draft.lanes.find((l) => l.id === laneId) ?? draft.lanes[0];
  const laneIndex = draft.lanes.indexOf(selectedLane);
  const selectedBand = draft.bands.find((b) => b.id === bandId);
  function laneChange(next: GelLane) {
    update({ ...draft, lanes: draft.lanes.map((l) => (l.id === next.id ? next : l)) });
  }
  function bandChange(next: GelBand) {
    update({ ...draft, bands: draft.bands.map((b) => (b.id === next.id ? next : b)) });
  }
  const profile = useMemo(
    () =>
      pixels
        ? laneProfile(
            pixels.data,
            pixels.width,
            pixels.height,
            laneRect(draft.crop, draft.lanes.length, laneIndex),
            draft.polarity,
          )
        : [],
    [pixels, draft.crop, draft.lanes.length, laneIndex, draft.polarity],
  );
  const measurement =
    selectedBand && pixels
      ? bandMeasurement(pixels.data, pixels.width, pixels.height, selectedBand, draft.polarity)
      : null;
  function point(e: React.PointerEvent<SVGSVGElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(
        0,
        Math.min(draft.image.width, ((e.clientX - box.left) / box.width) * draft.image.width),
      ),
      y: Math.max(
        0,
        Math.min(draft.image.height, ((e.clientY - box.top) / box.height) * draft.image.height),
      ),
    };
  }
  function start(e: React.PointerEvent<SVGSVGElement>) {
    if (e.button !== 0) return;
    const p = point(e);
    let bounds: PixelRect = { x: 0, y: 0, width: draft.image.width, height: draft.image.height },
      id = selectedLane.id;
    if (mode === 'band') {
      const i = Math.floor(((p.x - draft.crop.x) / draft.crop.width) * draft.lanes.length);
      if (
        i < 0 ||
        i >= draft.lanes.length ||
        p.y < draft.crop.y ||
        p.y > draft.crop.y + draft.crop.height
      )
        return;
      bounds = laneRect(draft.crop, draft.lanes.length, i);
      id = draft.lanes[i].id;
      setLaneId(id);
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { ...p, bounds, laneId: id };
    setGesture(null);
  }
  function end(e: React.PointerEvent<SVGSVGElement>) {
    const anchor = drag.current;
    if (!anchor) return;
    const region = dragRect(anchor, point(e), anchor.bounds);
    drag.current = null;
    setGesture(null);
    if (region.width < 2 || region.height < 2) return;
    if (mode === 'crop') {
      if (
        draft.bands.length &&
        !confirm('Changer la zone du gel supprime les contours de bandes. Continuer ?')
      )
        return;
      update({ ...draft, crop: region, bands: [] });
      setBandId(null);
    } else {
      if (draft.bands.length >= 1000) {
        notify('Limite de 1 000 bandes atteinte.');
        return;
      }
      const band: GelBand = {
        ...region,
        id: uid(),
        laneId: anchor.laneId,
        label: `Bande ${draft.bands.length + 1}`,
        color,
      };
      update({ ...draft, bands: [...draft.bands, band] });
      setBandId(band.id);
    }
  }
  async function figureExport() {
    try {
      saveDataUrl(await gelFigure(draft), `${filename(draft.name)}-annote.png`);
    } catch (e) {
      notify((e as Error).message);
    }
  }
  async function pdf() {
    try {
      setReport({
        title: draft.name,
        text: gelText(draft).slice(draft.name.length).trimStart(),
        figures: [{ name: draft.image.fileName, url: await gelFigure(draft) }],
      });
    } catch (e) {
      notify((e as Error).message);
    }
  }
  return (
    <>
      <Heading
        eyebrow="Studio de gels"
        title={draft.name}
        actions={
          <>
            <button className="button secondary" onClick={() => onActive(null)}>
              Tous les gels
            </button>
            <button
              className="button primary"
              disabled={busy || !draft.name.trim() || !safeWebUrl(draft.elabUrl)}
              onClick={() => void save()}
            >
              Enregistrer le gel
            </button>
          </>
        }
      >
        Original préservé · {draft.image.width} × {draft.image.height} px ·{' '}
        {dirty ? 'Modifications non enregistrées' : 'Enregistré localement'}
      </Heading>
      <div className="gel-workspace">
        <div className="gel-main">
          <div className="panel">
            <div className="panel-body">
              <div className="form-grid">
                <label className="field">
                  Nom du gel
                  <input
                    className="input"
                    maxLength={200}
                    value={draft.name}
                    onChange={(e) => update({ ...draft, name: e.target.value })}
                  />
                </label>
                <label className="field">
                  Projet du gel
                  <select
                    className="select"
                    value={draft.projectId ?? ''}
                    onChange={(e) => update({ ...draft, projectId: e.target.value || null })}
                  >
                    <option value="">Sans projet</option>
                    {state.projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="gel-toolstrip">
                <button
                  className={`button ${mode === 'crop' ? 'primary' : 'secondary'}`}
                  aria-pressed={mode === 'crop'}
                  onClick={() => setMode('crop')}
                >
                  1 · Sélectionner le gel
                </button>
                <button
                  className={`button ${mode === 'band' ? 'primary' : 'secondary'}`}
                  aria-pressed={mode === 'band'}
                  onClick={() => setMode('band')}
                >
                  2 · Entourer une bande
                </button>
                <label className="color-tool">
                  Couleur du contour
                  <input
                    type="color"
                    aria-label="Couleur des nouvelles bandes"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                  />
                </label>
                <button className="button ghost" disabled={!history.length} onClick={undo}>
                  Annuler
                </button>
                <button className="button ghost" disabled={!future.length} onClick={redo}>
                  Rétablir
                </button>
              </div>
              <p className="muted small-text">
                {mode === 'crop'
                  ? 'Trace un rectangle autour du gel : cette zone sera divisée en pistes égales.'
                  : 'Trace une ellipse autour de la bande voulue. Le contour reste dans la piste où tu commences.'}
              </p>
              <div className="gel-image-frame">
                <svg
                  className="gel-interactive"
                  role="img"
                  aria-label="Gel à sélectionner et annoter"
                  viewBox={`0 0 ${draft.image.width} ${draft.image.height}`}
                  onPointerDown={start}
                  onPointerMove={(e) => {
                    if (drag.current)
                      setGesture(dragRect(drag.current, point(e), drag.current.bounds));
                  }}
                  onPointerUp={end}
                  onPointerCancel={() => {
                    drag.current = null;
                    setGesture(null);
                  }}
                >
                  <image
                    href={draft.image.dataUrl}
                    width={draft.image.width}
                    height={draft.image.height}
                  />
                  <rect
                    {...draft.crop}
                    fill="none"
                    stroke="#39d5b0"
                    strokeWidth="2"
                    vectorEffect="non-scaling-stroke"
                  />
                  {draft.lanes.map((l, i) => (
                    <rect
                      key={l.id}
                      {...laneRect(draft.crop, draft.lanes.length, i)}
                      fill={l.id === selectedLane.id ? '#39d5b014' : 'none'}
                      stroke="#39d5b070"
                      strokeWidth="1"
                      vectorEffect="non-scaling-stroke"
                    />
                  ))}
                  {draft.bands.map((b) => (
                    <ellipse
                      key={b.id}
                      cx={b.x + b.width / 2}
                      cy={b.y + b.height / 2}
                      rx={b.width / 2}
                      ry={b.height / 2}
                      fill="none"
                      stroke={b.color}
                      strokeWidth={b.id === bandId ? 4 : 2}
                      vectorEffect="non-scaling-stroke"
                    />
                  ))}
                  {gesture &&
                    (mode === 'crop' ? (
                      <rect
                        {...gesture}
                        fill="#39d5b022"
                        stroke="#39d5b0"
                        vectorEffect="non-scaling-stroke"
                      />
                    ) : (
                      <ellipse
                        cx={gesture.x + gesture.width / 2}
                        cy={gesture.y + gesture.height / 2}
                        rx={gesture.width / 2}
                        ry={gesture.height / 2}
                        fill="none"
                        stroke={color}
                        strokeWidth="2"
                        vectorEffect="non-scaling-stroke"
                      />
                    ))}
                </svg>
                <div
                  className="lane-numbers"
                  style={{
                    left: `${(draft.crop.x / draft.image.width) * 100}%`,
                    width: `${(draft.crop.width / draft.image.width) * 100}%`,
                  }}
                >
                  {draft.lanes.map((l, i) => (
                    <button
                      key={l.id}
                      aria-label={`Choisir la piste ${i + 1}`}
                      className={l.id === selectedLane.id ? 'active' : ''}
                      onClick={() => {
                        setLaneId(l.id);
                        setBandId(null);
                        setTm(null);
                      }}
                    >
                      {i + 1}
                    </button>
                  ))}
                </div>
              </div>
              <div className="form-grid gel-controls">
                <label className="field">
                  Nombre de pistes
                  <input
                    className="input"
                    type="number"
                    min={1}
                    max={48}
                    value={Number.isFinite(laneCount) ? laneCount : ''}
                    onChange={(e) => setLaneCount(e.target.valueAsNumber)}
                  />
                </label>
                <button
                  className="button secondary"
                  disabled={
                    !Number.isInteger(laneCount) ||
                    laneCount < 1 ||
                    laneCount > 48 ||
                    draft.crop.width / laneCount < 2
                  }
                  onClick={() => {
                    if (laneCount === draft.lanes.length) return;
                    if (
                      (draft.bands.length ||
                        draft.lanes.some((l) => l.label || l.description || l.primers.length)) &&
                      !confirm(
                        'Rediviser le gel efface les contours et les légendes des pistes. Continuer ?',
                      )
                    )
                      return;
                    const lanes = Array.from({ length: laneCount }, () => ({
                      id: uid(),
                      label: '',
                      description: '',
                      primers: [],
                    }));
                    update({ ...draft, lanes, bands: [] });
                    setLaneId(lanes[0].id);
                    setBandId(null);
                  }}
                >
                  Diviser en pistes égales
                </button>
                <label className="field">
                  Fond du gel
                  <select
                    className="select"
                    value={draft.polarity}
                    onChange={(e) =>
                      update({ ...draft, polarity: e.target.value as GelRecord['polarity'] })
                    }
                  >
                    <option value="dark">Noir · bandes claires</option>
                    <option value="light">Blanc · bandes sombres</option>
                  </select>
                </label>
                <label className="field">
                  Fond de la figure exportée
                  <select
                    className="select"
                    value={draft.figureBackground}
                    onChange={(e) =>
                      update({
                        ...draft,
                        figureBackground: e.target.value as GelRecord['figureBackground'],
                      })
                    }
                  >
                    <option value="white">Blanc</option>
                    <option value="black">Noir</option>
                  </select>
                </label>
              </div>
              <details>
                <summary>Coordonnées du recadrage</summary>
                <p className="muted small-text">
                  Pixels, origine haut-gauche. Les contours de bandes sont réinitialisés en cas de
                  recadrage.
                </p>
                <div className="form-grid">
                  {(['x', 'y', 'width', 'height'] as const).map((k) => (
                    <label className="field" key={k}>
                      {k}
                      <input
                        className="input"
                        aria-label={`Recadrage ${k}`}
                        type="number"
                        step="any"
                        min={0}
                        value={Number(draft.crop[k].toFixed(2))}
                        onChange={(e) => {
                          const crop = { ...draft.crop, [k]: e.target.valueAsNumber };
                          if (
                            !Object.values(crop).every(Number.isFinite) ||
                            crop.x < 0 ||
                            crop.y < 0 ||
                            crop.width < 2 ||
                            crop.height < 2 ||
                            crop.x + crop.width > draft.image.width ||
                            crop.y + crop.height > draft.image.height
                          )
                            return;
                          if (
                            draft.bands.length &&
                            !confirm('Ce recadrage efface les contours. Continuer ?')
                          )
                            return;
                          update({ ...draft, crop, bands: [] });
                          setBandId(null);
                        }}
                      />
                    </label>
                  ))}
                </div>
              </details>
            </div>
          </div>
          <section className="panel">
            <div className="panel-heading">
              <h3>Profil de la piste {laneIndex + 1}</h3>
              <span className="tag">Intensité de pixels</span>
            </div>
            <div className="panel-body">
              <svg
                className="lane-profile"
                viewBox="0 0 600 140"
                role="img"
                aria-label={`Profil d’intensité de la piste ${laneIndex + 1}`}
              >
                <path d="M20 10V120H590" fill="none" stroke="currentColor" opacity=".3" />
                {profile.length > 0 && (
                  <polyline
                    fill="none"
                    stroke="#39d5b0"
                    strokeWidth="2"
                    points={profile
                      .filter((_, i) => i % Math.max(1, Math.ceil(profile.length / 580)) === 0)
                      .map(
                        (p) =>
                          `${20 + ((p.y - draft.crop.y) / draft.crop.height) * 570},${120 - (p.signal / 255) * 110}`,
                      )
                      .join(' ')}
                  />
                )}
                <text x="20" y="137" fill="currentColor" fontSize="10">
                  Haut du gel
                </text>
                <text x="525" y="137" fill="currentColor" fontSize="10">
                  Bas du gel
                </text>
              </svg>
              <p className="muted small-text">
                Moyenne des pixels de la piste (0–255), selon le fond choisi. Sans soustraction de
                fond ni calibration en taille ou concentration.
              </p>
            </div>
          </section>
          <section className="panel">
            <div className="panel-body">
              <label className="field">
                Observations du gel
                <textarea
                  className="textarea"
                  rows={4}
                  maxLength={100000}
                  value={draft.notes}
                  onChange={(e) => update({ ...draft, notes: e.target.value })}
                />
              </label>
              <label className="field">
                Lien e-Lab du gel
                <input
                  className="input"
                  maxLength={2000}
                  type="url"
                  value={draft.elabUrl}
                  onChange={(e) => update({ ...draft, elabUrl: e.target.value })}
                />
              </label>
              <div className="toolbar lab-actions">
                <button className="button primary" onClick={() => void figureExport()}>
                  Exporter la figure PNG
                </button>
                <button className="button secondary" onClick={() => void pdf()}>
                  Exporter PDF
                </button>
                <button
                  className="button secondary"
                  onClick={() =>
                    void copyReport(gelText(draft))
                      .then(() => notify('Description et paramètres copiés.'))
                      .catch(() => notify('Copie indisponible dans ce navigateur.'))
                  }
                >
                  Copier le compte rendu
                </button>
                <button
                  className="button ghost"
                  onClick={() => saveDataUrl(draft.image.dataUrl, draft.image.fileName)}
                >
                  Image originale
                </button>
              </div>
              <details>
                <summary>Provenance de l’image</summary>
                <p className="mono break-anywhere">
                  {draft.image.fileName}
                  <br />
                  SHA-256 : {draft.image.sha256}
                </p>
              </details>
              <button
                className="button danger"
                disabled={busy}
                onClick={async () => {
                  if (
                    confirm('Supprimer ce gel, son image et ses annotations ?') &&
                    (await commit(
                      (s) => ({ ...s, gels: s.gels.filter((g) => g.id !== draft.id) }),
                      'Gel supprimé.',
                    ))
                  ) {
                    setDirty(false);
                    onActive(null, true);
                  }
                }}
              >
                Supprimer le gel
              </button>
            </div>
          </section>
        </div>
        <aside className="gel-details">
          <section className="panel">
            <div className="panel-heading">
              <h3>Légendes des pistes</h3>
            </div>
            <div className="lane-legend-list">
              {draft.lanes.map((l, i) => (
                <button
                  className={`lane-legend ${l.id === selectedLane.id ? 'active' : ''}`}
                  key={l.id}
                  onClick={() => {
                    setLaneId(l.id);
                    setBandId(null);
                    setTm(null);
                  }}
                >
                  <b>{i + 1}</b>
                  <span>
                    <strong>{l.label || 'À renseigner'}</strong>
                    <small>
                      {l.description ||
                        l.primers.map((p) => p.name).join(' + ') ||
                        'Description et amorces'}
                    </small>
                  </span>
                </button>
              ))}
            </div>
          </section>
          <section className="panel">
            <div className="panel-heading">
              <h3>Piste {laneIndex + 1}</h3>
            </div>
            <div className="panel-body">
              <label className="field">
                Légende de la piste
                <input
                  className="input"
                  maxLength={120}
                  value={selectedLane.label}
                  onChange={(e) => laneChange({ ...selectedLane, label: e.target.value })}
                />
              </label>
              <label className="field">
                Description de la piste
                <textarea
                  className="textarea"
                  rows={3}
                  maxLength={4000}
                  value={selectedLane.description}
                  onChange={(e) => laneChange({ ...selectedLane, description: e.target.value })}
                />
              </label>
              <label className="field">
                Ajouter une amorce à la piste
                <select
                  aria-label="Ajouter une amorce à la piste"
                  className="select"
                  value=""
                  disabled={selectedLane.primers.length >= 8}
                  onChange={(e) => {
                    const p = state.primers.find((p) => p.id === e.target.value);
                    if (!p || selectedLane.primers.some((s) => s.recordId === p.id)) return;
                    laneChange({
                      ...selectedLane,
                      primers: [
                        ...selectedLane.primers,
                        {
                          recordId: p.id,
                          name: p.name,
                          sequence: p.sequence,
                          orientation: p.orientation,
                          notes: p.notes,
                          sourceFile: p.sourceFile,
                          capturedAt: now(),
                        },
                      ],
                    });
                  }}
                >
                  <option value="">Choisir dans la bibliothèque…</option>
                  {state.primers
                    .filter(
                      (p) =>
                        p.status === 'active' &&
                        !selectedLane.primers.some((s) => s.recordId === p.id),
                    )
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                </select>
              </label>
              {selectedLane.primers.map((p) => {
                const stats = sequenceStats(p.sequence);
                return (
                  <article className="gel-primer" key={p.recordId}>
                    <strong>{p.name}</strong>
                    <p className="mono break-anywhere">5′ {p.sequence} 3′</p>
                    <p>
                      {stats.length} nt · GC {stats.gc?.toFixed(1) ?? '—'} % · {p.orientation}
                    </p>
                    <p className="muted small-text">{p.notes}</p>
                    <p className="muted small-text">
                      Copie du {date(p.capturedAt)} · {p.sourceFile || 'Fiche locale'}
                    </p>
                    {state.primers.some((s) => s.id === p.recordId) && (
                      <button
                        className="source-link"
                        disabled={dirty}
                        onClick={() => onPrimer(p.recordId)}
                      >
                        Ouvrir la fiche d’origine{dirty ? ' (enregistrer le gel)' : ''}
                      </button>
                    )}
                    <button
                      className="button small secondary"
                      disabled={tmBusy || !/^[ACGT]{2,60}$/.test(p.sequence)}
                      onClick={async () => {
                        setTmBusy(true);
                        setTm(null);
                        try {
                          const result = await api<
                            Omit<NonNullable<typeof tm>, 'name' | 'sequence'>
                          >('/api/analyze', {
                            method: 'POST',
                            body: JSON.stringify({ sequence: p.sequence, ...params }),
                          });
                          setTm({ ...result, name: p.name, sequence: p.sequence });
                        } catch (e) {
                          notify((e as Error).message);
                        } finally {
                          setTmBusy(false);
                        }
                      }}
                    >
                      Calculer la Tm Primer3
                    </button>
                    <button
                      className="button small ghost"
                      onClick={() =>
                        laneChange({
                          ...selectedLane,
                          primers: selectedLane.primers.filter((s) => s.recordId !== p.recordId),
                        })
                      }
                    >
                      Retirer {p.name}
                    </button>
                  </article>
                );
              })}
              <details>
                <summary>Conditions du calcul Tm</summary>
                {(
                  [
                    ['mv_conc', 'Monovalents (mM)'],
                    ['dv_conc', 'Mg²⁺ (mM)'],
                    ['dntp_conc', 'dNTP (mM)'],
                    ['dna_conc', 'Oligo (nM)'],
                  ] as const
                ).map(([k, label]) => (
                  <label className="field" key={k}>
                    {label}
                    <input
                      className="input"
                      type="number"
                      step="any"
                      value={Number.isFinite(params[k]) ? params[k] : ''}
                      onChange={(e) => {
                        setParams({ ...params, [k]: e.target.valueAsNumber });
                        setTm(null);
                      }}
                    />
                  </label>
                ))}
              </details>
              {tm && (
                <div className="notice">
                  <strong>
                    {tm.name} · Tm {tm.tm.toFixed(2)} °C
                  </strong>
                  <p>
                    {tm.engine} {tm.version} · {tm.method} · {tm.saltCorrection}
                  </p>
                  <p className="small-text">
                    {Object.entries(tm.parameters)
                      .map(([k, v]) => `${k}=${v}`)
                      .join(' · ')}
                  </p>
                  <button
                    className="button small secondary"
                    onClick={() => {
                      const text = `${tm.name} : Tm ${tm.tm.toFixed(2)} °C · ${tm.engine} ${tm.version} · ${tm.method}/${tm.saltCorrection} · ${JSON.stringify(tm.parameters)} · séquence ${tm.sequence}`;
                      laneChange({
                        ...selectedLane,
                        description: (selectedLane.description + '\n' + text).trim().slice(0, 4000),
                      });
                    }}
                  >
                    Conserver ce calcul dans la légende
                  </button>
                </div>
              )}
              <button
                className="button secondary"
                onClick={() =>
                  void gelFigure(draft, laneIndex)
                    .then((url) =>
                      saveDataUrl(url, `${filename(draft.name)}-piste-${laneIndex + 1}.png`),
                    )
                    .catch((e) => notify(e.message))
                }
              >
                Exporter cette piste PNG
              </button>
            </div>
          </section>
          <section className="panel">
            <div className="panel-heading">
              <h3>Bandes · piste {laneIndex + 1}</h3>
            </div>
            <div className="panel-body">
              {draft.bands
                .filter((b) => b.laneId === selectedLane.id)
                .map((b) => (
                  <button
                    className={`band-chip ${bandId === b.id ? 'active' : ''}`}
                    key={b.id}
                    style={{ borderColor: b.color }}
                    onClick={() => setBandId(b.id)}
                  >
                    {b.label || 'Bande sans titre'}
                  </button>
                ))}
              {!draft.bands.some((b) => b.laneId === selectedLane.id) && (
                <p className="muted">
                  Choisis « Entourer une bande », puis trace son contour sur l’image.
                </p>
              )}
              {selectedBand && (
                <>
                  <label className="field">
                    Nom de la bande
                    <input
                      className="input"
                      maxLength={120}
                      value={selectedBand.label}
                      onChange={(e) => bandChange({ ...selectedBand, label: e.target.value })}
                    />
                  </label>
                  <label className="field">
                    Couleur de la bande
                    <input
                      type="color"
                      value={selectedBand.color}
                      onChange={(e) => bandChange({ ...selectedBand, color: e.target.value })}
                    />
                  </label>
                  {measurement && (
                    <p className="muted small-text">
                      {measurement.count} pixels · signal moyen {measurement.mean.toFixed(1)} / 255
                      · {measurement.saturatedPercent.toFixed(1)} % au niveau maximal. Mesure de
                      l’ellipse, sans correction de fond.
                    </p>
                  )}
                  <button
                    className="button danger small"
                    onClick={() => {
                      update({
                        ...draft,
                        bands: draft.bands.filter((b) => b.id !== selectedBand.id),
                      });
                      setBandId(null);
                    }}
                  >
                    Supprimer la bande
                  </button>
                </>
              )}
              <button
                className="button secondary small"
                onClick={() => {
                  if (!pixels) return;
                  const rows = [
                    'piste,bande,pixels,signal_moyen,signal_total,pixels_max_pourcent',
                    ...draft.bands.map((b) => {
                      const m = bandMeasurement(
                        pixels.data,
                        pixels.width,
                        pixels.height,
                        b,
                        draft.polarity,
                      );
                      return [
                        draft.lanes.findIndex((l) => l.id === b.laneId) + 1,
                        `"${b.label.replace(/"/g, '""').replace(/^[=+\-@\t\r]/, "'$&")}"`,
                        m.count,
                        m.mean,
                        m.sum,
                        m.saturatedPercent,
                      ].join(',');
                    }),
                  ];
                  download(
                    rows.join('\r\n'),
                    `${filename(draft.name)}-mesures.csv`,
                    'text/csv;charset=utf-8',
                  );
                }}
              >
                Exporter les mesures CSV
              </button>
            </div>
          </section>
        </aside>
      </div>
      {report && <ReportView report={report} onClose={() => setReport(null)} />}
    </>
  );
}
