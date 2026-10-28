// Transférer une revue vers une autre bibliothèque (ou collection) Zotero.
//
// Copier des références d'une bibliothèque à l'autre crée de nouvelles fiches
// Zotero, avec de nouvelles clés. On associe donc chaque référence de la revue
// à celle de la destination (DOI, puis titre et année, puis titre très proche),
// on montre le bilan, puis on crée une nouvelle revue où tout le travail est
// rattaché aux nouvelles clés. La revue d'origine n'est pas modifiée.
import type { Project, RecordItem, ZoteroLibrary } from '../types';
import { newProject } from './frameworks';
import { normalizeDoi, normalizeForCompare, similarity } from './text';

export type MatchHow = 'doi' | 'titre' | 'proche';

export interface MatchResult {
  /** Clé d'origine -> clé dans la destination. */
  pairs: Record<string, string>;
  how: Record<string, MatchHow>;
  /** Associations à vérifier : titre seulement proche, ou année différente. */
  doubtful: string[];
  /** Références de la revue introuvables dans la destination. */
  unmatched: string[];
  /** Références de la destination qui ne correspondent à rien dans la revue. */
  newInTarget: string[];
}

const yearClose = (a: number | null, b: number | null) => !a || !b || Math.abs(a - b) <= 1;

/** Plus le score est haut, plus deux fiches se ressemblent (pour départager des doublons). */
function closeness(a: RecordItem, b: RecordItem): number {
  let s = 0;
  if (a.title === b.title) s += 2;
  if (a.year === b.year) s += 1;
  if (a.itemType === b.itemType) s += 1;
  if (a.date === b.date) s += 1;
  if (a.sources.join('|') === b.sources.join('|')) s += 2;
  if ((a.publication || '') === (b.publication || '')) s += 1;
  return s;
}

export function matchRecords(src: RecordItem[], dst: RecordItem[]): MatchResult {
  const used = new Set<string>();
  const pairs: Record<string, string> = {};
  const how: Record<string, MatchHow> = {};
  const doubtful: string[] = [];
  const byDoi = new Map<string, RecordItem[]>();
  const byTitle = new Map<string, RecordItem[]>();
  for (const r of dst) {
    const d = normalizeDoi(r.doi);
    if (d) byDoi.set(d, [...(byDoi.get(d) ?? []), r]);
    const t = normalizeForCompare(r.title);
    if (t) byTitle.set(t, [...(byTitle.get(t) ?? []), r]);
  }
  const best = (r: RecordItem, cands: RecordItem[] | undefined) =>
    (cands ?? []).filter((c) => !used.has(c.key)).sort((a, b) => closeness(r, b) - closeness(r, a))[0];
  const take = (r: RecordItem, c: RecordItem, h: MatchHow, doubt = false) => {
    pairs[r.key] = c.key;
    how[r.key] = h;
    used.add(c.key);
    if (doubt) doubtful.push(r.key);
  };

  // 1. Même DOI. 2. Même titre. (Les fiches les plus sûres d'abord.)
  const rest: RecordItem[] = [];
  for (const r of src) {
    const c = normalizeDoi(r.doi) ? best(r, byDoi.get(normalizeDoi(r.doi))) : undefined;
    if (c) take(r, c, 'doi');
    else rest.push(r);
  }
  const rest2: RecordItem[] = [];
  for (const r of rest) {
    const c = best(r, byTitle.get(normalizeForCompare(r.title)));
    if (c) take(r, c, 'titre', !yearClose(r.year, c.year));
    else rest2.push(r);
  }
  // 3. Titre très proche (même année), toujours à vérifier.
  const unmatched: string[] = [];
  for (const r of rest2) {
    const t = normalizeForCompare(r.title);
    let top: { c: RecordItem; s: number } | null = null;
    if (t.length >= 12)
      for (const c of dst) {
        if (used.has(c.key) || !yearClose(r.year, c.year)) continue;
        const s = similarity(t, normalizeForCompare(c.title));
        if (s >= 0.9 && (!top || s > top.s)) top = { c, s };
      }
    if (top) take(r, top.c, 'proche', true);
    else unmatched.push(r.key);
  }
  return { pairs, how, doubtful, unmatched, newInTarget: dst.filter((r) => !used.has(r.key)).map((r) => r.key) };
}

