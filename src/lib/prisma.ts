import type { Project, RecordItem, SourceKind } from '../types';

/** Type de source d'une référence (base de données, registre ou autre méthode). */
export function recordKind(p: Project, r: RecordItem): SourceKind {
  const kinds = r.sources.map((s) => p.sources.find((x) => x.name === s)?.kind ?? 'database');
  if (kinds.length === 0) return 'database';
  if (kinds.includes('database')) return 'database';
  if (kinds.includes('register')) return 'register';
  return 'other';
}

export const isDuplicate = (p: Project, key: string) => key in p.duplicates;

/** Références à trier sur titre/résumé (hors doublons et hors « autres méthodes »). */
export function screeningKeys(p: Project): string[] {
  return Object.values(p.records)
    .filter((r) => !isDuplicate(p, r.key) && recordKind(p, r) !== 'other')
    .map((r) => r.key);
}

/**
 * Références à évaluer en texte intégral : incluses au tri, plus celles trouvées
 * par d'autres méthodes (citations, sites web) qui n'ont pas de tri titre/résumé
 * dans le diagramme PRISMA 2020.
 */
export function fulltextKeys(p: Project): string[] {
  return Object.values(p.records)
    .filter((r) => {
      if (isDuplicate(p, r.key)) return false;
      if (recordKind(p, r) === 'other') return true;
      return p.screening[r.key]?.decision === 'include';
    })
    .map((r) => r.key);
}

/**
 * Décisions prises sur des références écartées ensuite : marquées comme doublons,
 * ou retirées de la revue (plus dans la collection Zotero). Le travail a été
 * fait, mais ces décisions ne comptent plus dans l'avancement : on le signale.
 */
export function setAsideDecisions(p: Project, stage: 'screening' | 'fulltext'): { duplicates: number; removed: number } {
  let duplicates = 0;
  let removed = 0;
  for (const key of Object.keys(p[stage])) {
    if (!p.records[key]) removed++;
    else if (isDuplicate(p, key)) duplicates++;
  }
  return { duplicates, removed };
}

/**
 * Phrase courte sur les décisions prises sur des articles écartés ensuite, ex.
 * « 3 articles déjà triés ont ensuite été marqués comme doublons ». `n` : nombre
 * d'articles (0 : rien à signaler).
 */
export function setAsideNote(a: { duplicates: number; removed: number }, stage: 'screening' | 'fulltext'): { n: number; text: string } {
  const n = a.duplicates + a.removed;
  if (!n) return { n, text: '' };
  const pl = n > 1;
  const done = stage === 'screening' ? (pl ? 'déjà triés' : 'déjà trié') : pl ? 'déjà évalués' : 'déjà évalué';
  const head = `${n} article${pl ? 's' : ''} ${done} ${pl ? 'ont' : 'a'} ensuite été`;
  if (!a.removed) return { n, text: `${head} marqué${pl ? 's' : ''} comme doublon${pl ? 's' : ''}` };
  if (!a.duplicates) return { n, text: `${head} retiré${pl ? 's' : ''} de la collection Zotero` };
  return {
    n,
    text: `${head} écartés (${a.duplicates} doublon${a.duplicates > 1 ? 's' : ''}, ${a.removed} retiré${a.removed > 1 ? 's' : ''} de la collection Zotero)`,
  };
}

export interface Column {
  sought: number;
  notRetrieved: number;
  assessed: number;
  excludedByReason: [string, number][];
  excluded: number;
  pending: number;
  included: number;
}

export interface PrismaCounts {
  databases: [string, number][];
  registers: [string, number][];
  identifiedDatabases: number;
  identifiedRegisters: number;
  duplicates: number;
  automationExcluded: number;
  otherRemoved: number;
  screened: number;
  screeningExcluded: number;
  screeningPending: number;
  main: Column;
  otherMethods: [string, number][];
  otherIdentified: number;
  other: Column | null;
  totalIncluded: number;
}

function column(p: Project, keys: string[]): Column {
  const assessedKeys = keys.filter((k) => !(k in p.notRetrieved));
  const reasons = new Map<string, number>();
  let excluded = 0;
  let included = 0;
  let pending = 0;
  for (const k of assessedKeys) {
    const d = p.fulltext[k];
    if (d?.decision === 'exclude') {
      excluded++;
      const reason = d.reasons[0] || 'Raison non précisée';
      reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
    } else if (d?.decision === 'include') included++;
    else pending++;
  }
  return {
    sought: keys.length,
    notRetrieved: keys.length - assessedKeys.length,
    assessed: assessedKeys.length,
    excludedByReason: [...reasons].sort((a, b) => b[1] - a[1]),
    excluded,
    pending,
    included,
  };
}

function countBy(list: string[]): [string, number][] {
  const m = new Map<string, number>();
  for (const s of list) m.set(s, (m.get(s) ?? 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1]);
}

export function computePrisma(p: Project): PrismaCounts {
  const records = Object.values(p.records);
  const withKind = records.map((r) => ({ r, kind: recordKind(p, r) }));
  const sourceNames = (kind: SourceKind) =>
    withKind.flatMap(({ r }) =>
      (r.sources.length ? r.sources : ['Sans source']).filter(
        (s) => (p.sources.find((x) => x.name === s)?.kind ?? 'database') === kind,
      ),
    );

  const databases = countBy(sourceNames('database'));
  const registers = countBy(sourceNames('register'));
  const mainRecords = withKind.filter((x) => x.kind !== 'other').map((x) => x.r);
  const duplicates = mainRecords.filter((r) => isDuplicate(p, r.key)).length;

  const screen = screeningKeys(p);
  let screeningExcluded = 0;
  let screeningPending = 0;
  for (const k of screen) {
    const d = p.screening[k]?.decision;
    if (d === 'exclude') screeningExcluded++;
    else if (d !== 'include') screeningPending++;
  }
  const soughtMain = screen.filter((k) => p.screening[k]?.decision === 'include');

  const otherRecords = withKind.filter((x) => x.kind === 'other' && !isDuplicate(p, x.r.key)).map((x) => x.r);
  const otherMethods: [string, number][] = [
    ...countBy(sourceNames('other')),
    ...p.manualCounts.otherMethodsIdentified.filter((m) => m.n > 0).map((m) => [m.name, m.n] as [string, number]),
  ];
  const otherIdentified = otherMethods.reduce((s, [, n]) => s + n, 0);
  const main = column(p, soughtMain);
  const other = otherIdentified > 0 ? column(p, otherRecords.map((r) => r.key)) : null;

  return {
    databases,
    registers,
    identifiedDatabases: databases.reduce((s, [, n]) => s + n, 0),
    identifiedRegisters: registers.reduce((s, [, n]) => s + n, 0),
    duplicates,
    automationExcluded: p.manualCounts.automationExcluded,
    otherRemoved: p.manualCounts.otherRemoved,
    screened: screen.length,
    screeningExcluded,
    screeningPending,
    main,
    otherMethods,
    otherIdentified,
    other,
    totalIncluded: main.included + (other?.included ?? 0),
  };
}
