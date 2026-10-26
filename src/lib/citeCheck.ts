// Vérification des fiches Zotero selon une norme (APA 7, adaptation UQAM).
//
// MAQUETTE : règles des cas les plus courants. Biblikube ne « certifie » pas une
// fiche : il signale ce qui manque ou semble mal rangé, et la personne décide.
import type { Creator, RecordItem } from '../types';

export type CiteStyle = 'uqam' | 'uqam-prenoms' | 'apa-en';

export const CITE_STYLES: Record<CiteStyle, string> = {
  uqam: 'APA 7 – adaptation UQAM (initiales)',
  'uqam-prenoms': 'APA 7 – adaptation UQAM avec prénoms',
  'apa-en': 'APA 7 (anglais)',
};

export type FieldId =
  | 'itemType'
  | 'creators'
  | 'date'
  | 'title'
  | 'publication'
  | 'volume'
  | 'issue'
  | 'pages'
  | 'doi'
  | 'url'
  | 'publisher'
  | 'bookTitle'
  | 'editors';

export const FIELD_LABELS: Record<FieldId, string> = {
  itemType: 'Type de document',
  creators: 'Auteurs',
  date: 'Date',
  title: 'Titre',
  publication: 'Revue / site',
  volume: 'Volume',
  issue: 'Numéro',
  pages: 'Pages',
  doi: 'DOI',
  url: 'URL',
  publisher: 'Éditeur / organisme',
  bookTitle: 'Titre du livre',
  editors: 'Directeurs (dir.)',
};

export interface Issue {
  field: FieldId;
  /** « manque » : information absente ; « forme » : présente mais pas comme la norme le demande ; « conseil » : facultatif. */
  kind: 'manque' | 'forme' | 'conseil';
  text: string;
}

/** Champs attendus par type de document (cas les plus courants de l'APA 7). */
export const EXPECTED: Record<string, FieldId[]> = {
  journalArticle: ['creators', 'date', 'title', 'publication', 'volume', 'issue', 'pages', 'doi'],
  book: ['creators', 'date', 'title', 'publisher'],
  bookSection: ['creators', 'date', 'title', 'editors', 'bookTitle', 'pages', 'publisher'],
  report: ['creators', 'date', 'title', 'publisher', 'url'],
  thesis: ['creators', 'date', 'title', 'publisher', 'url'],
  webpage: ['creators', 'date', 'title', 'publication', 'url'],
};

const people = (r: RecordItem, type: string) => r.creators.filter((c) => (c.creatorType ?? 'author') === type);
const isAllCaps = (s: string) => s.length > 12 && s === s.toUpperCase() && /[A-ZÉ]/.test(s);
const looksAbbreviated = (s: string) => /\b[A-Z][a-z]{0,4}\b(\s|$)/.test(s) && !/\s(de|du|des|la|le|of|and|et)\s/i.test(s) && s.split(/\s+/).every((w) => w.length <= 6);

export function fieldValue(r: RecordItem, f: FieldId): string {
  switch (f) {
    case 'itemType':
      return r.itemType;
    case 'creators':
      return people(r, 'author').map(creatorText).join(' ; ');
    case 'editors':
      return people(r, 'editor').map(creatorText).join(' ; ');
    case 'date':
      return r.date;
    case 'title':
      return r.title;
    case 'publication':
      return r.itemType === 'bookSection' ? '' : r.publication;
    case 'volume':
      return r.volume ?? '';
    case 'issue':
      return r.issue ?? '';
    case 'pages':
      return r.pages;
    case 'doi':
      return r.doi;
    case 'url':
      return r.url;
    case 'publisher':
      return r.publisher ?? (['report', 'thesis'].includes(r.itemType) ? r.publication : '');
    case 'bookTitle':
      return r.bookTitle ?? '';
  }
}

export const creatorText = (c: Creator) => (c.name ? c.name : [c.lastName, c.firstName].filter(Boolean).join(', '));

const MISSING: Partial<Record<FieldId, string>> = {
  creators: 'Aucun auteur.',
  title: 'Pas de titre.',
  publication: 'Nom de la revue ou du site manquant.',
  volume: 'Volume manquant.',
  pages: 'Pages manquantes.',
  url: 'Adresse web (URL) manquante.',
  publisher: 'Éditeur ou organisme manquant.',
  bookTitle: 'Titre du livre manquant.',
  editors: 'Directeurs de l’ouvrage manquants.',
};

