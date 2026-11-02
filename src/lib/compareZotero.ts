// « Comparer avec Zotero » : ce que Biblikube écrirait dans Zotero (dossiers et
// étiquettes LF:) face à ce qui s'y trouve vraiment. Rien n'est modifié ici :
// on liste les écarts, la personne choisit, puis on applique.
import type { Decision, Project, StageDecision } from '../types';
import type { ZItem } from '../zotero/api';
import { desiredState } from '../zotero/sync';
import { fulltextKeys } from './prisma';

export type Field = 'screening' | 'fulltext' | 'duplicate';
/** Valeur d'une étape : décision, « introuvable », « doublon » (true) ou rien (null). */
export type Value = Decision | 'notretrieved' | boolean | null;

interface Sides {
  screening: Decision | null;
  fulltext: Decision | 'notretrieved' | null;
  duplicate: boolean;
}

const TAG: Record<string, Decision> = { inclus: 'include', exclu: 'exclude', incertain: 'maybe' };
const SCREEN_COL: Record<string, Decision> = { screening_include: 'include', screening_exclude: 'exclude', screening_maybe: 'maybe' };
const FT_COL: Record<string, Decision | 'notretrieved'> = { included: 'include', fulltext_exclude: 'exclude', fulltext_maybe: 'maybe', fulltext_notretrieved: 'notretrieved' };

function fromTags(prefix: string, tags: string[]): Sides {
  const s: Sides = { screening: null, fulltext: null, duplicate: false };
  for (const t of tags) {
    if (!t.startsWith(`${prefix}:`)) continue;
    const rest = t.slice(prefix.length + 1);
    if (rest === 'doublon') s.duplicate = true;
    const m = rest.match(/^(tri|texte):(inclus|exclu|incertain|introuvable)$/);
    if (!m) continue;
    if (m[1] === 'tri' && m[2] !== 'introuvable') s.screening = TAG[m[2]];
    if (m[1] === 'texte') s.fulltext = m[2] === 'introuvable' ? 'notretrieved' : TAG[m[2]];
  }
  return s;
}

function fromCollections(ids: string[]): Sides {
  const s: Sides = { screening: null, fulltext: null, duplicate: false };
  for (const id of ids) {
    if (id === 'duplicates') s.duplicate = true;
    if (id in SCREEN_COL) s.screening = SCREEN_COL[id];
    if (id in FT_COL) s.fulltext = FT_COL[id];
  }
  return s;
}

export interface Difference {
  key: string;
  field: Field;
  /** Ce que Biblikube écrirait (son état). */
  local: Value;
  /** Ce que Zotero dit : par le dossier, et par l'étiquette. */
  zCol: Value;
  zTag: Value;
  /** Valeur retenue si l'on « garde Zotero » (le dossier, s'il diffère ; sinon l'étiquette). */
  zotero: Value;
  /** La référence a une modification pas encore envoyée à Zotero. */
  pending: boolean;
}

/** Compare l'état attendu par Biblikube à l'état réel des fiches Zotero. */
export function compareWithZotero(p: Project, items: ZItem[]): Difference[] {
  const prefix = p.sync.tagPrefix.trim() || 'LF';
  const colIdOf = new Map(Object.entries(p.zoteroCollections).map(([id, key]) => [key, id]));
  const ft = new Set(fulltextKeys(p));
  const pending = new Set(p.sync.pending);
  const out: Difference[] = [];
  for (const it of items) {
    if (!p.records[it.key]) continue;
    const want = desiredState(p, it.key, ft);
    const expected = { cols: fromCollections(want.collections), tags: fromTags(prefix, want.tags) };
    const zc = fromCollections((it.data.collections ?? []).map((k) => colIdOf.get(k)).filter((x): x is string => !!x));
    const zt = fromTags(prefix, (it.data.tags ?? []).map((t) => t.tag));
    const fields: Field[] = expected.cols.duplicate || zc.duplicate || zt.duplicate ? ['duplicate'] : ['screening', 'fulltext'];
    for (const f of fields) {
      const local = expected.cols[f];
      const zCol = zc[f];
      const zTag = zt[f];
      if (zCol === local && zTag === local) continue;
      out.push({ key: it.key, field: f, local, zCol, zTag, zotero: zCol !== local ? zCol : zTag, pending: pending.has(it.key) });
    }
  }
  return out;
}

/** Nouvelle décision : la note est gardée ; les raisons seulement si la décision ne change pas. */
const keep = (cur: StageDecision | undefined, decision: Decision, at: string): StageDecision => ({
  decision,
  reasons: cur?.decision === decision ? cur.reasons : [],
  note: cur?.note ?? '',
  at,
});

/** Applique « garder Zotero » sur ces écarts : l'état de Biblikube prend la valeur de Zotero. */
export function keepZotero(p: Project, diffs: Difference[], now = new Date().toISOString()): Project {
  const screening = { ...p.screening };
  const fulltext = { ...p.fulltext };
  const duplicates = { ...p.duplicates };
  const notRetrieved = { ...p.notRetrieved };
  for (const d of diffs) {
    if (d.field === 'duplicate') {
      if (d.zotero) duplicates[d.key] = duplicates[d.key] ?? '';
      else delete duplicates[d.key];
    } else if (d.field === 'screening') {
      if (d.zotero) screening[d.key] = keep(screening[d.key], d.zotero as Decision, now);
      else delete screening[d.key];
    } else {
      delete notRetrieved[d.key];
      if (d.zotero === 'notretrieved') {
        notRetrieved[d.key] = now.slice(0, 10);
        delete fulltext[d.key];
      } else if (d.zotero) fulltext[d.key] = keep(fulltext[d.key], d.zotero as Decision, now);
      else delete fulltext[d.key];
    }
  }
  return { ...p, screening, fulltext, duplicates, notRetrieved };
}
