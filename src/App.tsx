import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ClipboardList, Compass, Copy, FileCheck, FileText, GitFork, Home as HomeIcon, Layers, LayoutGrid, Library, Minus, Palette, Plus, RefreshCw, Search, Settings as SettingsIcon, Table2 } from 'lucide-react';
import type { Project, Settings } from './types';
import { deleteProject, listProjects, loadSettings, saveProject, saveSettings } from './lib/storage';
import { ProjectProvider, useProject } from './store';
import { Home } from './components/Home';
import { SettingsDialog } from './components/SettingsDialog';
import { ThemePicker } from './components/ThemePicker';
import { Protocol } from './components/Protocol';
import { ImportView } from './components/ImportView';
import { Dedup } from './components/Dedup';
import { Review } from './components/Review';
import { Records } from './components/Records';
import { Prisma } from './components/Prisma';
import { Organisation } from './components/Organisation';
import { SearchStrategy } from './components/SearchStrategy';
import { fulltextKeys, screeningKeys } from './lib/prisma';
import { findDuplicateGroups } from './lib/dedup';
import { IS_TEST } from './lib/env';
import { firstView, visibleViews, type ViewId } from './lib/guide';
import { Onboarding } from './components/Onboarding';
import { Guide } from './components/Guide';
import { Fiches } from './components/Fiches';
import { SessionsDialog, TimePill, useTimeTracker } from './components/TimeTracker';
import { QuestionLine } from './components/QuestionLine';

type View = ViewId;

export default function App() {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [projects, setProjects] = useState<Project[]>([]);
  const [current, setCurrent] = useState<Project | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showTheme, setShowTheme] = useState(false);

  const refresh = () => listProjects().then(setProjects);
  useEffect(() => void refresh(), []);
  // Ouvrir une autre revue depuis une revue (ex. après un transfert vers une autre bibliothèque).
  useEffect(() => {
    const onOpen = (e: Event) => setCurrent((e as CustomEvent<Project>).detail);
    window.addEventListener('biblikube:open-project', onOpen);
    return () => window.removeEventListener('biblikube:open-project', onOpen);
  }, []);

  const open = async (p: Project) => {
    await saveProject(p);
    setCurrent(p);
  };

  return (
    <>
      {IS_TEST && (
        <div className="test-banner">
          🧪 VERSION TEST : vos revues ici sont séparées de Biblikube officiel. Utilisez la démo ou une bibliothèque Zotero de test.
        </div>
      )}
      {current ? (
        <ProjectProvider key={current.id} initial={current} settings={settings}>
          <ProjectShell
            onHome={() => {
              setCurrent(null);
              void refresh();
            }}
            onSettings={() => setShowSettings(true)}
            onTheme={() => setShowTheme(true)}
          />
        </ProjectProvider>
      ) : (
        <Frame
          rail={
            <>
              <RailItem icon={<HomeIcon />} label="Accueil" active onClick={() => undefined} />
              <span className="spacer" />
              <RailItem icon={<Palette />} label="Style" onClick={() => setShowTheme(true)} />
              <RailItem icon={<SettingsIcon />} label="Zotero" onClick={() => setShowSettings(true)} />
            </>
          }
        >
          <Home
            projects={projects}
            settings={settings}
            onOpen={open}
            onDelete={async (id) => {
              await deleteProject(id);
              void refresh();
            }}
            onSettings={() => setShowSettings(true)}
            onTheme={() => setShowTheme(true)}
          />
        </Frame>
      )}
      {showTheme && <ThemePicker onClose={() => setShowTheme(false)} />}
      {showSettings && (
        <SettingsDialog
          settings={settings}
          onClose={() => setShowSettings(false)}
          onSave={(s) => {
            saveSettings(s);
            setSettings(s);
          }}
        />
      )}
    </>
  );
}

