// Garde-fou : quand Zotero change beaucoup de décisions d'un coup (un autre outil,
// un autre onglet, un déplacement massif de fiches…), Biblikube ne les reprend pas
// tout seul. Il montre ce qui changerait et attend l'accord de la personne.
import type { Project, RecordItem } from '../types';
import { mergeImport } from '../zotero/mapping';

/** À partir de ce nombre de références modifiées d'un coup, Biblikube demande avant de reprendre. */
export const PULL_GUARD = 10;

export type ChangeField = 'screening' | 'fulltext' | 'duplicate' | 'organisation';

export interface PullChange {
  key: string;
  field: ChangeField;
  from: string;
  to: string;
}

const DECISION: Record<string, string> = { include: 'inclus', exclude: 'exclu', maybe: 'incertain' };

const screeningOf = (p: Project, k: string) => DECISION[p.screening[k]?.decision ?? ''] ?? '—';
const fulltextOf = (p: Project, k: string) => (k in p.notRetrieved ? 'introuvable' : (DECISION[p.fulltext[k]?.decision ?? ''] ?? '—'));
const duplicateOf = (p: Project, k: string) => (k in p.duplicates ? 'doublon' : 'pas doublon');
function organisationOf(p: Project, k: string): string {
  const cat = new Map(p.organisation.categories.map((c) => [c.id, c.name]));
  const mk = new Map(p.organisation.markers.map((m) => [m.id, m.name]));
  const names = [
    ...(p.organisation.assignments[k] ?? []).map((id) => cat.get(id) ?? '?'),
    ...(p.organisation.markerAssignments[k] ?? []).map((id) => `★ ${mk.get(id) ?? '?'}`),
  ];
  return names.length ? names.join(', ') : '—';
}

const READERS: Record<ChangeField, (p: Project, k: string) => string> = {
  screening: screeningOf,
  fulltext: fulltextOf,
  duplicate: duplicateOf,
  organisation: organisationOf,
};

/** Ce qui change, référence par référence, entre l'état actuel et celui qu'on obtiendrait. */
export function describePull(before: Project, after: Project, keys: string[]): PullChange[] {
  const out: PullChange[] = [];
  for (const key of keys)
    for (const field of Object.keys(READERS) as ChangeField[]) {
      const from = READERS[field](before, key);
      const to = READERS[field](after, key);
      if (from !== to) out.push({ key, field, from, to });
    }
  return out;
}

/** Nombre de références touchées, par type de changement. */
export function countByField(changes: PullChange[]): Record<ChangeField, number> {
  const sets: Record<ChangeField, Set<string>> = { screening: new Set(), fulltext: new Set(), duplicate: new Set(), organisation: new Set() };
  for (const c of changes) sets[c.field].add(c.key);
  return { screening: sets.screening.size, fulltext: sets.fulltext.size, duplicate: sets.duplicate.size, organisation: sets.organisation.size };
}

/**
 * « Garder Biblikube » : on reprend seulement les nouvelles références et les fiches
 * mises à jour (titres, auteurs…), pas les décisions. Les références touchées sont
 * ensuite réécrites dans Zotero comme Biblikube les connaît.
 */
export function keepBiblikube(p: Project, incoming: RecordItem[], libraryVersion: number | null): Project {
  const fresh = incoming.filter((r) => !p.records[r.key] || r.version >= p.records[r.key].version);
  const { project } = mergeImport(p, fresh);
  return { ...project, sync: { ...project.sync, libraryVersion: libraryVersion ?? p.sync.libraryVersion, lastPull: new Date().toISOString() } };
}
