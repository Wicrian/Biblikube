// Minuterie : mesure le temps actif pendant qu'une revue est ouverte, et
// fenêtre « Mes séances ». Voir src/lib/timeLog.ts pour les règles.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Timer, X } from 'lucide-react';
import { useProject } from '../store';
import { saveProject } from '../lib/storage';
import { formatDuration, recordActivity, sessionRows, summarize } from '../lib/timeLog';
import type { TimeSession } from '../types';
import { Portal } from './Portal';

/** Enregistre ce délai au plus tard (et à chaque changement d'écran ou de fenêtre). */
const FLUSH_MS = 5 * 60_000;

/** Suit les gestes de la personne et renvoie les séances à jour. */
export function useTimeTracker(view: string): TimeSession[] {
  const { project, update } = useProject();
  const log = useRef<TimeSession[]>(project.timeLog ?? []);
  const saved = useRef(log.current);
  const viewRef = useRef(view);
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
    const onActivity = (e: Event) => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (e.type === 'pointermove') {
        if (now - lastMove < 10_000) return;
        lastMove = now;
      }
      log.current = recordActivity(log.current, now, viewRef.current);
    };
    const events = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'scroll'];
    events.forEach((t) => window.addEventListener(t, onActivity, { passive: true, capture: true }));
    const onHide = () => document.visibilityState === 'hidden' && flush();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flush);
    const tick = setInterval(() => setLive(log.current), 30_000);
    const save = setInterval(flush, FLUSH_MS);
    // Ouvrir une revue compte comme un geste.
    log.current = recordActivity(log.current, Date.now(), viewRef.current);
    setLive(log.current);
    return () => {
      events.forEach((t) => window.removeEventListener(t, onActivity, { capture: true }));
      document.removeEventListener('visibilitychange', onHide);
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
  const mainView = (v: Record<string, number>) => {
    const top = Object.entries(v).sort((a, b) => b[1] - a[1])[0];
    return top ? labels[top[0]] ?? '' : '';
  };

  return (
    <Portal>
      <div className="overlay" onClick={onClose}>
        <div className="modal stack sessions" onClick={(e) => e.stopPropagation()}>
          <div className="row">
            <h2 style={{ margin: 0 }}>Mes séances</h2>
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
              {s.perHour !== null && <div className="small muted">≈ {s.perHour} décisions à l’heure</div>}
            </div>
          </div>

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
                      <td>{r.decisions || '—'}</td>
                      <td className="hide-mobile">{r.estimated ? 'Tri' : mainView(r.views) || '—'}</td>
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
              <li>Seul le temps où vous utilisez Biblikube compte. Après 2 minutes sans geste (clic, touche, défilement), le compteur se met en pause.</li>
              <li>Une nouvelle séance commence après 30 minutes d’absence.</li>
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
