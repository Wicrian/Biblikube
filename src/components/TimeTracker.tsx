// Minuterie : mesure le temps actif pendant qu'une revue est ouverte, et
// fenêtre « Mes séances ». Voir src/lib/timeLog.ts pour les règles.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Timer, X } from 'lucide-react';
import { useProject } from '../store';
import { saveProject } from '../lib/storage';
import { IDLE_MS, formatDuration, recordActivity, recordReturn, recordWork, sessionRows, summarize, totalDecisions } from '../lib/timeLog';
import type { TimeSession } from '../types';
import { Portal } from './Portal';

/** Enregistre ce délai au plus tard (et à chaque changement d'écran ou de fenêtre). */
const FLUSH_MS = 5 * 60_000;

/**
 * Suit les gestes de la personne et renvoie les séances à jour.
 * `sorting` : on est sur le tri ou le texte intégral et il reste des articles à trier
 * (hésiter devant un article, c'est déjà travailler).
 */
export function useTimeTracker(view: string, sorting: boolean): TimeSession[] {
  const { project, update } = useProject();
  const log = useRef<TimeSession[]>(project.timeLog ?? []);
  const saved = useRef(log.current);
  const viewRef = useRef(view);
  const sortingRef = useRef(sorting);
  sortingRef.current = sorting;
  const projectRef = useRef(project);
  projectRef.current = project;
  const [live, setLive] = useState(log.current);

  // Une autre revue (ou une revue reprise depuis Zotero) : on repart de ses séances.
  useEffect(() => {
    log.current = project.timeLog ?? [];
    saved.current = log.current;
    setLive(log.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  useEffect(() => {
    const flush = () => {
      if (log.current === saved.current) return;
      saved.current = log.current;
      const next = log.current;
      update((cur) => ({ ...cur, timeLog: next }));
      // Écrit aussi tout de suite : en quittant la revue, la sauvegarde différée n'aurait pas lieu.
      void saveProject({ ...projectRef.current, timeLog: next });
    };
    let lastMove = 0;
    // Début du passage actuel sur un tri en cours : un simple clic de passage ne compte pas,
    // il faut y rester au moins 15 secondes.
    let sortingSince: { view: string; start: number; last: number } | null = null;
    const onActivity = (e: Event) => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (e.type === 'pointermove') {
        if (now - lastMove < 10_000) return;
        lastMove = now;
      }
      // Écrire dans un champ (protocole, note, commentaire), c'est travailler.
      const t = e.target as HTMLElement | null;
      const writing = e.type === 'keydown' && !!t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT' || t.isContentEditable);
      if (!sortingRef.current) sortingSince = null;
      else if (!sortingSince || sortingSince.view !== viewRef.current || now - sortingSince.last > IDLE_MS)
        sortingSince = { view: viewRef.current, start: now, last: now };
      else sortingSince.last = now;
      const hesitating = !!sortingSince && now - sortingSince.start >= 15_000;
      log.current = (hesitating || writing ? recordWork : recordActivity)(log.current, now, viewRef.current);
    };
    const onWork = () => {
      if (document.visibilityState !== 'visible') return;
      log.current = recordWork(log.current, Date.now(), viewRef.current);
      setLive(log.current);
    };
    window.addEventListener('biblikube:work', onWork);
    const events = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'scroll'];
    events.forEach((t) => window.addEventListener(t, onActivity, { passive: true, capture: true }));
    // Autre onglet ou autre application : si l'on revient dans les 15 minutes, ce temps compte.
    let leftAt: number | null = null;
    const leave = () => {
      if (leftAt === null) leftAt = Date.now();
      flush();
    };
    const back = () => {
      if (leftAt === null || document.visibilityState !== 'visible') return;
      log.current = recordReturn(log.current, leftAt, Date.now(), viewRef.current);
      leftAt = null;
      setLive(log.current);
    };
    const onVisibility = () => (document.visibilityState === 'hidden' ? leave() : back());
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', leave);
    window.addEventListener('focus', back);
    window.addEventListener('pagehide', flush);
    const tick = setInterval(() => setLive(log.current), 30_000);
    const save = setInterval(flush, FLUSH_MS);
    // Ouvrir une revue compte comme un geste.
    log.current = recordActivity(log.current, Date.now(), viewRef.current);
    setLive(log.current);
    return () => {
      events.forEach((t) => window.removeEventListener(t, onActivity, { capture: true }));
      window.removeEventListener('biblikube:work', onWork);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', leave);
      window.removeEventListener('focus', back);
      window.removeEventListener('pagehide', flush);
      clearInterval(tick);
      clearInterval(save);
      flush();
    };
  }, [update]);

  // Changement d'écran : on note l'écran et on enregistre.
  useEffect(() => {
    viewRef.current = view;
    setLive(log.current);
    if (log.current !== saved.current) {
      saved.current = log.current;
      const next = log.current;
      update((cur) => ({ ...cur, timeLog: next }));
    }
  }, [view, update]);

  return live;
}

/** Petite pastille « ⏱ 42 min aujourd'hui » dans l'en-tête. */
export function TimePill({ log, onOpen }: { log: TimeSession[]; onOpen: () => void }) {
  const { project } = useProject();
  const s = useMemo(() => summarize(sessionRows(project, log)), [project, log]);
  return (
    <button className="pill time-pill" onClick={onOpen} title="Mes séances de travail">
      <Timer size={15} /> <span>{formatDuration(s.todayMs)}</span>
      <span className="hide-mobile">aujourd’hui</span>
    </button>
  );
}

const day = new Intl.DateTimeFormat('fr-CA', { weekday: 'short', day: 'numeric', month: 'short' });
const hour = (t: number) => {
  const d = new Date(t);
  return `${d.getHours()} h ${String(d.getMinutes()).padStart(2, '0')}`;
};

/** Fenêtre « Mes séances ». */
export function SessionsDialog({ log, labels, onClose }: { log: TimeSession[]; labels: Record<string, string>; onClose: () => void }) {
  const { project } = useProject();
  const rows = useMemo(() => sessionRows(project, log), [project, log]);
  const s = summarize(rows);
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, 8);
  const stages = Object.entries(s.byView)
    .filter(([, ms]) => ms >= 30_000)
    .sort((a, b) => b[1] - a[1]);
  const mainView = (v: Record<string, number>) => {
    const top = Object.entries(v).sort((a, b) => b[1] - a[1])[0];
    return top ? labels[top[0]] ?? '' : '';
  };

  return (
    <Portal>
      <div className="overlay" onClick={onClose}>
        <div className="modal stack sessions" onClick={(e) => e.stopPropagation()}>
          <div className="row">
            <div>
              <h2 style={{ margin: 0 }}>Mes séances</h2>
              <div className="small muted">Le temps passé dans Biblikube pour cette revue</div>
            </div>
            <span className="spacer" />
            <button className="btn small" onClick={onClose} title="Fermer">
              <X size={15} />
            </button>
          </div>
          <div className="tiles sessions-tiles">
            <div className="tile t4">
              <div className="tile-label">Aujourd’hui</div>
              <div className="tile-value">{formatDuration(s.todayMs)}</div>
            </div>
            <div className="tile t1">
              <div className="tile-label">7 derniers jours</div>
              <div className="tile-value">{formatDuration(s.weekMs)}</div>
            </div>
            <div className="tile t3">
              <div className="tile-label">Depuis le début</div>
              <div className="tile-value">{formatDuration(s.totalMs)}</div>
              {s.estimatedMs > 0 && <div className="small muted">dont {formatDuration(s.estimatedMs)} estimées</div>}
            </div>
            <div className="tile t2">
              <div className="tile-label">Séances</div>
              <div className="tile-value">{s.sessions}</div>
            </div>
          </div>

          {stages.length > 0 && (
            <div className="sessions-stages">
              <div className="small muted">Par étape</div>
              {stages.map(([v, ms]) => {
                const st = v === 'screening' || v === 'fulltext' ? s[v] : null;
                return (
                  <div key={v} className="sessions-stage">
                    <strong>{labels[v] ?? v}</strong>
                    <span>{formatDuration(ms)}</span>
                    <span className="muted small">
                      {st && st.decisions > 0 && `${st.decisions} décision${st.decisions > 1 ? 's' : ''}`}
                      {st?.perHour != null && ` · rythme : ≈ ${st.perHour} décisions par heure`}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {rows.length === 0 ? (
            <p className="muted">Aucune séance pour l’instant : le compteur démarre dès que vous travaillez sur cette revue.</p>
          ) : (
            <div className="table-wrap">
              <table className="sessions-table">
                <thead>
                  <tr>
                    <th>Jour</th>
                    <th>Heures</th>
                    <th>Temps actif</th>
                    <th>Décisions</th>
                    <th className="hide-mobile">Surtout</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => (
                    <tr key={`${r.start}-${r.estimated}`} className={r.estimated ? 'estimated' : ''}>
                      <td>
                        {day.format(r.start)}
                        {r.estimated && <span className="badge maybe" style={{ marginLeft: '0.4rem' }}>estimée</span>}
                      </td>
                      <td>
                        {hour(r.start)} – {hour(r.end)}
                      </td>
                      <td>{formatDuration(r.activeMs)}</td>
                      <td>{totalDecisions(r) || '—'}</td>
                      <td className="hide-mobile">{mainView(r.views) || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {rows.length > 8 && (
            <button className="btn small" style={{ alignSelf: 'flex-start' }} onClick={() => setAll(!all)}>
              {all ? 'Voir moins' : `Voir les ${rows.length} séances`}
            </button>
          )}

          <details className="small muted">
            <summary>Comment le temps est-il compté ?</summary>
            <ul>
              <li>
                Chaque geste compte (clic, touche, défilement, souris) : hésiter devant un article fait partie du travail. Après 2
                minutes sans aucun geste, le compteur se met en pause.
              </li>
              <li>
                Si vous allez dans un autre onglet ou une autre application (par exemple Zotero) et revenez dans les 15 minutes, ce
                temps compte. Sinon, il ne compte pas.
              </li>
              <li>
                Une séance ne compte que si vous y travaillez : une décision, un classement, une note, du texte écrit, ou du temps sur
                le tri ou le texte intégral alors qu’il reste des articles à trier. Revenir regarder une revue terminée ne compte pas.
              </li>
              <li>Une nouvelle séance commence après 30 minutes d’absence.</li>
              <li>
                Les décisions comptent par étape : un article inclus au tri puis décidé au texte intégral compte une fois dans chaque
                étape. Les doublons écartés ne comptent pas.
              </li>
              <li>
                Les séances « estimées » sont reconstituées d’après l’heure de vos décisions de tri, avant l’arrivée de la minuterie :
                c’est une approximation (le temps de lecture avant la première décision n’est pas connu, et les décisions importées
                de Rayyan ou de Zotero sont ignorées).
              </li>
              <li>Ces chiffres restent avec votre revue (ce navigateur et la sauvegarde dans Zotero). Rien n’est envoyé ailleurs.</li>
            </ul>
          </details>
        </div>
      </div>
    </Portal>
  );
}
