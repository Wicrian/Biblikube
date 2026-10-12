// Minuterie et séances de travail.
//
// Seul le temps « actif » compte : chaque geste (clic, touche, défilement…)
// prolonge la séance ; après 2 minutes sans geste, le compteur se met en pause
// et la séance s'arrête au dernier geste. Après 30 minutes d'absence, le geste
// suivant ouvre une nouvelle séance. Rien n'est envoyé ailleurs : les séances
// sont gardées avec la revue (navigateur + sauvegarde Zotero).
import type { Project, TimeSession } from '../types';

export const IDLE_MS = 2 * 60_000;
export const SESSION_GAP_MS = 30 * 60_000;

/** Enregistre un geste fait à l'instant `now` sur l'écran `view`. */
export function recordActivity(log: TimeSession[], now: number, view: string): TimeSession[] {
  const last = log[log.length - 1];
  const iso = new Date(now).toISOString();
  if (!last || now - Date.parse(last.end) > SESSION_GAP_MS) {
    return [...log, { start: iso, end: iso, activeMs: 0, views: {} }];
  }
  const delta = now - Date.parse(last.end);
  if (delta < 0) return log;
  const counted = delta <= IDLE_MS ? delta : 0;
  const next: TimeSession = {
    ...last,
    end: iso,
    activeMs: last.activeMs + counted,
    views: counted ? { ...last.views, [view]: (last.views[view] ?? 0) + counted } : last.views,
  };
  return [...log.slice(0, -1), next];
}

/** Une séance affichable : mesurée, ou estimée d'après les dates des décisions. */
export interface SessionRow {
  start: number;
  end: number;
  activeMs: number;
  decisions: number;
  views: Record<string, number>;
  estimated: boolean;
}

/** Dates (ms) des décisions de tri et de texte intégral. */
function decisionTimes(p: Project): number[] {
  return [...Object.values(p.screening), ...Object.values(p.fulltext)]
    .map((d) => Date.parse(d?.at ?? ''))
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b);
}

/**
 * Écarte les décisions arrivées « en rafale » (import Rayyan, changements lus
 * dans Zotero) : 5 décisions ou plus à moins de 1,5 s d'intervalle ne sont pas
 * des gestes faits à la main.
 */
export function withoutBursts(times: number[]): number[] {
  const out: number[] = [];
  let run: number[] = [];
  const flush = () => {
    if (run.length < 5) out.push(...run);
    run = [];
  };
  for (const t of times) {
    if (run.length && t - run[run.length - 1] >= 1500) flush();
    run.push(t);
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
  const times = withoutBursts(decisionTimes(p)).filter((t) => t < before);
  const rows: SessionRow[] = [];
  for (const t of times) {
    const cur = rows[rows.length - 1];
    if (!cur || t - cur.end > SESSION_GAP_MS) {
      rows.push({ start: t, end: t, activeMs: 0, decisions: 1, views: {}, estimated: true });
      continue;
    }
    const gap = t - cur.end;
    if (gap <= 5 * 60_000) cur.activeMs += gap;
    cur.end = t;
    cur.decisions++;
  }
  // Une séance d'une seule décision compte pour une minute.
  for (const r of rows) if (!r.activeMs) r.activeMs = 60_000;
  return rows;
}

/** Toutes les séances, de la plus récente à la plus ancienne. */
export function sessionRows(p: Project, log: TimeSession[] = p.timeLog ?? []): SessionRow[] {
  const times = decisionTimes(p);
  const measured: SessionRow[] = log
    .filter((s) => s.activeMs > 0)
    .map((s) => {
      const start = Date.parse(s.start);
      const end = Date.parse(s.end);
      return { start, end, activeMs: s.activeMs, views: s.views, estimated: false, decisions: times.filter((t) => t >= start && t <= end).length };
    });
  const firstMeasured = log.length ? Date.parse(log[0].start) : Infinity;
  return [...estimatePast(p, firstMeasured), ...measured].sort((a, b) => b.start - a.start);
}

const startOfDay = (now: number) => {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

export interface TimeSummary {
  todayMs: number;
  weekMs: number;
  totalMs: number;
  estimatedMs: number;
  sessions: number;
  /** Décisions par heure, sur les séances mesurées (null si trop peu de données). */
  perHour: number | null;
}

export function summarize(rows: SessionRow[], now = Date.now()): TimeSummary {
  const today = startOfDay(now);
  const week = startOfDay(now - 6 * 86_400_000);
  const sum = (f: (r: SessionRow) => boolean) => rows.filter(f).reduce((a, r) => a + r.activeMs, 0);
  const measured = rows.filter((r) => !r.estimated);
  const mMs = measured.reduce((a, r) => a + r.activeMs, 0);
  const mDec = measured.reduce((a, r) => a + r.decisions, 0);
  return {
    todayMs: sum((r) => r.end >= today),
    weekMs: sum((r) => r.end >= week),
    totalMs: sum(() => true),
    estimatedMs: sum((r) => r.estimated),
    sessions: rows.length,
    perHour: mMs >= 10 * 60_000 && mDec ? Math.round(mDec / (mMs / 3_600_000)) : null,
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