const remapKeys = <T,>(m: Record<string, T>, pairs: Record<string, string>): Record<string, T> =>
  Object.fromEntries(Object.entries(m).flatMap(([k, v]) => (pairs[k] ? [[pairs[k], v]] : [])));

export interface TransferTarget {
  library: ZoteroLibrary;
  collection: { key: string; name: string };
  records: RecordItem[];
  sources: Project['sources'];
  sourceMap: Record<string, string>;
  libraryVersion: number | null;
}

/** Ce que le transfert emporte, pour le bilan. */
export function transferSummary(p: Project, pairs: Record<string, string>) {
  const count = (m: Record<string, unknown>) => Object.keys(m).filter((k) => pairs[k]).length;
  return {
    screening: [count(p.screening), Object.keys(p.screening).length],
    fulltext: [count(p.fulltext), Object.keys(p.fulltext).length],
    classified: [count(Object.fromEntries(Object.entries(p.organisation.assignments).filter(([, v]) => v.length))), Object.values(p.organisation.assignments).filter((v) => v.length).length],
    duplicates: [Object.entries(p.duplicates).filter(([d, k]) => pairs[d] && (!k || pairs[k])).length, Object.keys(p.duplicates).length],
  };
}

/** Nouvelle revue, reliée à la destination, avec tout le travail rattaché aux nouvelles clés. */
export function transferProject(p: Project, t: TransferTarget, pairs: Record<string, string>, now = new Date()): Project {
  const base = newProject(p.name);
  const org = p.organisation;
  const duplicates = Object.fromEntries(
    Object.entries(p.duplicates).flatMap(([d, k]) => (pairs[d] && (!k || pairs[k]) ? [[pairs[d], k ? pairs[k] : '']] : [])),
  );
  const notDuplicateGroups = p.notDuplicateGroups.flatMap((id) => {
    const keys = id.split('+').map((k) => pairs[k]);
    return keys.every(Boolean) ? [[...keys].sort().join('+')] : [];
  });
  const records = Object.fromEntries(t.records.map((r) => [r.key, r]));
  const project: Project = {
    ...p,
    id: crypto.randomUUID(),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    library: t.library,
    sourceCollection: t.collection,
    sources: t.sources.map((s) => p.sources.find((x) => x.name === s.name) ?? s),
    zoteroCollections: {},
    zoteroNotes: {},
    records,
    duplicates,
    notDuplicateGroups,
    screening: remapKeys(p.screening, pairs),
    fulltext: remapKeys(p.fulltext, pairs),
    notRetrieved: remapKeys(p.notRetrieved, pairs),
    rayyanLabels: remapKeys(p.rayyanLabels, pairs),
    ai: { ...p.ai, suggestions: remapKeys(p.ai.suggestions, pairs) },
    // Le classement est recréé dans la nouvelle bibliothèque (collection « Biblikube – … »).
    organisation: {
      ...org,
      rootMode: 'litflow',
      rootKey: null,
      categories: org.categories.map((c) => ({ ...c, zoteroKey: null, syncedName: null })),
      assignments: remapKeys(org.assignments, pairs),
      markerAssignments: remapKeys(org.markerAssignments, pairs),
      deletedZoteroKeys: [],
      structureDirty: org.categories.length > 0,
    },
    sync: { ...base.sync, auto: p.sync.auto, tagPrefix: p.sync.tagPrefix, writeNotes: p.sync.writeNotes, sourceMap: t.sourceMap, libraryVersion: t.libraryVersion },
  };
  // Tout ce qui porte une décision ou un classement doit être écrit dans la nouvelle bibliothèque.
  const touched = new Set([
    ...Object.keys(project.screening),
    ...Object.keys(project.fulltext),
    ...Object.keys(project.duplicates),
    ...Object.keys(project.notRetrieved),
    ...Object.keys(project.rayyanLabels),
    ...Object.entries(project.organisation.assignments).filter(([, v]) => v.length).map(([k]) => k),
    ...Object.entries(project.organisation.markerAssignments).filter(([, v]) => v.length).map(([k]) => k),
  ]);
  project.sync.pending = [...touched].filter((k) => records[k]);
  return project;
}