export function checkRecord(r: RecordItem, style: CiteStyle): Issue[] {
  const out: Issue[] = [];
  const expected = EXPECTED[r.itemType] ?? ['creators', 'date', 'title'];
  for (const f of expected) {
    if (fieldValue(r, f).trim()) continue;
    if (f === 'doi') out.push({ field: f, kind: 'manque', text: 'Pas de DOI. La plupart des articles récents en ont un : à vérifier.' });
    else if (f === 'issue') out.push({ field: f, kind: 'conseil', text: 'Numéro absent (à ajouter si la revue en a un).' });
    else if (f === 'date') out.push({ field: f, kind: 'manque', text: 'Pas de date : la référence affichera « s. d. » (sans date).' });
    else if (f === 'url' && r.itemType === 'thesis') out.push({ field: f, kind: 'conseil', text: 'Lien vers le dépôt institutionnel conseillé.' });
    else out.push({ field: f, kind: 'manque', text: MISSING[f] ?? `${FIELD_LABELS[f]} : à remplir.` });
  }
  // Ce qui est présent, mais pas comme la norme le demande.
  if (isAllCaps(r.title)) out.push({ field: 'title', kind: 'forme', text: 'Titre tout en majuscules : à écrire en minuscules (sauf la première lettre et les noms propres).' });
  if (r.itemType === 'journalArticle' && r.publication && looksAbbreviated(r.publication))
    out.push({ field: 'publication', kind: 'forme', text: 'Nom de revue abrégé : l’APA demande le nom complet.' });
  if (!r.doi && /doi\.org\/|^10\.\d{4,}/i.test(r.url)) out.push({ field: 'doi', kind: 'forme', text: 'Le DOI est rangé dans l’URL : à mettre dans la case DOI.' });
  if (r.pages && /^(p{1,2}\.)/i.test(r.pages.trim())) out.push({ field: 'pages', kind: 'forme', text: 'Écrire seulement les numéros (« 45-67 ») : le style ajoute lui-même « p. ».' });
  for (const c of r.creators) {
    if (!c.name && c.firstName && style === 'uqam-prenoms' && /^([A-ZÉ]\.\s?-?)+$/.test(c.firstName.trim())) {
      out.push({ field: 'creators', kind: 'forme', text: `Prénom en initiale (« ${creatorText(c)} ») : le style avec prénoms demande le prénom complet.` });
      break;
    }
  }
  for (const c of r.creators)
    if (c.lastName && c.firstName && /\b(institut|ministère|université|organisation|association|centre)\b/i.test(`${c.lastName} ${c.firstName}`)) {
      out.push({ field: 'creators', kind: 'forme', text: `« ${creatorText(c)} » est un organisme : à mettre en un seul champ (mode « nom unique »).` });
      break;
    }
  if (r.itemType === 'journalArticle' && !r.publication && !r.doi && r.url)
    out.push({ field: 'itemType', kind: 'forme', text: 'Enregistré comme article, mais sans revue : est-ce plutôt une page web ou un rapport ?' });
  return out;
}

export const issueCount = (issues: Issue[]) => issues.filter((i) => i.kind !== 'conseil').length;

// ---------------------------------------------------------------------------
// Aperçu de la référence. Dans la vraie version, c'est Zotero qui la met en forme
// (style « Université du Québec à Montréal - APA »), pour un résultat identique à Word.

function initials(first: string) {
  return first
    .split(/([\s-])/)
    .map((p) => (/^[\s-]$/.test(p) ? (p === '-' ? '-' : ' ') : p ? `${p[0]}.` : ''))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

function authorList(cs: Creator[], style: CiteStyle) {
  const fmt = (c: Creator) => (c.name ? c.name : `${c.lastName}, ${style === 'uqam-prenoms' ? c.firstName : initials(c.firstName ?? '')}`);
  const names = cs.map(fmt);
  if (names.length <= 1) return names.join('');
  const and = style === 'apa-en' ? '&' : 'et';
  return `${names.slice(0, -1).join(', ')} ${and} ${names[names.length - 1]}`;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const missing = (label: string) => `<span class="ref-missing">[${label} ?]</span>`;

/** Référence en HTML ; les parties manquantes sont signalées entre crochets. */
export function referenceHtml(r: RecordItem, style: CiteStyle): string {
  const fr = style !== 'apa-en';
  const au = people(r, 'author');
  const who = au.length ? esc(authorList(au, style)) : missing('auteur');
  const year = r.year ? String(r.year) : fr ? 's. d.' : 'n.d.';
  const title = r.title ? esc(r.title.replace(/\.$/, '')) : missing('titre');
  const doi = r.doi ? ` https://doi.org/${esc(r.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//, ''))}` : r.url ? ` ${esc(r.url)}` : '';
  const pages = r.pages ? esc(r.pages.replace(/-/g, '–')) : '';
  switch (r.itemType) {
    case 'journalArticle': {
      const vol = r.volume ? `, <i>${esc(r.volume)}</i>` : `, ${missing('volume')}`;
      const iss = r.issue ? `(${esc(r.issue)})` : '';
      return `${who} (${year}). ${title}. <i>${r.publication ? esc(r.publication) : missing('revue')}</i>${vol}${iss}${pages ? `, ${pages}` : `, ${missing('pages')}`}.${doi}`;
    }
    case 'bookSection': {
      const eds = people(r, 'editor');
      const ed = eds.length ? `${esc(eds.map((c) => (c.name ? c.name : `${initials(c.firstName ?? '')} ${c.lastName}`)).join(' et '))} (${fr ? 'dir.' : eds.length > 1 ? 'Eds.' : 'Ed.'}), ` : `${missing('dir.')} `;
      return `${who} (${year}). ${title}. ${fr ? 'Dans' : 'In'} ${ed}<i>${r.bookTitle ? esc(r.bookTitle) : missing('livre')}</i> (${fr ? 'p.' : 'pp.'} ${pages || missing('pages')}). ${r.publisher ? esc(r.publisher) : missing('éditeur')}.${doi}`;
    }
    case 'report':
    case 'thesis': {
      const kind = r.itemType === 'thesis' ? (fr ? ' [Thèse de doctorat]' : ' [Doctoral dissertation]') : '';
      const pub = fieldValue(r, 'publisher');
      const samePub = au.length === 1 && au[0].name && au[0].name === pub;
      return `${who} (${year}). <i>${title}</i>${kind}.${pub && !samePub ? ` ${esc(pub)}.` : pub ? '' : ` ${missing(r.itemType === 'thesis' ? 'université' : 'organisme')}.`}${doi || ` ${missing('URL')}`}`;
    }
    case 'webpage':
      return `${who} (${year}). <i>${title}</i>. ${r.publication ? `${esc(r.publication)}.` : missing('site')}${doi || ` ${missing('URL')}`}`;
    default:
      return `${who} (${year}). <i>${title}</i>. ${r.publisher ? `${esc(r.publisher)}.` : ''}${doi}`;
  }
}