/** Cadre commun : grand panneau arrondi avec une barre d'icônes à gauche. */
function Frame({ rail, children, onLogo }: { rail: ReactNode; children: ReactNode; onLogo?: () => void }) {
  return (
    <div className="app">
      <div className="frame">
        <aside className="rail">
          <button className="logo" onClick={onLogo} title="Biblikube – accueil">
            <img src={`${import.meta.env.BASE_URL}logo.png`} alt="" />
          </button>
          {rail}
        </aside>
        <div className="content">{children}</div>
      </div>
    </div>
  );
}

function RailItem({ icon, label, count, active, onClick, alert, badge, pulse }: { icon: ReactNode; label: string; count?: string; active?: boolean; alert?: boolean; badge?: string; pulse?: boolean; onClick: () => void }) {
  return (
    <button className={`rail-item ${active ? 'active' : ''} ${pulse ? 'pulse' : ''}`} onClick={onClick} title={label}>
      <span className="rail-icon">
        {icon}
        {alert && <span className="rail-alert" />}
      </span>
      <span className="rail-label">
        {label}
        {badge && <span className="rail-badge">{badge}</span>}
      </span>
      {count && <span className="rail-count">{count}</span>}
    </button>
  );
}

const VIEWS: Record<View, { label: string; title: string; subtitle: string; icon: ReactNode; badge?: string }> = {
  protocol: { label: 'Protocole', title: 'Protocole', subtitle: 'Question, cadre, critères et raisons de votre revue', icon: <ClipboardList /> },
  search: { label: 'Recherche', title: 'Stratégie de recherche', subtitle: 'Concepts, mots-clés et équation adaptée à chaque base de données', icon: <Search />, badge: 'test' },
  import: { label: 'Identification', title: 'Identification', subtitle: 'Vos références lues directement dans Zotero', icon: <Library /> },
  dedup: { label: 'Doublons', title: 'Doublons', subtitle: 'Repérer et écarter les notices en double', icon: <Copy /> },
  screening: { label: 'Tri', title: 'Tri titre-résumé', subtitle: 'Glissez : à droite inclure, à gauche exclure, en haut incertain', icon: <Layers /> },
  fulltext: { label: 'Texte intégral', title: 'Texte intégral', subtitle: 'Lisez dans Zotero, décidez ici ou par étiquettes', icon: <FileText /> },
  organisation: { label: 'Organisation', title: 'Organisation', subtitle: 'Votre propre classement — seul ou combiné à la revue systématique', icon: <LayoutGrid /> },
  fiches: { label: 'Fiches', title: 'Fiches Zotero', subtitle: 'Vérifier que vos références sont complètes selon la norme choisie', icon: <FileCheck />, badge: 'test' },
  records: { label: 'Références', title: 'Références', subtitle: 'Toutes vos références, filtrables et exportables', icon: <Table2 /> },
  prisma: { label: 'PRISMA', title: 'Diagramme PRISMA 2020', subtitle: 'Calculé automatiquement à partir de vos décisions', icon: <GitFork /> },
};

/** Groupes ouverts au départ, selon le parcours choisi au démarrage (sans parcours : tous). */
const OPEN_BY_MODE: Record<string, string[]> = {
  organise: ['Trier', 'Organiser'],
  sort: ['Trier', 'Organiser'],
  systematic: ['Préparer', 'Trier', 'Organiser'],
};

const defaultGroups = (mode?: string) => Object.fromEntries(GROUPS.map((g) => [g.label, OPEN_BY_MODE[mode ?? '']?.includes(g.label) ?? true]));

/** Les étapes regroupées en grandes familles, comme sur la page d'accueil. */
const GROUPS: { label: string; views: View[] }[] = [
  { label: 'Préparer', views: ['protocol', 'search'] },
  { label: 'Trier', views: ['import', 'dedup', 'screening', 'fulltext'] },
  { label: 'Organiser', views: ['organisation', 'fiches'] },
  { label: 'Résultats', views: ['records', 'prisma'] },
];

