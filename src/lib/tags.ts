// Marqueurs Zotero de la personne (ses « tags » à elle, pas les étiquettes LF:
// de Biblikube) : liste, variantes, fusion réversible, familles.
//
// Les fusions ne touchent que les références de la revue. Chaque fusion garde,
// pour chaque fiche, les marqueurs d'avant : on peut donc la défaire.
import type { Project, RecordItem, TagFamily, TagOp } from '../types';
import { normalizeForCompare, similarity } from './text';

/** Marqueurs de la personne sur une référence (sans les étiquettes techniques de Biblikube). */
export const userTags = (p: Project, r: RecordItem) => {
  const pre = `${p.sync.tagPrefix.trim() || 'LF'}:`;
  return r.zoteroTags.filter((t) => !t.startsWith(pre));
};

/** Marqueur -> références de la revue qui le portent (doublons écartés). */
export function tagIndex(p: Project): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const r of Object.values(p.records)) {
    if (r.key in p.duplicates) continue;
    for (const t of userTags(p, r)) m.set(t, [...(m.get(t) ?? []), r.key]);
  }
  return new Map([...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'fr', { sensitivity: 'base' })));
}

/** Forme de comparaison : sans majuscules, accents, ponctuation ni pluriel simple. */
export function tagKey(t: string): string {
  return normalizeForCompare(t.replace(/[-_/]+/g, ' '))
    .split(' ')
    .map((w) => (w.length > 3 ? w.replace(/(s|x)$/, '') : w))
    .join(' ');
}

/** Groupes de marqueurs qui semblent être des variantes les uns des autres. */
export function variantGroups(index: Map<string, string[]>): string[][] {
  const tags = [...index.keys()];
  const parent = new Map(tags.map((t) => [t, t]));
  const find = (t: string): string => (parent.get(t) === t ? t : find(parent.get(t)!));
  const join = (a: string, b: string) => parent.set(find(a), find(b));
  const keys = tags.map(tagKey);
  for (let i = 0; i < tags.length; i++)
    for (let j = i + 1; j < tags.length; j++) {
      if (keys[i] === keys[j] || (keys[i].length >= 6 && keys[j].length >= 6 && similarity(keys[i], keys[j]) >= 0.88)) join(tags[i], tags[j]);
    }
  const groups = new Map<string, string[]>();
  for (const t of tags) groups.set(find(t), [...(groups.get(find(t)) ?? []), t]);
  const n = (t: string) => index.get(t)?.length ?? 0;
  return [...groups.values()]
    .filter((g) => g.length > 1)
    .map((g) => g.sort((a, b) => n(b) - n(a)))
    .sort((a, b) => b.reduce((s, t) => s + n(t), 0) - a.reduce((s, t) => s + n(t), 0));
}

/** Nouvelle liste de marqueurs d'une fiche (les étiquettes techniques et les types sont gardés). */
export function changeTags<T extends { tag: string }>(tags: T[], remove: string[], add: string[]): { tag: string }[] {
  const kept: { tag: string }[] = tags.filter((t) => !remove.includes(t.tag));
  for (const a of add) if (!kept.some((t) => t.tag === a)) kept.push({ tag: a });
  return kept;
}

/** Fusion : fiches concernées et, pour chacune, ses marqueurs d'avant (parmi ceux qui changent). */
export function planMerge(p: Project, sources: string[], target: string): TagOp {
  const items: TagOp['items'] = {};
  const involved = [...new Set([...sources, target])];
  for (const r of Object.values(p.records)) {
    const mine = userTags(p, r);
    if (!sources.some((s) => mine.includes(s))) continue;
    items[r.key] = { had: involved.filter((t) => mine.includes(t)) };
  }
  return { id: crypto.randomUUID(), at: new Date().toISOString(), kind: 'merge', target, sources: sources.filter((s) => s !== target), items };
}

/** Parent écrit dans Zotero : ajouté aux fiches qui ont un marqueur de la famille. */
export function planParent(p: Project, family: TagFamily): TagOp {
  const items: TagOp['items'] = {};
  for (const r of Object.values(p.records)) {
    const mine = userTags(p, r);
    if (!family.children.some((c) => mine.includes(c)) || mine.includes(family.name)) continue;
    items[r.key] = { had: [] };
  }
  return { id: crypto.randomUUID(), at: new Date().toISOString(), kind: 'parent', target: family.name, sources: family.children, items };
}

/** Ce qu'il faut retirer et ajouter sur une fiche pour appliquer (ou défaire) une opération. */
export function opChange(op: TagOp, key: string, undo = false): { remove: string[]; add: string[] } {
  const had = op.items[key]?.had ?? [];
  if (op.kind === 'parent') return undo ? { remove: [op.target], add: [] } : { remove: [], add: [op.target] };
  if (!undo) return { remove: op.sources, add: [op.target] };
  return { remove: had.includes(op.target) ? [] : [op.target], add: had.filter((t) => t !== op.target) };
}

/** La référence porte-t-elle ce marqueur (ou un marqueur de cette famille) ? */
export function hasTagOrFamily(p: Project, r: RecordItem, value: string): boolean {
  const mine = userTags(p, r);
  if (value.startsWith('famille:')) {
    const fam = p.tagWork?.families.find((f) => f.id === value.slice(8));
    return !!fam && (mine.includes(fam.name) || fam.children.some((c) => mine.includes(c)));
  }
  return mine.includes(value);
}

/** Palette de Zotero pour les marqueurs en couleur. */
export const ZOTERO_COLORS = ['#FF6666', '#FF8C19', '#999999', '#5FB236', '#009980', '#2EA8E5', '#576DD9', '#A28AE5', '#A6507B'];
