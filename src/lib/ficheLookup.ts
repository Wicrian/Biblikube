// Recherche de propositions pour une fiche : DOI lu dans le PDF, puis Crossref
// (avec le DOI, ou à défaut avec le titre). Résultats gardés pour la séance.
import type { RecordItem } from '../types';
import type { ZoteroClient } from '../zotero/api';
import type { Issue } from './citeCheck';
import type { Suggestion } from './citeSuggest';
import { crossrefByDoi, crossrefByTitle, crossrefSuggestions, findDoi } from './crossref';
import { pdfFirstPagesText } from './pdfText';

export interface Lookup {
  suggestions: Suggestion[];
  /** Ce qui a été tenté, en français simple. */
  message: string;
}

const LOOKUP_FIELDS = new Set(['volume', 'issue', 'pages', 'doi', 'publication', 'editors', 'bookTitle', 'publisher', 'creators', 'date']);
const cache = new Map<string, Promise<Lookup>>();

export function lookupWorth(r: RecordItem, issues: Issue[]): boolean {
  return ['journalArticle', 'bookSection', 'book'].includes(r.itemType) && issues.some((i) => LOOKUP_FIELDS.has(i.field));
}

export function lookupFiche(client: ZoteroClient | null, r: RecordItem, issues: Issue[]): Promise<Lookup> {
  const id = `${r.key}:${r.version}`;
  let p = cache.get(id);
  if (!p) {
    p = run(client, r, issues);
    cache.set(id, p);
    p.catch(() => cache.delete(id));
  }
  return p;
}

async function pdfDoi(client: ZoteroClient, r: RecordItem): Promise<string | null> {
  if (!(r.numChildren ?? 0)) return null;
  const att = (await client.children(r.key)).find(
    (c) => c.data.itemType === 'attachment' && c.data.contentType === 'application/pdf' && ['imported_file', 'imported_url'].includes(c.data.linkMode ?? ''),
  );
  if (!att) return null;
  const data = await client.fileData(att.key);
  if (!data) return null;
  return findDoi(await pdfFirstPagesText(data));
}

async function run(client: ZoteroClient | null, r: RecordItem, issues: Issue[]): Promise<Lookup> {
  const out: Suggestion[] = [];
  const steps: string[] = [];
  let doi = r.doi;
  let viaPdf = false;
  if (!doi && client) {
    try {
      const found = await pdfDoi(client, r);
      if (found) {
        doi = found;
        viaPdf = true;
        out.push({ field: 'doi', value: found, source: 'pdf', note: 'Lu dans les premières pages du PDF rangé dans Zotero.' });
      } else steps.push('pas de DOI dans le PDF (ou pas de PDF sur zotero.org)');
    } catch {
      steps.push('PDF illisible');
    }
  }
  try {
    if (doi) {
      const w = await crossrefByDoi(doi);
      if (w) out.push(...crossrefSuggestions(r, w, issues, viaPdf ? 'crossref-pdf' : 'crossref').filter((s) => !(viaPdf && s.field === 'doi')));
      else steps.push('ce DOI est inconnu de Crossref');
    } else {
      const w = await crossrefByTitle(r);
      if (w) out.push(...crossrefSuggestions(r, w, issues, 'crossref-title'));
      else steps.push('aucune notice Crossref avec ce titre exact');
    }
  } catch {
    steps.push('Crossref injoignable pour le moment');
  }
  return { suggestions: out, message: steps.length ? `Recherche faite : ${steps.join(' ; ')}.` : '' };
}