function ProjectShell({ onHome, onSettings, onTheme }: { onHome: () => void; onSettings: () => void; onTheme: () => void }) {
  const { project, update, syncStatus, syncNow, client, pullNow, pullInfo, clearPullInfo } = useProject();
  const hasRecords = Object.keys(project.records).length > 0;
  const [view, setViewState] = useState<View>(() =>
    project.mode ? (hasRecords ? (project.mode === 'organise' ? 'organisation' : 'screening') : 'import') : hasRecords ? 'screening' : project.library ? 'import' : 'protocol',
  );
  const [pulse, setPulse] = useState<View | null>(null);
  // Groupes ouverts dans la barre : au départ selon le parcours choisi, puis comme la personne les laisse
  // (gardé pour cette revue, dans ce navigateur).
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem(`litflow.railOpen.${project.id}`);
      if (saved) return JSON.parse(saved);
    } catch {
      /* rien */
    }
    return defaultGroups(project.mode);
  });
  // Parcours choisi au démarrage (après la création de la revue) : on part de ses groupes, tant que rien n'a été changé à la main.
  useEffect(() => {
    try {
      if (localStorage.getItem(`litflow.railOpen.${project.id}`)) return;
    } catch {
      /* rien */
    }
    setOpenGroups(defaultGroups(project.mode));
  }, [project.mode, project.id]);
  // En arrivant sur une étape (clic, guide…), son groupe s'ouvre ; on peut ensuite le refermer.
  useEffect(() => {
    const label = GROUPS.find((g) => g.views.includes(view))?.label;
    if (!label) return;
    setOpenGroups((cur) => {
      if (cur[label]) return cur;
      const next = { ...cur, [label]: true };
      try {
        localStorage.setItem(`litflow.railOpen.${project.id}`, JSON.stringify(next));
      } catch {
        /* rien */
      }
      return next;
    });
  }, [view, project.id]);
  // Chronométrés : le tri titre-résumé (tant qu'il reste des articles à trier) et l'organisation.
  const measured = view === 'organisation' || (view === 'screening' && screeningKeys(project).some((k) => !project.screening[k]));
  const timeLog = useTimeTracker(view, measured);
  // Retour visuel du bouton « Synchroniser » : il tourne, puis dit ce qu'il a fait.
  const [manualSync, setManualSync] = useState<{ state: 'running' } | { state: 'done'; at: string } | null>(null);
  const runManualSync = async () => {
    if (manualSync?.state === 'running') return;
    setManualSync({ state: 'running' });
    const started = Date.now();
    await syncNow();
    await pullNow();
    // Relit aussi la liste des collections Zotero (écran Identification).
    window.dispatchEvent(new Event('biblikube:reload-collections'));
    // Au moins 0,8 s de rotation : sinon on ne voit pas que le clic a été pris en compte.
    await new Promise((r) => setTimeout(r, Math.max(0, 800 - (Date.now() - started))));
    const d = new Date();
    setManualSync({ state: 'done', at: `${d.getHours()} h ${String(d.getMinutes()).padStart(2, '0')}` });
    setTimeout(() => setManualSync((cur) => (cur?.state === 'done' ? null : cur)), 5000);
  };
  const [showSessions, setShowSessions] = useState(false);
  const setView = (v: View) => {
    setViewState(v);
    if (project.guide?.active && !project.guide.visited.includes(v))
      update((cur) => ({ ...cur, guide: { ...cur.guide!, visited: [...cur.guide!.visited, v] } }));
  };
  /** Depuis le guide : ouvre l'écran et fait briller son bouton dans la barre. */
  const go = (v: View) => {
    setView(v);
    setPulse(v);
    setTimeout(() => setPulse(null), 2400);
  };

  const screen = screeningKeys(project);
  const ft = fulltextKeys(project);
  const dupOpen = useMemo(
    () =>
      findDuplicateGroups(Object.values(project.records).filter((r) => !(r.key in project.duplicates))).filter(
        (g) => !project.notDuplicateGroups.includes(g.id),
      ).length,
    [project.records, project.duplicates, project.notDuplicateGroups],
  );

  const counts: Partial<Record<View, string>> = {
    dedup: dupOpen ? String(dupOpen) : undefined,
    screening: `${screen.filter((k) => project.screening[k]).length}/${screen.length}`,
    fulltext: `${ft.filter((k) => project.fulltext[k] || k in project.notRetrieved).length}/${ft.length}`,
    records: String(Object.keys(project.records).length),
    organisation: project.organisation.name ? String(Object.keys(project.organisation.assignments).length) : undefined,
    search: project.search.databases.length ? String(project.search.databases.length) : undefined,
  };

  const dotClass = { off: 'off', idle: '', pending: 'pending', syncing: 'pending', error: 'error' }[syncStatus.state];
  const syncLabel =
    syncStatus.state === 'off'
      ? project.library
        ? 'Zotero non connecté'
        : 'Sans Zotero'
      : syncStatus.state === 'syncing'
        ? `${syncStatus.message ?? ''} ${syncStatus.total ? `${syncStatus.done}/${syncStatus.total}` : ''}`
        : syncStatus.state === 'error'
          ? 'Erreur de synchronisation'
          : syncStatus.state === 'pending'
            ? syncStatus.message
            : 'Synchronisé avec Zotero';

  const v = VIEWS[view];
  // Barre de gauche : le groupe de l'étape en cours est toujours ouvert ; les autres s'ouvrent d'un clic.
  const groupOf = (id: View) => GROUPS.find((g) => g.views.includes(id))?.label;
  const groupSummary = (views: View[]) =>
    views.map((id) => (id === 'screening' || id === 'fulltext' || id === 'organisation' ? counts[id] : undefined)).find((c) => c && !c.endsWith('/0'));
  const isOpen = (label: string) => !!openGroups[label];
  const saveGroups = (next: Record<string, boolean>) => {
    setOpenGroups(next);
    try {
      localStorage.setItem(`litflow.railOpen.${project.id}`, JSON.stringify(next));
    } catch {
      /* rien */
    }
  };
  const toggleGroup = (label: string) => saveGroups({ ...openGroups, [label]: !openGroups[label] });
  return (
    <Frame
      onLogo={onHome}
      rail={
        <>
          <nav className="rail-nav">
            {GROUPS.map((g) => ({ ...g, views: visibleViews(project, g.views) }))
              .filter((g) => g.views.length)
              .map((g) => (
              <div key={g.label} className={`rail-group ${isOpen(g.label) ? '' : 'closed'}`}>
                <button
                  className="rail-group-label rail-group-toggle"
                  onClick={() => toggleGroup(g.label)}
                  title={isOpen(g.label) ? 'Replier' : 'Déplier'}
                  aria-expanded={isOpen(g.label)}
                >
                  {isOpen(g.label) ? '▾' : '▸'} {g.label}
                  {!isOpen(g.label) && groupSummary(g.views) && <span className="rail-group-sum">{groupSummary(g.views)}</span>}
                  {!isOpen(g.label) && g.views.includes('dedup') && dupOpen > 0 && <span className="rail-group-dot" />}
                </button>
                {g.views.map((id) => (
                  <RailItem
                    key={id}
                    icon={VIEWS[id].icon}
                    label={VIEWS[id].label}
                    badge={VIEWS[id].badge}
                    count={counts[id]}
                    alert={id === 'dedup' && dupOpen > 0}
                    active={view === id}
                    pulse={pulse === id}
                    onClick={() => setView(id)}
                  />
                ))}
              </div>
            ))}
            {project.mode && project.mode !== 'systematic' && (
              <RailItem
                icon={project.guide?.showAll ? <Minus /> : <Plus />}
                label={project.guide?.showAll ? 'Moins d’étapes' : '+ étapes'}
                onClick={() =>
                  update((cur) => ({ ...cur, guide: { wizard: false, active: false, visited: [], ...cur.guide, showAll: !cur.guide?.showAll } }))
                }
              />
            )}
          </nav>
          <span className="spacer" />
          {project.mode && !project.guide?.active && (
            <RailItem icon={<Compass />} label="Guide" onClick={() => update((cur) => ({ ...cur, guide: { wizard: false, showAll: false, visited: [], ...cur.guide, active: true } }))} />
          )}
          <div className="rail-tools">
              <button onClick={onHome} title="Mes revues">
                <HomeIcon />
                <span>Revues</span>
              </button>
              <button onClick={onTheme} title="Style">
                <Palette />
                <span>Style</span>
              </button>
              <button onClick={onSettings} title="Zotero">
                <SettingsIcon />
                <span>Zotero</span>
              </button>
          </div>
        </>
      }
    >
      <header className="page-head">
        <div className="page-title">
          <div className="eyebrow">{project.name}</div>
          <QuestionLine />
          <h1>{v.title}</h1>
          <p className="muted hide-mobile">{v.subtitle}</p>
        </div>
        <span className="spacer" />
        {(view === 'screening' || view === 'organisation') && <TimePill view={view} log={timeLog} onOpen={() => setShowSessions(true)} />}
        <span className="pill" title={syncStatus.message}>
          <span className={`sync-dot ${dotClass}`} /> <span className="hide-mobile">{syncLabel}</span>
        </span>
        {client && (
          <button
            className="btn dark"
            title="Envoyer les décisions vers Zotero et lire les changements faits dans Zotero"
            onClick={runManualSync}
            disabled={manualSync?.state === 'running'}
          >
            <RefreshCw size={16} className={syncStatus.state === 'syncing' || manualSync?.state === 'running' ? 'spin' : ''} />{' '}
            <span className="hide-mobile">
              {manualSync?.state === 'running' ? 'Synchronisation…' : manualSync?.state === 'done' ? `À jour · ${manualSync.at}` : 'Synchroniser'}
            </span>
          </button>
        )}
      </header>
      <main>
        {pullInfo && (
          <div className="notice row" style={{ marginBottom: '1rem' }}>
            Reçu de Zotero : {pullInfo.changed > 0 && `${pullInfo.changed} décision(s) modifiée(s) dans Zotero`}
            {pullInfo.changed > 0 && pullInfo.added > 0 && ' · '}
            {pullInfo.added > 0 && `${pullInfo.added} nouvelle(s) référence(s)`}
            <span className="spacer" />
            <button className="btn small" onClick={clearPullInfo}>
              OK
            </button>
          </div>
        )}
        {syncStatus.state === 'error' && <div className="notice error" style={{ marginBottom: '1rem' }}>{syncStatus.message}</div>}
        {view === 'protocol' && <Protocol />}
        {view === 'search' && <SearchStrategy />}
        {view === 'import' && <ImportView onSettings={onSettings} onDone={() => setView('dedup')} />}
        {view === 'fiches' && <Fiches />}
        {view === 'dedup' && <Dedup onDone={() => setView(project.mode === 'organise' ? 'organisation' : 'screening')} />}
        {view === 'screening' && <Review stage="screening" />}
        {view === 'fulltext' && <Review stage="fulltext" />}
        {view === 'organisation' && <Organisation />}
        {view === 'records' && <Records />}
        {view === 'prisma' && <Prisma />}
      </main>
      {showSessions && (
        <SessionsDialog
          log={timeLog}
          labels={Object.fromEntries(Object.entries(VIEWS).map(([id, x]) => [id, x.label]))}
          onClose={() => setShowSessions(false)}
        />
      )}
      {project.guide?.active && !project.guide.wizard && <Guide openDuplicates={dupOpen} onGo={go} />}
      {project.guide?.wizard && (
        <Onboarding
          onSettings={onSettings}
          onFinish={(full) => {
            update((cur) => ({ ...cur, guide: { ...cur.guide!, wizard: false, active: !full, showAll: full } }));
            setViewState(full ? (Object.keys(project.records).length ? 'screening' : 'import') : firstView(project, dupOpen));
          }}
        />
      )}
    </Frame>
  );
}
