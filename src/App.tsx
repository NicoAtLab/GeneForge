import { useCallback, useEffect, useRef, useState } from 'react';
import type { Page, Primer, Project, WorkspaceState } from './types.ts';
import { api, date, download, now, number, percent, uid } from './lib.ts';
import type { Commit } from './lib.ts';
import { analyzeOligo, sequenceStats } from './core/sequence.ts';
import { exportFasta, exportPrimerCsv } from './core/formats.ts';
import { Icon } from './components/Icon.tsx';
import { Bases, Empty, Heading } from './components/Common.tsx';
import { Modal } from './components/Modal.tsx';
import { SequenceEditor } from './components/SequenceEditor.tsx';
import { OligoAnalyzer } from './components/OligoAnalyzer.tsx';
import { SettingsPage } from './components/SettingsPage.tsx';
import { ImportForm, PrimerForm, ProjectForm, SequenceForm } from './components/EntityForms.tsx';
import { NotesPage } from './components/NotesPage.tsx';
import { GelStudio } from './components/GelStudio.tsx';
import { AssistantPage } from './components/AssistantPage.tsx';

const nav: { page: Page; label: string; icon: string }[] = [
  { page: 'dashboard', label: 'Vue d’ensemble', icon: 'dashboard' },
  { page: 'projects', label: 'Projets', icon: 'folder' },
  { page: 'sequences', label: 'Séquences', icon: 'dna' },
  { page: 'primers', label: 'Bibliothèque d’amorces', icon: 'library' },
  { page: 'oligo', label: 'Analyseur d’oligos', icon: 'flask' },
  { page: 'notes', label: 'Notes', icon: 'file' },
  { page: 'gels', label: 'Gels', icon: 'gel' },
  { page: 'assistant', label: 'Assistant IA', icon: 'spark' },
];
type Dialog =
  | { type: 'project'; project?: Project }
  | { type: 'sequence' }
  | { type: 'primer'; primer?: Primer; sequence?: string }
  | { type: 'import'; kind: 'sequence' | 'primer' }
  | { type: 'search' }
  | null;
