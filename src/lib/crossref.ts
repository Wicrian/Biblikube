// Crossref : la base publique des éditeurs (DOI). Biblikube y envoie seulement
// le DOI ou le titre de la référence vérifiée, jamais rien de personnel.
import type { Creator, RecordItem } from '../types';
import type { FieldId, Issue } from './citeCheck';
import { normalizeForCompare as normalizeTitle } from './text';
import type { Suggestion } from './citeSuggest';

const API = 'https://api.crossref.org/works';
const FIELDS = 'DOI,title,author,editor,container-title,volume,issue,page,article-number,issued,publisher,type';

export interface CrossrefPerson {
  given?: string;
  family?: string;
  name?: string;
}

export interface CrossrefWork {
  DOI: string;
  title?: string[];
  author?: CrossrefPerson[];
  editor?: CrossrefPerson[];
  'container-title'?: string[];
  volume?: string;
  issue?: string;
  page?: string;
  'article-number'?: string;
  issued?: { 'date-parts'?: (number | null)[][] };
  publisher?: string;
  type?: string;
}

export const cleanDoi = (doi: string) =>
  doi
    .trim()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '')
    .replace(/[.,;)\]]+$/, '');

export async function crossrefByDoi(doi: string): Promise<CrossrefWork | null> {
  const res = await fetch(`${API}/${encodeURIComponent(cleanDoi(doi))}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Crossref ${res.status}`);
  return ((await res.json()) as { message: CrossrefWork }).message;
}

const yearOf = (w: CrossrefWork) => w.issued?.['date-parts']?.[0]?.[0] ?? null;

/** Cherche par le titre ; ne garde qu'un résultat au titre identique (et de la même année, si connue). */
export async function crossrefByTitle(r: RecordItem): Promise<CrossrefWork | null> {
  if (r.title.trim().length < 15) return null;
  const q = new URLSearchParams({ 'query.bibliographic': r.title, rows: '5', select: FIELDS });
  const res = await fetch(`${API}?${q}`);
  if (!res.ok) throw new Error(`Crossref ${res.status}`);
  const items = ((await res.json()) as { message: { items: CrossrefWork[] } }).message.items ?? [];
  const want = normalizeTitle(r.title);
  const family = r.creators.find((c) => c.lastName)?.lastName?.toLowerCase();
  return (
    items.find((w) => {
      if (normalizeTitle(w.title?.[0] ?? '') !== want) return false;
      const y = yearOf(w);
      if (r.year && y && Math.abs(r.year - y) > 1) return false;
      if (family && w.author?.length && !w.author.some((a) => a.family?.toLowerCase() === family)) return false;
      return true;
    }) ?? null
  );
}

const person = (p: CrossrefPerson, creatorType: string): Creator =>
  p.family ? { lastName: p.family, firstName: p.given ?? '', creatorType } : { name: p.name ?? '', creatorType };

export const creatorsText = (cs: Creator[]) => cs.map((c) => (c.name ? c.name : [c.lastName, c.firstName].filter(Boolean).join(', '))).join(' ; ');

/** Propositions tirées d'une notice Crossref, pour les champs qui posent problème. */
export function crossrefSuggestions(
  r: RecordItem,
  w: CrossrefWork,
  issues: Issue[],
  source: 'crossref' | 'crossref-pdf' | 'crossref-title',
  note?: string,
): Suggestion[] {
  const flagged = new Set<FieldId>(issues.map((i) => i.field));
  const out: Suggestion[] = [];
  const add = (field: FieldId, value: string | undefined | null, extra: Partial<Suggestion> = {}) => {
    if (!value || !flagged.has(field)) return;
    out.push({ field, value, source, note, ...extra });
  };
  if (source === 'crossref-title' && !r.doi) {
    out.push({ field: 'doi', value: w.DOI, source, note: `Notice trouvée sur Crossref : « ${w.title?.[0] ?? ''} »${yearOf(w) ? ` (${yearOf(w)})` : ''}. Vérifiez que c’est bien le même texte.` });
  }
  if (r.itemType === 'journalArticle') {
    add('publication', w['container-title']?.[0]);
    add('volume', w.volume);
    add('issue', w.issue);
    add('pages', w.page ?? w['article-number'], w.page ? {} : { note: 'Numéro d’article (la revue ne pagine pas).' });
  }
  if (r.itemType === 'bookSection') {
    add('bookTitle', w['container-title']?.[0]);
    add('pages', w.page);
    add('publisher', w.publisher);
    if (w.editor?.length) {
      const eds = w.editor.map((e) => person(e, 'editor'));
      add('editors', creatorsText(eds), { creators: eds });
    }
  }
  if (r.itemType === 'book') add('publisher', w.publisher);
  if (w.author?.length && flagged.has('creators')) {
    const au = w.author.map((a) => person(a, 'author'));
    add('creators', creatorsText(au), { creators: au });
  }
  const y = yearOf(w);
  if (y) add('date', String(y));
  return out;
}

/** DOI trouvé dans le texte des premières pages d'un PDF. */
export function findDoi(text: string): string | null {
  const m = text.replace(/\s+/g, ' ').match(/\b(?:doi\.org\/|doi:?\s*)?(10\.\d{4,9}\/[^\s"<>]+)/i);
  return m ? cleanDoi(m[1]) : null;
}
