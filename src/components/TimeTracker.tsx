// Minuterie : mesure le temps actif pendant qu'une revue est ouverte, et
// fenêtre « Mes séances ». Voir src/lib/timeLog.ts pour les règles.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Timer, X } from 'lucide-react';
import { useProject } from '../store';
import { saveProject } from '../lib/storage';
import { formatDuration, recordActivity, recordReturn, sessionRows, summarize, totalDecisions } from '../lib/timeLog';
import { setAsideDecisions, setAsideText } from '../lib/prisma';
import type { TimeSession } from '../types';
import { Portal } from './Portal';

/** Enregistre ce délai au plus tard (et à chaque changement d'écran ou de fenêtre). */
const FLUSH_MS = 5 * 60_000;

/**
 * Suit les gestes de la personne et renvoie les séances à jour.
 * `measured` : faux sur les écrans dont le temps ne compte pas (tri terminé,
 * texte intégral).
 */
export function useTimeTracker(view: string, measured: boolean): TimeSession[] {
  const { project, update } = useProject();
  const log = useRef<TimeSession[]>(project.timeLog ?? []);
  const saved = useRef(log.current);
  const viewRef = useRef(view);
  const measuredRef = useRef(measured);
  measuredRef.current = measured;
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
      if (document.visibilityState !== 'visible' || !measuredRef.current) return;
      const now = Date.now();
      if (e.type === 'pointermove') {
        if (now - lastMove < 10_000) return;
        lastMove = now;
      }
      log.current = recordActivity(log.current, now, viewRef.current);
    };
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
      if (!measuredRef.current) {
        leftAt = null;
        return;
      }
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
    if (measuredRef.current) log.current = recordActivity(log.current, Date.now(), viewRef.current);
    setLive(log.current);
    return () => {
      events.forEach((t) => window.removeEventListener(t, onActivity, { capture: true }));
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
  const decided = { screening: Object.keys(project.screening).length, fulltext: Object.keys(project.fulltext).length };
  const aside = setAsideText(setAsideDecisions(project, 'screening'));
  const stages = Object.entries(s.byView)
    .filter(([v, ms]) => ms >= 30_000 && v !== 'fulltext')
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

          {(stages.length > 0 || decided.fulltext > 0) && (
            <div className="sessions-stages">
              <div className="small muted">Par étape</div>
              {stages.map(([v, ms]) => (
                <div key={v} className="sessions-stage">
                  <strong>{labels[v] ?? v}</strong>
                  <span>{formatDuration(ms)}</span>
                  <span className="muted small">
                    {v === 'screening' && decided.screening > 0 && `${decided.screening} décision${decided.screening > 1 ? 's' : ''} prise${decided.screening > 1 ? 's' : ''}`}
                    {v === 'screening' && s.screening.perHour != null && ` · rythme : ≈ ${s.screening.perHour} décisions par heure`}
                  </span>
                </div>
              ))}
              {decided.fulltext > 0 && (
                <div className="sessions-stage">
                  <strong>{labels.fulltext ?? 'Texte intégral'}</strong>
                  <span className="muted">non mesuré</span>
                  <span className="muted small">
                    {decided.fulltext} décision{decided.fulltext > 1 ? 's' : ''} prise{decided.fulltext > 1 ? 's' : ''} · la lecture se fait dans Zotero
                  </span>
                </div>
              )}
              {aside && <div className="small muted">ℹ️ Parmi les décisions de tri prises, {aside} : le travail compte ici, mais plus dans l’avancement du tri.</div>}
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
                Chaque geste compte (clic, touche, défilement, souris), sur tous les écrans : hésiter devant un article ou relire la
                liste des références fait partie du travail. Après 2 minutes sans aucun geste, le compteur se met en pause.
              </li>
              <li>
                Si vous allez dans un autre onglet ou une autre application et revenez dans les 5 minutes, ce temps compte. Sinon, il
                ne compte pas.
              </li>
              <li>
                Ne comptent pas : l’écran de tri quand il ne reste plus rien à trier, et le texte intégral (la lecture se fait dans
                Zotero, trop difficile à mesurer pour l’instant). Une séance de moins d’une minute n’est pas affichée.
              </li>
              <li>Une nouvelle séance commence après 30 minutes d’absence.</li>
              <li>
                Toutes les décisions prises comptent, même sur des références écartées ensuite (doublons, références retirées) : le
                travail a été fait. Un article inclus au tri puis décidé au texte intégral compte une fois dans chaque étape.
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