export default function App() {
  const [state, setState] = useState<WorkspaceState | null>(null),
    [loadError, setLoadError] = useState(''),
    [busy, setBusy] = useState(false),
    [saveError, setSaveError] = useState('');
  const [page, setPage] = useState<Page>('dashboard'),
    [activeSequence, setActiveSequence] = useState<string | null>(null),
    [projectFilter, setProjectFilter] = useState(''),
    [filter, setFilter] = useState(''),
    [dialog, setDialog] = useState<Dialog>(null),
    [toast, setToast] = useState(''),
    [dirty, setDirty] = useState(false),
    [oligoSequence, setOligoSequence] = useState(''),
    [oligoKey, setOligoKey] = useState(0),
    [primerFilter, setPrimerFilter] = useState('active'),
    [sort, setSort] = useState('name'),
    [selected, setSelected] = useState<string[]>([]);
  const [activeGel, setActiveGel] = useState<string | null>(null),
    [activeNote, setActiveNote] = useState<string | null>(null);
  const stateRef = useRef(state),
    saving = useRef(false),
    toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notify = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 6000);
  }, []);
  useEffect(() => {
    api<WorkspaceState>('/api/state')
      .then((s) => {
        stateRef.current = s;
        setState(s);
      })
      .catch((e) => setLoadError(e.message));
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);
  const commit: Commit = async (update, message = 'Enregistré.') => {
    if (saving.current || !stateRef.current) {
      notify('Un enregistrement est déjà en cours.');
      return false;
    }
    saving.current = true;
    setBusy(true);
    setSaveError('');
    try {
      const next = await api<WorkspaceState>('/api/state', {
        method: 'PUT',
        body: JSON.stringify(update(stateRef.current)),
      });
      stateRef.current = next;
      setState(next);
      setProjectFilter((id) => (next.projects.some((p) => p.id === id) ? id : ''));
      notify(message);
      return true;
    } catch (e) {
      setSaveError((e as Error).message);
      notify('Échec : ' + (e as Error).message);
      return false;
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const theme = state?.settings.theme ?? 'dark';
      document.documentElement.dataset.theme =
        theme === 'system' ? (media.matches ? 'dark' : 'light') : theme;
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [state?.settings.theme]);
  useEffect(() => {
    if (!state) return;
    const root = document.documentElement;
    root.dataset.accent = state.settings.accent;
    root.dataset.density = state.settings.density;
    root.dataset.basePalette = state.settings.basePalette;
    root.style.setProperty('--sequence-font-size', `${state.settings.sequenceFontSize}px`);
  }, [state?.settings]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty || busy) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, busy]);
  function canLeave() {
    return !dirty || window.confirm('Des modifications ne sont pas enregistrées. Les abandonner ?');
  }
  function go(next: Page) {
    if (!canLeave()) return;
    setDirty(false);
    setActiveSequence(null);
    setActiveGel(null);
    setActiveNote(null);
    setPage(next);
    setFilter('');
    setSelected([]);
  }
  function openSequence(id: string) {
    if (!canLeave()) return;
    setDirty(false);
    setActiveSequence(id);
    setPage('sequences');
    setDialog(null);
  }
  function openProject(id: string) {
    if (!canLeave()) return;
    setProjectFilter(id);
    setFilter('');
    setActiveSequence(null);
    setPage('sequences');
    setDirty(false);
  }
  function newSequence() {
    if (!state?.projects.length) {
      notify('Crée d’abord un projet pour y ranger tes séquences.');
      setDialog({ type: 'project' });
    } else setDialog({ type: 'sequence' });
  }
  function importSequences() {
    if (!state?.projects.length) {
      notify('Crée d’abord un projet pour recevoir cet import.');
      setDialog({ type: 'project' });
    } else setDialog({ type: 'import', kind: 'sequence' });
  }
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === 'k') {
        e.preventDefault();
        setDialog({ type: 'search' });
      }
      if (k === 'n') {
        e.preventDefault();
        newSequence();
      }
      if (k === 'o') {
        e.preventDefault();
        importSequences();
      }
    }
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });
  const closeDialog = useCallback(() => {
    if (!saving.current) setDialog(null);
  }, []);
  async function seed() {
    const timestamp = now(),
      projectId = uid();
    const dna = 'ACGTTGCAAGTCGATCGTACGATGCTAGCTACGATCGTACGTTAGCAGTCATGC'.repeat(6);
    await commit(
      (s) => ({
        ...s,
        projects: [
          ...s.projects,
          {
            id: projectId,
            name: 'Premiers pas',
            description:
              'Un espace de découverte avec des séquences artificielles, sans annotation biologique.',
            color: '#39d5b0',
            pinned: true,
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        ],
        sequences: [
          ...s.sequences,
          {
            id: uid(),
            projectId,
            name: 'Séquence de démonstration',
            sequence: dna,
            annotations: [],
            annotationSources: [],
            sourceFile: null,
            topology: 'linear',
            notes:
              'Données artificielles pour découvrir l’éditeur. Aucune fonction biologique attribuée.',
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        ],
        primers: [
          ...s.primers,
          {
            id: uid(),
            name: 'Oligo de démonstration',
            sequence: 'ACGTTGCAAGTCGATCGT',
            orientation: 'other',
            notes: 'Oligo artificiel pour tester l’analyseur.',
            sourceFile: null,
            tags: ['démonstration'],
            projectIds: [projectId],
            favorite: true,
            status: 'active',
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        ],
      }),
      'Projet de démonstration créé.',
    );
  }
  async function restore(value: unknown) {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    try {
      const next = await api<WorkspaceState>('/api/restore', {
        method: 'POST',
        body: JSON.stringify(value),
      });
      stateRef.current = next;
      setState(next);
      setProjectFilter('');
      setSaveError('');
      notify('Espace restauré et intégrité vérifiée.');
    } catch (e) {
      setSaveError((e as Error).message);
      throw e;
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  function exportPrimers() {
    if (!state) return;
    try {
      download(
        exportPrimerCsv(
          state.primers.filter((p) =>
            selected.length ? selected.includes(p.id) : filteredPrimers.some((f) => f.id === p.id),
          ),
        ),
        'amorces-geneforge.csv',
        'text/csv;charset=utf-8',
      );
    } catch (e) {
      notify((e as Error).message);
    }
  }
  function analyzePrimer(p: Primer) {
    go('oligo');
    setOligoSequence(p.sequence);
    setOligoKey((k) => k + 1);
  }
  if (!state)
    return (
      <div className="boot">
        <img src="/logo.svg" width="64" alt="" />
        <h1>GeneForge</h1>
        <p>{loadError || 'Ouverture de votre espace local…'}</p>
        {loadError && (
          <button className="button primary" onClick={() => location.reload()}>
            Réessayer
          </button>
        )}
      </div>
    );
  const active = state.sequences.find((s) => s.id === activeSequence);
  const recent = [...state.sequences]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 5);
  const projects = [...state.projects].sort(
    (a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt),
  );
  const query = filter.toLowerCase();
  const filteredSequences = state.sequences.filter(
    (s) =>
      (!projectFilter || s.projectId === projectFilter) &&
      (s.name + ' ' + s.sequence + ' ' + s.notes).toLowerCase().includes(query),
  );
  const filteredPrimers = state.primers
    .filter(
      (p) =>
        (primerFilter === 'all' ||
          (primerFilter === 'favorites' && p.favorite) ||
          p.status === primerFilter) &&
        (p.name + ' ' + p.sequence + ' ' + p.tags.join(' ') + ' ' + p.notes)
          .toLowerCase()
          .includes(query),
    )
    .sort((a, b) =>
      sort === 'length'
        ? a.sequence.length - b.sequence.length
        : sort === 'gc'
          ? (sequenceStats(a.sequence).gc ?? -1) - (sequenceStats(b.sequence).gc ?? -1)
          : a.name.localeCompare(b.name),
    );
  const profileName = state.settings.name || 'Espace personnel';
  const projectCards = (items: Project[]) =>
    items.map((p) => (
      <div className="project-card" key={p.id}>
        <div className="project-card-header">
          <span className="project-color" style={{ color: p.color }}>
            <Icon name="folder" size={23} />
          </span>
          <div className="table-actions">
            <button
              className={'button ghost icon-button ' + (p.pinned ? 'is-favorite' : '')}
              disabled={busy}
              title={p.pinned ? 'Désépingler' : 'Épingler'}
              aria-label={(p.pinned ? 'Désépingler ' : 'Épingler ') + p.name}
              onClick={() =>
                void commit((s) => ({
                  ...s,
                  projects: s.projects.map((x) =>
                    x.id === p.id ? { ...x, pinned: !x.pinned } : x,
                  ),
                }))
              }
            >
              <Icon name="star" size={16} />
            </button>
            <button
              className="button ghost icon-button"
              aria-label={'Modifier ' + p.name}
              onClick={() => setDialog({ type: 'project', project: p })}
            >
              <Icon name="edit" size={16} />
            </button>
          </div>
        </div>
        <button className="project-title" onClick={() => openProject(p.id)}>
          {p.name}
          <Icon name="arrow-right" size={16} />
        </button>
        <p className="muted project-description">
          {p.description || 'Ajoutez vos séquences et organisez votre travail.'}
        </p>
        <div className="project-meta">
          <span>
            {state.sequences.filter((s) => s.projectId === p.id).length} séquences ·{' '}
            {state.primers.filter((a) => a.projectIds.includes(p.id)).length} amorces
          </span>
          <span>{date(p.updatedAt)}</span>
        </div>
      </div>
    ));
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            go('dashboard');
          }}
        >
          <img className="brand-icon" src="/logo.svg" alt="" />
          <span>
            <strong className="brand-title">
              GeneForge<span className="brand-period">.</span>
            </strong>
            <span className="brand-subtitle">MOLECULAR DESIGN WORKSPACE</span>
          </span>
        </a>
        <div className="workspace-label">
          <span className="workspace-mark">G</span>
          <div>
            Mon espace de travail<small>Local · Personnel</small>
          </div>
          <Icon name="chevron-down" size={15} />
        </div>
        <div className="nav-group-label">ESPACE DE TRAVAIL</div>
        <nav aria-label="Navigation principale">
          {nav.map((item) => (
            <button
              key={item.page}
              className={'nav-button ' + (page === item.page ? 'active' : '')}
              onClick={() => go(item.page)}
              title={item.label}
              aria-label={item.label}
            >
              <Icon name={item.icon} size={19} />
              <span>{item.label}</span>
              {item.page === 'sequences' && (
                <small className="nav-count">{state.sequences.length}</small>
              )}
              {item.page === 'primers' && (
                <small className="nav-count">{state.primers.length}</small>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-projects">
          <div className="nav-group-label">
            PROJETS ÉPINGLÉS
            <button
              className="button icon-button ghost"
              aria-label="Créer un projet"
              onClick={() => setDialog({ type: 'project' })}
            >
              <Icon name="plus" size={15} />
            </button>
          </div>
          {projects
            .filter((p) => p.pinned)
            .slice(0, 5)
            .map((p) => (
              <button
                className="nav-button pinned-project"
                key={p.id}
                onClick={() => openProject(p.id)}
              >
                <span className="project-dot" style={{ background: p.color }} />
                <span className="trunc">{p.name}</span>
              </button>
            ))}
          {!projects.some((p) => p.pinned) && (
            <p className="sidebar-hint">Épinglez vos projets pour les retrouver ici.</p>
          )}
        </div>
        <div className="sidebar-bottom">
          <div className="local-card">
            <Icon name="shield" size={18} />
            <div>
              <strong>Votre science, en local.</strong>
              <p>Aucun compte distant requis.</p>
            </div>
          </div>
          <button
            className={'nav-button ' + (page === 'settings' ? 'active' : '')}
            onClick={() => go('settings')}
            aria-label="Préférences & sauvegardes"
          >
            <Icon name="settings" size={19} />
            <span>Préférences & sauvegardes</span>
          </button>
          <div className="sidebar-footer">
            <span className="avatar">
              {state.settings.name
                ? state.settings.name
                    .split(' ')
                    .map((w) => w[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase()
                : 'GF'}
            </span>
            <div className="user-meta">
              <strong>{profileName}</strong>
              <span>{state.settings.organization || 'Profil local'}</span>
            </div>
            <span className="status-dot" />
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumbs">
            <Icon name="folder" size={16} />
            <span>Espace de travail</span>
            <Icon name="chevron-right" size={13} />
            <strong>
              {page === 'settings' ? 'Préférences' : nav.find((n) => n.page === page)?.label}
            </strong>
          </div>
          <div className="topbar-actions">
            <button className="search-trigger" onClick={() => setDialog({ type: 'search' })}>
              <Icon name="search" size={16} />
              <span>Rechercher</span>
              <kbd>Ctrl K</kbd>
            </button>
            <span className="local-badge">
              <span className="status-dot" />
              En local
            </span>
          </div>
        </header>
        <main className="page" id="main-content">
          {saveError && (
            <div className="notice error" role="alert">
              <strong>Enregistrement impossible.</strong> {saveError}
              <button className="button small ghost" onClick={() => setSaveError('')}>
                Masquer
              </button>
            </div>
          )}
          {page === 'dashboard' && (
            <>
              <Heading
                eyebrow="VOTRE LABORATOIRE NUMÉRIQUE"
                title={
                  state.settings.name
                    ? 'Bonjour, ' + state.settings.name.split(' ')[0] + ' 👋'
                    : 'Bienvenue dans GeneForge'
                }
                actions={
                  <button className="button primary" onClick={() => setDialog({ type: 'project' })}>
                    <Icon name="plus" />
                    Nouveau projet
                  </button>
                }
              >
                Un espace pour vos séquences, vos idées et vos prochaines découvertes.
              </Heading>
              <section className="welcome-panel">
                <div>
                  <span className="eyebrow">DE LA SÉQUENCE À LA COMPRÉHENSION</span>
                  <h2>
                    Votre travail moléculaire.
                    <br />
                    Clair, organisé, à portée de main.
                  </h2>
                  <p>
                    Éditez vos séquences et retrouvez vos amorces
                    <br className="desktop-break" /> dans un espace entièrement local.
                  </p>
                  <button className="button secondary" onClick={importSequences}>
                    <Icon name="upload" />
                    Importer une séquence
                  </button>
                </div>
                <div className="molecule-art" aria-hidden="true">
                  <div className="art-label">
                    <span className="status-dot" />
                    SEQUENCE WORKSPACE
                  </div>
                  <div className="art-grid">
                    <span>5′</span>
                    <Bases sequence="ACGTTGCATGCA" />
                    <span>3′</span>
                    <span></span>
                    <span className="base-bonds">│ │ │ │ │ │ │ │ │ │ │ │</span>
                    <span></span>
                    <span>3′</span>
                    <Bases sequence="TGCAACGTACGT" />
                    <span>5′</span>
                  </div>
                  <div className="art-ruler">
                    <span>01</span>
                    <span>06</span>
                    <span>12</span>
                  </div>
                  <span className="art-caption">EXEMPLE ILLUSTRATIF · ADN DOUBLE BRIN</span>
                </div>
              </section>
              <div className="stat-grid">
                {[
                  {
                    label: 'Projets',
                    value: state.projects.length,
                    icon: 'folder',
                    target: 'projects',
                  },
                  {
                    label: 'Séquences ADN',
                    value: state.sequences.length,
                    icon: 'dna',
                    target: 'sequences',
                  },
                  {
                    label: 'Amorces enregistrées',
                    value: state.primers.length,
                    icon: 'library',
                    target: 'primers',
                  },
                  {
                    label: 'Amorces favorites',
                    value: state.primers.filter((p) => p.favorite).length,
                    icon: 'star',
                    target: 'primers',
                  },
                ].map((s) => (
                  <button
                    key={s.label}
                    className="stat-card"
                    onClick={() => {
                      go(s.target as Page);
                      if (s.label === 'Amorces favorites') setPrimerFilter('favorites');
                    }}
                  >
                    <div className="stat-top">
                      <span className="stat-label">{s.label}</span>
                      <Icon name={s.icon} size={19} />
                    </div>
                    <strong className="stat-value">{number(s.value)}</strong>
                    <span className="stat-caption">
                      Dans votre espace <Icon name="arrow-right" size={13} />
                    </span>
                  </button>
                ))}
              </div>
              <div className="section-heading">
                <h2>Accès rapide</h2>
                <span className="muted">L’essentiel, en un clic</span>
              </div>
              <div className="quick-actions">
                {[
                  {
                    icon: 'dna',
                    title: 'Nouvelle séquence',
                    text: 'Créer et éditer de l’ADN',
                    action: newSequence,
                  },
                  {
                    icon: 'library',
                    title: 'Ajouter une amorce',
                    text: 'Enrichir votre bibliothèque',
                    action: () => setDialog({ type: 'primer' }),
                  },
                  {
                    icon: 'flask',
                    title: 'Analyser un oligo',
                    text: 'Composition et Tm Primer3',
                    action: () => go('oligo'),
                  },
                ].map((a) => (
                  <button key={a.title} className="quick-action" onClick={a.action}>
                    <span className="quick-icon">
                      <Icon name={a.icon} />
                    </span>
                    <span>
                      <strong>{a.title}</strong>
                      <small>{a.text}</small>
                    </span>
                    <Icon name="arrow-right" size={16} />
                  </button>
                ))}
              </div>
              <div className="section-heading">
                <h2>
                  Vos projets <span className="count-pill">{state.projects.length}</span>
                </h2>
                <button className="text-link" onClick={() => go('projects')}>
                  Tous les projets <Icon name="arrow-right" size={14} />
                </button>
              </div>
              {projects.length ? (
                <div className="project-grid">{projectCards(projects.slice(0, 3))}</div>
              ) : (
                <div className="panel">
                  <Empty
                    title="Votre prochain projet commence ici"
                    icon="folder"
                    action={
                      <div className="heading-actions">
                        <button
                          className="button primary"
                          onClick={() => setDialog({ type: 'project' })}
                        >
                          <Icon name="plus" />
                          Créer un projet
                        </button>
                        <button
                          className="button secondary"
                          disabled={busy}
                          onClick={() => void seed()}
                        >
                          Explorer un exemple
                        </button>
                      </div>
                    }
                  >
                    Créez votre premier projet ou découvrez l’application avec des données
                    artificielles.
                  </Empty>
                </div>
              )}
              <div className="section-heading">
                <h2>Séquences récentes</h2>
                <span className="muted">Dernières modifications</span>
              </div>
              <div className="panel">
                {recent.length ? (
                  <div className="activity-list">
                    {recent.map((s) => (
                      <button
                        className="activity-item"
                        key={s.id}
                        onClick={() => openSequence(s.id)}
                      >
                        <span className="activity-icon">
                          <Icon name="dna" />
                        </span>
                        <span className="activity-name">
                          <strong>{s.name}</strong>
                          <small>{state.projects.find((p) => p.id === s.projectId)?.name}</small>
                        </span>
                        <span className="tag">{number(s.sequence.length)} nt</span>
                        <span className="muted">{date(s.updatedAt)}</span>
                        <Icon name="chevron-right" size={16} />
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="recent-empty">
                    Les séquences créées ou importées apparaîtront ici.
                  </p>
                )}
              </div>
            </>
          )}
          {page === 'projects' && (
            <>
              <Heading
                eyebrow="ORGANISER"
                title="Projets"
                actions={
                  <button className="button primary" onClick={() => setDialog({ type: 'project' })}>
                    <Icon name="plus" />
                    Nouveau projet
                  </button>
                }
              >
                Regroupez vos séquences et associez vos amorces à vos travaux.
              </Heading>
              <div className="toolbar filter-bar">
                <Icon name="search" />
                <input
                  className="input"
                  aria-label="Rechercher un projet"
                  placeholder="Rechercher un projet…"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                />
              </div>
              {projects.length ? (
                <div className="project-grid">
                  {projectCards(
                    projects.filter((p) =>
                      (p.name + ' ' + p.description).toLowerCase().includes(query),
                    ),
                  )}
                </div>
              ) : (
                <div className="panel">
                  <Empty
                    title="Aucun projet pour le moment"
                    action={
                      <button
                        className="button primary"
                        onClick={() => setDialog({ type: 'project' })}
                      >
                        Créer un projet
                      </button>
                    }
                  >
                    Un projet permet de regrouper vos séquences et vos notes.
                  </Empty>
                </div>
              )}
            </>
          )}
          {page === 'sequences' &&
            (active ? (
              <SequenceEditor
                key={active.id}
                record={active}
                state={state}
                commit={commit}
                busy={busy}
                setDirty={setDirty}
                notify={notify}
                onBack={() => go('sequences')}
                onOpenSource={(kind, id) => {
                  if (kind === 'sequence') openSequence(id);
                  else {
                    const primer = state.primers.find((p) => p.id === id);
                    if (primer) setDialog({ type: 'primer', primer });
                  }
                }}
              />
            ) : (
              <>
                <Heading
                  eyebrow="EXPLORER & ÉDITER"
                  title="Séquences ADN"
                  actions={
                    <>
                      <button className="button secondary" onClick={importSequences}>
                        <Icon name="upload" />
                        Importer FASTA
                      </button>
                      <button className="button primary" onClick={newSequence}>
                        <Icon name="plus" />
                        Nouvelle séquence
                      </button>
                    </>
                  }
                >
                  Vos documents ADN, avec statistiques et édition locale.
                </Heading>
                <div className="toolbar filter-bar">
                  <Icon name="search" />
                  <input
                    className="input"
                    aria-label="Rechercher une séquence"
                    placeholder="Nom, notes ou séquence…"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                  />
                  <select
                    className="select"
                    aria-label="Filtrer par projet"
                    value={projectFilter}
                    onChange={(e) => setProjectFilter(e.target.value)}
                  >
                    <option value="">Tous les projets</option>
                    {projects.map((p) => (
                      <option value={p.id} key={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <button
                    className="button secondary"
                    disabled={!filteredSequences.some((s) => s.sequence.length)}
                    onClick={() =>
                      download(
                        exportFasta(filteredSequences.filter((s) => s.sequence.length)),
                        'sequences-geneforge.fasta',
                      )
                    }
                  >
                    <Icon name="download" />
                    FASTA
                  </button>
                </div>
                <div className="panel">
                  {filteredSequences.length ? (
                    <div className="table-wrap">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Nom de la séquence</th>
                            <th>Projet</th>
                            <th>Longueur</th>
                            <th>GC</th>
                            <th>Topologie</th>
                            <th>Modifiée</th>
                            <th>
                              <span className="sr-only">Actions</span>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredSequences.map((s) => (
                            <tr key={s.id}>
                              <td>
                                <button className="table-name" onClick={() => openSequence(s.id)}>
                                  <Icon name="dna" />
                                  {s.name}
                                </button>
                              </td>
                              <td>{state.projects.find((p) => p.id === s.projectId)?.name}</td>
                              <td className="mono">{number(s.sequence.length)} nt</td>
                              <td className="mono">{percent(sequenceStats(s.sequence).gc)}</td>
                              <td>
                                <span className="tag">
                                  {s.topology === 'linear' ? 'Linéaire' : 'Circulaire'}
                                </span>
                              </td>
                              <td className="muted">{date(s.updatedAt)}</td>
                              <td>
                                <button
                                  className="button icon-button ghost"
                                  aria-label={'Supprimer ' + s.name}
                                  disabled={busy}
                                  onClick={() => {
                                    if (
                                      window.confirm(
                                        'Supprimer définitivement la séquence « ' +
                                          s.name +
                                          ' » ? Exportez une sauvegarde pour la conserver.',
                                      )
                                    )
                                      void commit(
                                        (x) => ({
                                          ...x,
                                          sequences: x.sequences.filter((a) => a.id !== s.id),
                                        }),
                                        'Séquence supprimée.',
                                      );
                                  }}
                                >
                                  <Icon name="trash" size={16} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <Empty
                      icon="dna"
                      title="Aucune séquence à afficher"
                      action={
                        <button className="button secondary" onClick={importSequences}>
                          <Icon name="upload" />
                          Importer un fichier FASTA
                        </button>
                      }
                    >
                      Créez une séquence, importez un fichier ou modifiez les filtres.
                    </Empty>
                  )}
                </div>
              </>
            ))}
          {page === 'primers' && (
            <>
              <Heading
                eyebrow="VOTRE COLLECTION"
                title="Bibliothèque d’amorces"
                actions={
                  <>
                    <button
                      className="button secondary"
                      onClick={() => setDialog({ type: 'import', kind: 'primer' })}
                    >
                      <Icon name="upload" />
                      Importer
                    </button>
                    <button
                      className="button primary"
                      onClick={() => setDialog({ type: 'primer' })}
                    >
                      <Icon name="plus" />
                      Ajouter une amorce
                    </button>
                  </>
                }
              >
                Une collection unique, réutilisable dans plusieurs projets.
              </Heading>
              <div className="toolbar filter-bar">
                <Icon name="search" />
                <input
                  className="input"
                  aria-label="Rechercher une amorce"
                  placeholder="Nom, séquence, tag ou notes…"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                />
                <select
                  className="select"
                  aria-label="Statut des amorces"
                  value={primerFilter}
                  onChange={(e) => {
                    setPrimerFilter(e.target.value);
                    setSelected([]);
                  }}
                >
                  <option value="active">Actives</option>
                  <option value="favorites">Favorites</option>
                  <option value="archived">Archivées</option>
                  <option value="all">Toutes</option>
                </select>
                <select
                  className="select"
                  aria-label="Trier les amorces"
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                >
                  <option value="name">Trier par nom</option>
                  <option value="length">Par longueur</option>
                  <option value="gc">Par GC</option>
                </select>
                <button
                  className="button secondary"
                  disabled={!filteredPrimers.length && !selected.length}
                  onClick={exportPrimers}
                >
                  <Icon name="download" />
                  {selected.length ? selected.length + ' sélectionnée(s)' : 'CSV'}
                </button>
              </div>
              <div className="panel">
                {filteredPrimers.length ? (
                  <div className="table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>
                            <input
                              type="checkbox"
                              aria-label="Sélectionner toutes les amorces visibles"
                              checked={
                                filteredPrimers.length > 0 &&
                                filteredPrimers.every((p) => selected.includes(p.id))
                              }
                              onChange={(e) =>
                                setSelected(
                                  e.target.checked ? filteredPrimers.map((p) => p.id) : [],
                                )
                              }
                            />
                          </th>
                          <th>Nom / séquence 5′ → 3′</th>
                          <th>Longueur</th>
                          <th>GC</th>
                          <th>Tm Wallace¹</th>
                          <th>Tags</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredPrimers.map((p) => {
                          const a = analyzeOligo(p.sequence);
                          return (
                            <tr key={p.id}>
                              <td>
                                <input
                                  type="checkbox"
                                  aria-label={'Sélectionner ' + p.name}
                                  checked={selected.includes(p.id)}
                                  onChange={(e) =>
                                    setSelected((ids) =>
                                      e.target.checked
                                        ? [...ids, p.id]
                                        : ids.filter((id) => id !== p.id),
                                    )
                                  }
                                />
                              </td>
                              <td>
                                <button
                                  className="table-name"
                                  onClick={() => setDialog({ type: 'primer', primer: p })}
                                >
                                  {p.name}
                                  <span className="muted small-text">
                                    {p.orientation === 'other' ? '' : p.orientation}
                                  </span>
                                </button>
                                <div className="primer-sequence">
                                  <Bases sequence={p.sequence.slice(0, 36)} />
                                  {p.sequence.length > 36 ? '…' : ''}
                                </div>
                              </td>
                              <td className="mono">{p.sequence.length} nt</td>
                              <td className="mono">{percent(a.stats.gc)}</td>
                              <td className="mono">
                                {a.wallaceTm === null ? '—' : a.wallaceTm + ' °C'}
                              </td>
                              <td>
                                {p.tags.slice(0, 2).map((tag) => (
                                  <span key={tag} className="tag">
                                    {tag}
                                  </span>
                                ))}
                              </td>
                              <td>
                                <div className="table-actions">
                                  <button
                                    className={
                                      'button icon-button ghost ' +
                                      (p.favorite ? 'is-favorite' : '')
                                    }
                                    disabled={busy}
                                    title="Favori"
                                    aria-label={'Favori ' + p.name}
                                    onClick={() =>
                                      void commit((s) => ({
                                        ...s,
                                        primers: s.primers.map((a) =>
                                          a.id === p.id ? { ...a, favorite: !a.favorite } : a,
                                        ),
                                      }))
                                    }
                                  >
                                    <Icon name="star" size={16} />
                                  </button>
                                  <button
                                    className="button icon-button ghost"
                                    title="Analyser"
                                    aria-label={'Analyser ' + p.name}
                                    onClick={() => analyzePrimer(p)}
                                  >
                                    <Icon name="flask" size={16} />
                                  </button>
                                  <button
                                    className="button icon-button ghost"
                                    disabled={busy}
                                    title={p.status === 'active' ? 'Archiver' : 'Restaurer'}
                                    aria-label={
                                      (p.status === 'active' ? 'Archiver ' : 'Restaurer ') + p.name
                                    }
                                    onClick={() =>
                                      void commit(
                                        (s) => ({
                                          ...s,
                                          primers: s.primers.map((a) =>
                                            a.id === p.id
                                              ? {
                                                  ...a,
                                                  status:
                                                    p.status === 'active' ? 'archived' : 'active',
                                                  updatedAt: now(),
                                                }
                                              : a,
                                          ),
                                        }),
                                        p.status === 'active'
                                          ? 'Amorce archivée.'
                                          : 'Amorce restaurée.',
                                      )
                                    }
                                  >
                                    <Icon
                                      name={p.status === 'active' ? 'archive' : 'refresh'}
                                      size={16}
                                    />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Empty
                    title="Votre collection est prête à accueillir vos amorces"
                    icon="library"
                    action={
                      <button
                        className="button primary"
                        onClick={() => setDialog({ type: 'primer' })}
                      >
                        <Icon name="plus" />
                        Ajouter une amorce
                      </button>
                    }
                  >
                    Ajoutez une entrée, importez une collection ou modifiez vos filtres.
                  </Empty>
                )}
              </div>
              <p className="muted small-text">
                ¹ Estimation de Wallace, sans correction saline, uniquement pour 14–20 bases non
                ambiguës. Ouvrez l’analyseur pour calculer la Tm avec Primer3.
              </p>
            </>
          )}
          {page === 'oligo' && (
            <OligoAnalyzer
              key={oligoKey}
              initialSequence={oligoSequence}
              onSave={(sequence) => setDialog({ type: 'primer', sequence })}
            />
          )}
          {page === 'settings' && (
            <SettingsPage
              key={state.revision}
              state={state}
              commit={commit}
              busy={busy}
              onRestore={restore}
              notify={notify}
            />
          )}
          {page === 'notes' && (
            <NotesPage
              key={activeNote ?? 'notes'}
              initialId={activeNote}
              state={state}
              commit={commit}
              busy={busy}
              setDirty={setDirty}
              notify={notify}
              onOpenGel={(id) => {
                if (!canLeave()) return;
                setDirty(false);
                setActiveGel(id);
                setPage('gels');
              }}
            />
          )}
          {page === 'gels' && (
            <GelStudio
              state={state}
              commit={commit}
              busy={busy}
              setDirty={setDirty}
              notify={notify}
              activeId={activeGel}
              onActive={(id, force) => {
                if (!force && !canLeave()) return;
                setDirty(false);
                setActiveGel(id);
              }}
              onPrimer={(id) => {
                const primer = state.primers.find((p) => p.id === id);
                if (primer) setDialog({ type: 'primer', primer });
              }}
            />
          )}
          {page === 'assistant' && (
            <AssistantPage
              state={state}
              commit={commit}
              notify={notify}
              onSource={(kind, id) => {
                if (kind === 'sequence') openSequence(id);
                else if (kind === 'project') openProject(id);
                else if (kind === 'primer') {
                  const primer = state.primers.find((p) => p.id === id);
                  if (primer) setDialog({ type: 'primer', primer });
                } else if (kind === 'gel') {
                  setActiveGel(id);
                  setPage('gels');
                } else if (kind === 'note') {
                  setActiveNote(id);
                  setPage('notes');
                }
              }}
            />
          )}
        </main>
        <footer className="statusbar">
          <span>
            <span className={'status-dot ' + (dirty ? 'unsaved' : '')} />
            {busy
              ? 'Enregistrement…'
              : dirty
                ? 'Modifications non enregistrées'
                : 'Espace enregistré localement'}
          </span>
          <span>
            SQLite · Révision {state.revision}
            <span className="status-separator">|</span>GeneForge 0.4.0
          </span>
        </footer>
      </div>
      {dialog?.type === 'project' && (
        <ProjectForm
          state={state}
          commit={commit}
          busy={busy}
          onClose={closeDialog}
          project={dialog.project}
        />
      )}
      {dialog?.type === 'sequence' && (
        <SequenceForm
          state={state}
          commit={commit}
          busy={busy}
          onClose={closeDialog}
          projectId={projectFilter}
          onCreated={openSequence}
        />
      )}
      {dialog?.type === 'primer' && (
        <PrimerForm
          state={state}
          commit={commit}
          busy={busy}
          onClose={closeDialog}
          primer={dialog.primer}
          initialSequence={dialog.sequence}
        />
      )}
      {dialog?.type === 'import' && (
        <ImportForm
          state={state}
          commit={commit}
          busy={busy}
          onClose={closeDialog}
          projectId={projectFilter}
          kind={dialog.kind}
        />
      )}
      {dialog?.type === 'search' && (
        <Search
          state={state}
          onClose={closeDialog}
          onSequence={openSequence}
          onProject={(id) => {
            setDialog(null);
            openProject(id);
          }}
          onPrimer={(p) => setDialog({ type: 'primer', primer: p })}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          <Icon name="check" size={17} />
          {toast}
          <button
            className="button icon-button ghost"
            aria-label="Masquer la notification"
            onClick={() => setToast('')}
          >
            <Icon name="x" size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
function Search({
  state,
  onClose,
  onSequence,
  onProject,
  onPrimer,
}: {
  state: WorkspaceState;
  onClose: () => void;
  onSequence: (id: string) => void;
  onProject: (id: string) => void;
  onPrimer: (p: Primer) => void;
}) {
  const [search, setSearch] = useState('');
  const query = search.trim().toLowerCase();
  const projects = state.projects.filter((p) =>
    (p.name + ' ' + p.description).toLowerCase().includes(query),
  );
  const sequences = state.sequences.filter((s) =>
    (s.name + ' ' + s.sequence + ' ' + s.notes).toLowerCase().includes(query),
  );
  const primers = state.primers.filter((p) =>
    (p.name + ' ' + p.sequence + ' ' + p.notes + ' ' + p.tags.join(' '))
      .toLowerCase()
      .includes(query),
  );
  return (
    <Modal title="Rechercher dans votre espace" onClose={onClose}>
      <div className="modal-body">
        <input
          autoFocus
          className="input"
          aria-label="Recherche globale"
          placeholder="Un projet, une séquence, un tag…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="search-results">
          {projects.slice(0, 5).map((p) => (
            <button className="search-result" key={p.id} onClick={() => onProject(p.id)}>
              <Icon name="folder" />
              <span>{p.name}</span>
              <small>Projet</small>
            </button>
          ))}
          {sequences.slice(0, 8).map((s) => (
            <button className="search-result" key={s.id} onClick={() => onSequence(s.id)}>
              <Icon name="dna" />
              <span>{s.name}</span>
              <small>Séquence</small>
            </button>
          ))}
          {primers.slice(0, 8).map((p) => (
            <button className="search-result" key={p.id} onClick={() => onPrimer(p)}>
              <Icon name="library" />
              <span>{p.name}</span>
              <small>Amorce</small>
            </button>
          ))}
          {!projects.length && !sequences.length && !primers.length && (
            <p className="muted">Aucun résultat.</p>
          )}
        </div>
      </div>
    </Modal>
  );
}
