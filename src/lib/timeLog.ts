// Minuterie et séances de travail : le « temps passé dans Biblikube ».
//
// Règles (en français simple, reprises dans la fenêtre « Mes séances ») :
// - Seuls deux écrans sont chronométrés : le tri titre-résumé (tant qu'il reste
//   des articles à trier) et l'organisation. Ailleurs, rien n'est compté.
// - Chaque geste (clic, touche, défilement, souris) compte : hésiter devant un
//   article fait partie du travail. Après 2 minutes sans geste, pause.
// - Changer d'onglet ou d'application : si l'on revient dans les 5 minutes, le
//   temps passé ailleurs compte ; sinon non.
// - Après 30 minutes d'absence, une nouvelle séance commence.
// - Une séance de moins d'une minute n'est pas affichée (ouverture par erreur).
// Rien n'est envoyé ailleurs : les séances sont gardées avec la revue
// (navigateur + sauvegarde Zotero).
import type { Project, TimeSession } from '../types';

export const IDLE_MS = 2 * 60_000;
export const AWAY_MAX_MS = 5 * 60_000;
/** Séance la plus courte affichée. */
export const MIN_SESSION_MS = 60_000;
/** Écrans chronométrés. */
export const TIMED_VIEWS = ['screening', 'organisation'] as const;
const timedOnly = (views: Record<string, number>) =>
  Object.fromEntries(Object.entries(views).filter(([v]) => (TIMED_VIEWS as readonly string[]).includes(v)));
export const SESSION_GAP_MS = 30 * 60_000;

function extend(last: TimeSession, now: number, counted: number, view: string): TimeSession {
  return {
    ...last,
    end: new Date(now).toISOString(),
    activeMs: last.activeMs + counted,
    views: counted ? { ...last.views, [view]: (last.views[view] ?? 0) + counted } : last.views,
  };
}

/** Enregistre un geste fait à l'instant `now` sur l'écran `view`. */
export function recordActivity(log: TimeSession[], now: number, view: string): TimeSession[] {
  const last = log[log.length - 1];
  if (!last || now - Date.parse(last.end) > SESSION_GAP_MS) {
    const iso = new Date(now).toISOString();
    return [...log, { start: iso, end: iso, activeMs: 0, views: {} }];
  }
  const delta = now - Date.parse(last.end);
  if (delta < 0) return log;
  return [...log.slice(0, -1), extend(last, now, delta <= IDLE_MS ? delta : 0, view)];
}

/**
 * Retour dans Biblikube après être allé dans un autre onglet ou une autre
 * application (`leftAt` : moment du départ). Si l'on était actif juste avant de
 * partir et que l'absence a duré au plus 5 minutes, ce temps compte.
 */
export function recordReturn(log: TimeSession[], leftAt: number, now: number, view: string): TimeSession[] {
  const last = log[log.length - 1];
  if (!last) return log;
  const lastEnd = Date.parse(last.end);
  if (leftAt - lastEnd > IDLE_MS || now - leftAt > AWAY_MAX_MS || now < lastEnd) return log;
  return [...log.slice(0, -1), extend(last, now, now - lastEnd, view)];
}

export type Stage = 'screening' | 'fulltext';

/** Une séance affichable : mesurée, ou estimée d'après les dates des décisions. */
export interface SessionRow {
  start: number;
  end: number;
  activeMs: number;
  /** Décisions prises pendant la séance, par étape. */
  decisions: Record<Stage, number>;
  views: Record<string, number>;
  estimated: boolean;
}

export const totalDecisions = (r: SessionRow) => r.decisions.screening + r.decisions.fulltext;

/**
 * Dates des décisions de tri et de texte intégral. Toutes les décisions prises
 * comptent, même celles sur des références écartées ensuite (doublons, retirées) :
 * le travail a bien été fait (voir `setAsideDecisions` pour le signaler).
 */
function decisionTimes(p: Project): { t: number; stage: Stage }[] {
  const out: { t: number; stage: Stage }[] = [];
  for (const stage of ['screening', 'fulltext'] as const)
    for (const d of Object.values(p[stage])) {
      const t = Date.parse(d?.at ?? '');
      if (Number.isFinite(t)) out.push({ t, stage });
    }
  return out.sort((a, b) => a.t - b.t);
}

/**
 * Écarte les décisions arrivées « en rafale » (import Rayyan, changements lus
 * dans Zotero) : 5 décisions ou plus à moins de 1,5 s d'intervalle ne sont pas
 * des gestes faits à la main.
 */
export function withoutBursts<T extends { t: number }>(items: T[]): T[] {
  const out: T[] = [];
  let run: T[] = [];
  const flush = () => {
    if (run.length < 5) out.push(...run);
    run = [];
  };
  for (const it of items) {
    if (run.length && it.t - run[run.length - 1].t >= 1500) flush();
    run.push(it);
  }
  flush();
  return out;
}

