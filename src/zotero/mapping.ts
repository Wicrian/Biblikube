import type { Project, RecordItem } from '../types';
import { parsePageCount, parseYear } from '../lib/text';
import type { ZItem } from './api';

// Selon le type de document, Zotero range le titre, la date, etc. dans des
// champs qui portent un autre nom (ex. « Nom de l'acte » pour un acte juridique).
const s_ = (d: ZItem['data'], ...keys: string[]) => {
  for (const k of keys) {
    const v = d[k];
    if (typeof v === 'string' && v.trim()) return v;
  }
  return '';
};
export const itemTitle = (d: ZItem['data']) => s_(d, 'title', 'nameOfAct', 'caseName', 'subject');
export const itemDate = (d: ZItem['data']) => s_(d, 'date', 'dateEnacted', 'dateDecided', 'issueDate');
const itemPublication = (d: ZItem['data']) =>
  s_(d, 'publicationTitle', 'bookTitle', 'proceedingsTitle', 'websiteTitle', 'blogTitle', 'forumTitle', 'encyclopediaTitle', 'dictionaryTitle', 'programTitle', 'code', 'reporter', 'university', 'institution', 'publisher');

/** Convertit un item Zotero en référence Biblikube, sans modifier aucun texte. */
export function toRecord(item: ZItem, sources: string[]): RecordItem {
  const d = item.data;
  return {
    key: item.key,
    version: item.version,
    itemType: d.itemType,
    title: itemTitle(d),
    creators: (d.creators ?? []).map((c) => ({
      firstName: c.firstName,
      lastName: c.lastName,
      name: c.name,
      creatorType: c.creatorType,
    })),
    date: itemDate(d),
    year: parseYear(itemDate(d)),
    abstract: d.abstractNote ?? '',
    doi: d.DOI ?? extractDoiFromExtra(d.extra ?? ''),
    url: d.url ?? '',
    publication: itemPublication(d),
    language: d.language ?? '',
    pages: d.pages ?? '',
    pageCount: parsePageCount(d.pages ?? '', d.numPages),
    zoteroTags: (d.tags ?? []).map((t) => t.tag),
    collections: d.collections ?? [],
    sources,
    bookTitle: str(d.bookTitle),
    publisher: str(d.publisher),
    isbn: str(d.ISBN),
    volume: str(d.volume),
    issue: str(d.issue),
    numChildren: item.meta?.numChildren ?? 0,
  };
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v : undefined);

function extractDoiFromExtra(extra: string): string {
  return extra.match(/^DOI:\s*(\S+)/im)?.[1] ?? '';
}

/**
 * Fusionne une nouvelle importation avec le projet : les métadonnées sont
 * rafraîchies, les décisions existantes sont conservées.
 */
export function mergeImport(p: Project, incoming: RecordItem[]): { project: Project; added: number; updated: number } {
  const records = { ...p.records };
  let added = 0;
  let updated = 0;
  for (const r of incoming) {
    if (records[r.key]) updated++;
    else added++;
    records[r.key] = r;
  }
  return { project: { ...p, records }, added, updated };
}

export const ITEM_TYPE_LABELS: Record<string, string> = {
  journalArticle: 'Article de revue',
  book: 'Livre',
  bookSection: 'Chapitre de livre',
  thesis: 'Thèse / mémoire',
  report: 'Rapport',
  conferencePaper: 'Communication de colloque',
  webpage: 'Page web',
  document: 'Document',
  preprint: 'Prépublication',
  magazineArticle: 'Article de magazine',
  newspaperArticle: 'Article de journal',
  manuscript: 'Manuscrit',
  presentation: 'Présentation',
  dataset: 'Jeu de données',
  blogPost: 'Billet de blog',
  encyclopediaArticle: 'Article d’encyclopédie',
  dictionaryEntry: 'Entrée de dictionnaire',
  statute: 'Acte juridique',
  bill: 'Projet de loi',
  case: 'Affaire (jugement)',
  hearing: 'Audience',
  patent: 'Brevet',
  letter: 'Lettre',
  email: 'Courriel',
  interview: 'Entretien',
  film: 'Film',
  audioRecording: 'Enregistrement audio',
  podcast: 'Balado',
  tvBroadcast: 'Émission de télévision',
  radioBroadcast: 'Émission de radio',
  artwork: 'Œuvre d’art',
  map: 'Carte',
  computerProgram: 'Logiciel',
  forumPost: 'Message de forum',
  instantMessage: 'Message instantané',
  videoRecording: 'Vidéo',
  standard: 'Norme',
};

export const itemTypeLabel = (t: string) => ITEM_TYPE_LABELS[t] ?? t;

/** Référence complète pour l'écran « Fiches » : ajoute les champs propres à chaque type. */
export function toFicheRecord(item: ZItem): RecordItem {
  const d = item.data;
  return {
    ...toRecord(item, []),
    accessDate: str(d.accessDate),
    websiteTitle: str(d.websiteTitle),
    institution: str(d.institution),
    university: str(d.university),
    doiInExtra: !d.DOI && !!extractDoiFromExtra(d.extra ?? ''),
    number: str(s_(d, 'billNumber', 'publicLawNumber', 'docketNumber', 'reportNumber', 'patentNumber', 'number')),
    authority: str(s_(d, 'legislativeBody', 'court', 'issuingAuthority')),
    session: str(d.session),
  };
}
