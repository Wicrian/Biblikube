// Enregistrer dans Zotero les corrections faites dans l'écran « Fiches ».
//
// Seuls les champs changés sont envoyés. Avant, Biblikube range les anciennes
// valeurs dans une note attachée à la fiche (« Biblikube – anciennes valeurs ») :
// Zotero ne garde pas d'historique, cette note permet de revenir en arrière.
import type { Creator, RecordItem } from '../types';
import type { ZItemData } from '../zotero/api';
import { FIELD_LABELS, fieldValue, type FieldId } from './citeCheck';

/** Champs modifiables depuis Biblikube (le type de document se change dans Zotero). */
export const EDITABLE: FieldId[] = ['creators', 'editors', 'date', 'title', 'publication', 'volume', 'issue', 'pages', 'doi', 'url', 'publisher', 'bookTitle', 'accessDate'];

/** Nom du champ Zotero selon le type de document (null : ce type n'a pas ce champ). */
export function zoteroField(itemType: string, f: FieldId): string | null {
  switch (f) {
    case 'title':
    case 'date':
    case 'url':
    case 'accessDate':
      return f;
    case 'publication':
      if (itemType === 'webpage') return 'websiteTitle';
      if (itemType === 'blogPost') return 'blogTitle';
      return ['journalArticle', 'newspaperArticle', 'magazineArticle'].includes(itemType) ? 'publicationTitle' : null;
    case 'volume':
      return ['journalArticle', 'magazineArticle', 'book', 'bookSection'].includes(itemType) ? 'volume' : null;
    case 'issue':
      return ['journalArticle', 'magazineArticle'].includes(itemType) ? 'issue' : null;
    case 'pages':
      return ['journalArticle', 'bookSection', 'report', 'newspaperArticle', 'magazineArticle'].includes(itemType) ? 'pages' : null;
    case 'doi':
      return ['journalArticle', 'conferencePaper'].includes(itemType) ? 'DOI' : null;
    case 'publisher':
      if (itemType === 'report') return 'institution';
      if (itemType === 'thesis') return 'university';
      return ['book', 'bookSection', 'document'].includes(itemType) ? 'publisher' : null;
    case 'bookTitle':
      return itemType === 'bookSection' ? 'bookTitle' : null;
    case 'creators':
    case 'editors':
      return 'creators';
    default:
      return null;
  }
}

export const canEdit = (r: RecordItem, f: FieldId) => EDITABLE.includes(f) && !!zoteroField(r.itemType, f) && !(f === 'editors' && r.itemType !== 'bookSection' && r.itemType !== 'book');

/** Valeur telle qu'on la modifie (date de consultation : AAAA-MM-JJ). */
export function editValue(r: RecordItem, f: FieldId): string {
  if (f === 'accessDate') return (r.accessDate ?? '').slice(0, 10);
  return fieldValue(r, f);
}

/** « Nom, Prénom ; Organisme » → personnes (sans virgule : nom d'organisme en un seul champ). */
export function parseCreators(text: string, creatorType: string): Creator[] {
  return text
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const i = s.indexOf(',');
      return i > 0 ? { lastName: s.slice(0, i).trim(), firstName: s.slice(i + 1).trim(), creatorType } : { name: s, creatorType };
    });
}

const zCreator = (c: Creator) =>
  c.name !== undefined && !c.lastName ? { creatorType: c.creatorType ?? 'author', name: c.name } : { creatorType: c.creatorType ?? 'author', firstName: c.firstName ?? '', lastName: c.lastName ?? '' };

export interface Edit {
  value: string;
  creators?: Creator[];
}

/** Champs Zotero à envoyer, d'après les valeurs changées. */
export function buildPatch(r: RecordItem, edits: Partial<Record<FieldId, Edit>>): { patch: Partial<ZItemData>; changed: FieldId[] } {
  const patch: Partial<ZItemData> = {};
  const changed: FieldId[] = [];
  let creators: Creator[] | null = null;
  for (const [f, e] of Object.entries(edits) as [FieldId, Edit][]) {
    if (!e || !canEdit(r, f) || e.value.trim() === editValue(r, f).trim()) continue;
    changed.push(f);
    if (f === 'creators' || f === 'editors') {
      const type = f === 'creators' ? 'author' : 'editor';
      const next = e.creators && creatorsMatch(e.creators, e.value) ? e.creators : parseCreators(e.value, type);
      const base: Creator[] = creators ?? r.creators;
      const others: Creator[] = base.filter((c) => (c.creatorType ?? 'author') !== type);
      creators = type === 'author' ? [...next, ...others] : [...others, ...next];
      continue;
    }
    patch[zoteroField(r.itemType, f)!] = e.value.trim();
  }
  if (creators) patch.creators = creators.map(zCreator);
  return { patch, changed };
}

const creatorsMatch = (cs: Creator[], text: string) => cs.map((c) => (c.name ? c.name : `${c.lastName}, ${c.firstName}`)).join(' ; ') === text.trim();

const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Note Zotero qui garde les anciennes valeurs. */
export function oldValuesNote(r: RecordItem, changed: FieldId[], when = new Date()): string {
  const date = when.toLocaleString('fr-CA', { dateStyle: 'long', timeStyle: 'short' });
  const rows = changed.map((f) => `<li><strong>${escHtml(FIELD_LABELS[f])}</strong> : ${escHtml(editValue(r, f)) || '<em>(vide)</em>'}</li>`).join('');
  return `<h2>Biblikube – anciennes valeurs</h2><p>Valeurs avant la correction du ${escHtml(date)} (écran « Fiches » de Biblikube). Pour revenir en arrière, recopiez-les dans la fiche.</p><ul>${rows}</ul>`;
}