/**
 * Séances estimées d'après les dates des décisions, pour la période d'avant la
 * minuterie. Approximation : on additionne les écarts de moins de 5 minutes
 * entre deux décisions (le temps de lecture avant la première n'est pas connu).
 */
export function estimatePast(p: Project, before = Infinity): SessionRow[] {
  // Le temps du texte intégral n'est pas mesuré : seules les décisions de tri servent à l'estimation.
  const items = withoutBursts(decisionTimes(p)).filter((d) => d.t < before && d.stage === 'screening');
  const rows: SessionRow[] = [];
  for (const { t, stage } of items) {
    let cur = rows[rows.length - 1];
    if (!cur || t - cur.end > SESSION_GAP_MS) {
      cur = { start: t, end: t, activeMs: 0, decisions: { screening: 0, fulltext: 0 }, views: {}, estimated: true };
      rows.push(cur);
    } else {
      const gap = t - cur.end;
      if (gap <= 5 * 60_000) {
        cur.activeMs += gap;
        cur.views[stage] = (cur.views[stage] ?? 0) + gap;
      }
      cur.end = t;
    }
    cur.decisions[stage]++;
  }
  // Une séance d'une seule décision compte pour une minute.
  for (const r of rows)
    if (!r.activeMs) {
      r.activeMs = 60_000;
      r.views = { screening: 60_000 };
    }
  return rows;
}

/** Toutes les séances qui comptent, de la plus récente à la plus ancienne. */
export function sessionRows(p: Project, log: TimeSession[] = p.timeLog ?? []): SessionRow[] {
  const items = decisionTimes(p);
  const measured: SessionRow[] = log
    .map((s) => {
      const start = Date.parse(s.start);
      const end = Date.parse(s.end);
      const decisions = { screening: 0, fulltext: 0 };
      for (const d of items) if (d.t >= start && d.t <= end) decisions[d.stage]++;
      // Seuls les écrans chronométrés comptent (des séances plus anciennes peuvent en contenir d'autres).
      const views = timedOnly(s.views);
      const activeMs = Object.values(views).reduce((a, ms) => a + ms, 0);
      const row: SessionRow = { start, end, activeMs, views, estimated: false, decisions };
      return row;
    })
    .filter((r) => r.activeMs >= MIN_SESSION_MS);
  const firstMeasured = log.length ? Date.parse(log[0].start) : Infinity;
  return [...estimatePast(p, firstMeasured), ...measured].sort((a, b) => b.start - a.start);
}

const startOfDay = (now: number) => {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

export interface StageSummary {
  ms: number;
  decisions: number;
  /** Décisions par heure (null si moins de 10 minutes ou aucune décision). */
  perHour: number | null;
}

export interface TimeSummary {
  todayMs: number;
  /** Temps d'aujourd'hui par écran (pour la pastille du tri et de l'organisation). */
  todayByView: Record<string, number>;
  weekMs: number;
  totalMs: number;
  estimatedMs: number;
  sessions: number;
  /** Temps par écran (tri, texte intégral, organisation…), toutes séances confondues. */
  byView: Record<string, number>;
  screening: StageSummary;
  fulltext: StageSummary;
}

export function summarize(rows: SessionRow[], now = Date.now()): TimeSummary {
  const today = startOfDay(now);
  const week = startOfDay(now - 6 * 86_400_000);
  const sum = (f: (r: SessionRow) => boolean) => rows.filter(f).reduce((a, r) => a + r.activeMs, 0);
  const byView: Record<string, number> = {};
  for (const r of rows) for (const [v, ms] of Object.entries(r.views)) byView[v] = (byView[v] ?? 0) + ms;
  const stage = (s: Stage): StageSummary => {
    const ms = s === 'fulltext' ? 0 : byView[s] ?? 0;
    const decisions = rows.reduce((a, r) => a + r.decisions[s], 0);
    return { ms, decisions, perHour: ms >= 10 * 60_000 && decisions ? Math.round(decisions / (ms / 3_600_000)) : null };
  };
  return {
    todayMs: sum((r) => r.end >= today),
    todayByView: rows
      .filter((r) => r.end >= today)
      .reduce<Record<string, number>>((acc, r) => {
        for (const [v, ms] of Object.entries(r.views)) acc[v] = (acc[v] ?? 0) + ms;
        return acc;
      }, {}),
    weekMs: sum((r) => r.end >= week),
    totalMs: sum(() => true),
    estimatedMs: sum((r) => r.estimated),
    sessions: rows.length,
    byView,
    screening: stage('screening'),
    fulltext: stage('fulltext'),
  };
}

/** « 1 h 05 », « 42 min », « moins d'une minute ». */
export function formatDuration(ms: number): string {
  const min = Math.round(ms / 60_000);
  if (min < 1) return 'moins d’1 min';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return `${h} h ${String(min % 60).padStart(2, '0')}`;
}
