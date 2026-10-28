// Vérification des fiches Zotero selon une norme (APA 7, adaptation UQAM).
//
// Règles des cas les plus courants (version test). Biblikube ne « certifie » pas une
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
  | 'editors'
  | 'accessDate'
  | 'number'
  | 'authority'
  | 'session'
  | 'edition';

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
  accessDate: 'Consulté le',
  number: 'Numéro',
  authority: 'Assemblée / tribunal',
  session: 'Session et législature',
  edition: 'Édition',
};

/** Libellés selon le type de document (proches de ceux de Zotero). */
const LABELS_BY_TYPE: Record<string, Partial<Record<FieldId, string>>> = {
  journalArticle: { publication: 'Revue' },
  webpage: { publication: 'Site web' },
  blogPost: { publication: 'Blog' },
  report: { publisher: 'Organisme', number: 'Numéro du rapport' },
  thesis: { publisher: 'Université' },
  bill: { number: 'Numéro du projet de loi', authority: 'Assemblée (organe législatif)', publication: 'Code' },
  statute: { publication: 'Recueil', number: 'Chapitre', title: 'Nom de l’acte', date: 'Date de promulgation' },
  case: { title: 'Nom de l’affaire', date: 'Date de la décision', publication: 'Recueil', number: 'Numéro de dossier', authority: 'Tribunal' },
};
export const fieldLabel = (itemType: string, f: FieldId) => LABELS_BY_TYPE[itemType]?.[f] ?? FIELD_LABELS[f];

/** Exemples affichés dans les cases à remplir. */
const EXAMPLES: Record<string, Partial<Record<FieldId, string>>> = {
  bill: { number: 'ex. 15 (Québec) ou C-11 (fédéral)', session: 'ex. 1re session, 43e législature' },
  statute: { publication: 'ex. RLRQ, LQ ou LRC 1985', number: 'ex. S-4.2' },
  bookSection: { edition: 'ex. 3' },
  book: { edition: 'ex. 3' },
};
export const fieldExample = (itemType: string, f: FieldId) => EXAMPLES[itemType]?.[f];

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
  blogPost: ['creators', 'date', 'title', 'publication', 'url'],
  newspaperArticle: ['creators', 'date', 'title', 'publication'],
  magazineArticle: ['creators', 'date', 'title', 'publication'],
  document: ['creators', 'date', 'title'],
  // Documents juridiques : pas d'auteur exigé.
  // Lois et projets de loi : guide de l'UQAM (inspiré du Manuel canadien de la référence juridique).
  bill: ['number', 'title', 'date', 'session', 'url'],
  statute: ['title', 'publication', 'number', 'url'],
  case: ['title', 'authority', 'date', 'publication', 'number'],
};

/** Types dont Biblikube connaît les règles ; pour les autres, seuls le titre et la date sont vérifiés. */
export const isKnownType = (t: string) => t in EXPECTED;

/** Champs facultatifs selon le type (signalés comme conseil). */
const OPTIONAL: Record<string, FieldId[]> = { case: ['publication', 'number'], thesis: ['url'] };

export const LEGAL_TYPES = ['bill', 'statute', 'case'];

/** Types à qui l'APA réserve « Récupéré le [date de consultation] » dans le style UQAM. */
const TYPE_FR: Record<string, string> = {
  journalArticle: 'Article de revue',
  book: 'Livre',
  bookSection: 'Chapitre de livre',
  report: 'Rapport',
  thesis: 'Thèse',
  webpage: 'Page web',
  document: 'Document',
  blogPost: 'Billet de blog',
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
      if (r.itemType === 'webpage') return r.websiteTitle ?? (r.publication || '');
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
      if (r.itemType === 'report') return r.institution ?? r.publisher ?? r.publication;
      if (r.itemType === 'thesis') return r.university ?? r.publisher ?? r.publication;
      return r.publisher ?? '';
    case 'accessDate':
      return formatAccess(r.accessDate);
    case 'number':
      return r.number ?? '';
    case 'authority':
      return r.authority ?? '';
    case 'session':
      return r.session ?? '';
    case 'edition':
      return r.edition ?? '';
    case 'bookTitle':
      return r.bookTitle ?? '';
  }
}

/** « 2026-10-12 14:00:00 » → « 12 octobre 2026 ». */
export function formatAccess(v?: string): string {
  const m = (v ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return v ?? '';
  return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString('fr-CA', { day: 'numeric', month: 'long', year: 'numeric' });
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
  const expected = EXPECTED[r.itemType] ?? ['date', 'title'];
  for (const f of expected) {
    if (fieldValue(r, f).trim()) continue;
    if (f === 'doi') out.push({ field: f, kind: 'manque', text: 'Pas de DOI. La plupart des articles récents en ont un : à vérifier.' });
    else if (f === 'issue') out.push({ field: f, kind: 'conseil', text: 'Numéro absent (à ajouter si la revue en a un).' });
    else if (f === 'date' && ['webpage', 'blogPost', 'document'].includes(r.itemType))
      out.push({ field: f, kind: 'conseil', text: 'Pas de date : vérifiez s’il y en a une sur la page. Sinon, « s. d. » (sans date) est correct.' });
    else if (f === 'date') out.push({ field: f, kind: 'manque', text: 'Pas de date : la référence affichera « s. d. » (sans date).' });
    else if (f === 'url' && r.itemType === 'thesis') out.push({ field: f, kind: 'conseil', text: 'Lien vers le dépôt institutionnel conseillé.' });
    else if (OPTIONAL[r.itemType]?.includes(f)) out.push({ field: f, kind: 'conseil', text: `${fieldLabel(r.itemType, f)} : à ajouter si vous l’avez.` });
    else out.push({ field: f, kind: 'manque', text: MISSING[f] ?? `${fieldLabel(r.itemType, f)} : à remplir.` });
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
  if (r.itemType === 'journalArticle' && r.doiInExtra) out.push({ field: 'doi', kind: 'forme', text: 'Le DOI est rangé dans « Extra » : à mettre dans la case DOI.' });
  if (['book', 'bookSection'].includes(r.itemType) && r.volume && !r.edition && /^\d{1,2}$/.test(r.volume.trim()))
    out.push({
      field: 'volume',
      kind: 'conseil',
      text: `Volume « ${r.volume} » : s’agit-il plutôt de l’édition (${r.volume}${r.volume.trim() === '1' ? 're' : 'e'} éd.) ? Cairn et d’autres plateformes confondent souvent les deux. Si oui, videz « Volume » et mettez ${r.volume} dans « Édition ».`,
    });
  out.push(...typeIssues(r));
  out.push(...accessIssues(r));
  if (r.itemType === 'journalArticle' && !r.publication && !r.doi && r.url)
    out.push({ field: 'itemType', kind: 'forme', text: 'Enregistré comme article, mais sans revue : est-ce plutôt une page web ou un rapport ?' });
  return out;
}

const PDF_URL = /\.pdf($|[?#])/i;
const THESIS_WORDS = /\b(thèse|mémoire de maîtrise|mémoire \(|thesis|dissertation)\b/i;
const JOURNAL_WORDS = /\b(journal|revue|review|annals|bulletin|quarterly)\b/i;

/** Mauvais type de document : les cas les plus fréquents. */
function typeIssues(r: RecordItem): Issue[] {
  const t = r.itemType;
  const msg = (likely: string, why: string): Issue => ({ field: 'itemType', kind: 'forme', text: `Type à vérifier : ${why}, c’est sans doute ${likely}.` });
  if (t === 'document')
    return [{ field: 'itemType', kind: 'forme', text: 'Type « Document » trop général : le style ne sait pas bien le présenter. Choisissez le vrai type (article, rapport, page web, chapitre…).' }];
  if (['webpage', 'report', 'blogPost'].includes(t) && (r.doi || /doi\.org\//i.test(r.url)) && JOURNAL_WORDS.test(fieldValue(r, 'publication') + ' ' + r.url))
    return [msg('un « Article de revue »', 'la fiche a un DOI et vient d’une revue')];
  if (t !== 'thesis' && THESIS_WORDS.test(`${r.title} ${r.publication}`)) return [msg('une « Thèse »', 'le titre parle de thèse ou de mémoire')];
  if (t === 'book' && (r.bookTitle || /^\d+\s*[-–]\s*\d+$/.test(r.pages.trim()))) return [msg('un « Chapitre de livre »', 'la fiche a des pages « de… à… » ou un titre de livre')];
  if (t === 'journalArticle' && r.isbn && !r.doi) return [msg('un « Livre » ou un « Chapitre de livre »', 'la fiche a un ISBN')];
  if (t === 'webpage' && PDF_URL.test(r.url)) return [msg('un « Rapport » ou un « Document »', 'le lien mène à un PDF')];
  return [];
}

/**
 * Date de consultation. Dans le style UQAM, « Récupéré le [date] de [URL] »
 * n'apparaît que pour une page web sans date de publication.
 */
function accessIssues(r: RecordItem): Issue[] {
  if (!r.url || r.doi) return [];
  if (r.itemType === 'webpage') {
    if (!r.date && !r.accessDate)
      return [{ field: 'accessDate', kind: 'manque', text: 'Page sans date : le style écrit « Récupéré le [date de consultation] de [URL] ». Remplissez « Consulté le ».' }];
    return [];
  }
  if (!r.date && r.accessDate && ['document', 'report', 'blogPost'].includes(r.itemType))
    return [
      {
        field: 'accessDate',
        kind: 'forme',
        text: `Avec le type « ${TYPE_FR[r.itemType] ?? r.itemType} », la date de consultation ne s’affiche pas. Si c’est une page web, changez le type en « Page web ».`,
      },
    ];
  return [];
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
      const loc = [
        r.edition ? `${esc(r.edition)}${fr ? (r.edition === '1' ? 're' : 'e') : 'th'} ${fr ? 'éd.' : 'ed.'}` : '',
        r.volume ? `vol. ${esc(r.volume)}` : '',
        `${fr ? 'p.' : 'pp.'} ${pages || missing('pages')}`,
      ].filter(Boolean).join(', ');
      return `${who} (${year}). ${title}. ${fr ? 'Dans' : 'In'} ${ed}<i>${r.bookTitle ? esc(r.bookTitle) : missing('livre')}</i> (${loc}). ${r.publisher ? esc(r.publisher) : missing('éditeur')}.${doi}`;
    }
    case 'report':
    case 'thesis': {
      const kind = r.itemType === 'thesis' ? (fr ? ' [Thèse de doctorat]' : ' [Doctoral dissertation]') : '';
      const pub = fieldValue(r, 'publisher');
      const samePub = au.length === 1 && au[0].name && au[0].name === pub;
      return `${who} (${year}). <i>${title}</i>${kind}.${pub && !samePub ? ` ${esc(pub)}.` : pub ? '' : ` ${missing(r.itemType === 'thesis' ? 'université' : 'organisme')}.`}${doi || ` ${missing('URL')}`}`;
    }
    case 'webpage': {
      const site = fieldValue(r, 'publication');
      const link = r.url ? (!r.year && r.accessDate ? ` ${fr ? 'Récupéré le' : 'Retrieved'} ${esc(formatAccess(r.accessDate))} ${fr ? 'de' : 'from'} ${esc(r.url)}` : ` ${esc(r.url)}`) : ` ${missing('URL')}`;
      return `${who} (${year}). <i>${title}</i>. ${site ? `${esc(site)}.` : missing('site')}${link}`;
    }
    case 'bill': {
      // « Projet de loi 15, Titre (2023), 1re session, 43e législature. URL » (guide UQAM).
      const sess = r.session ? `, ${esc(r.session)}` : `, ${missing('session et législature')}`;
      return `Projet de loi ${r.number ? esc(r.number) : missing('numéro')}, <i>${title}</i> (${r.year ?? missing('année')})${sess}.${r.url ? ` ${esc(r.url)}` : ` ${missing('URL')}`}`;
    }
    case 'statute':
      // « Titre, RLRQ, c. S-4.2. URL » (guide UQAM).
      return `<i>${title}</i>, ${r.publication ? esc(r.publication) : missing('recueil')}, c. ${r.number ? esc(r.number) : missing('chapitre')}.${r.url ? ` ${esc(r.url)}` : ` ${missing('URL')}`}`;
    case 'case':
      return `<i>${title}</i>, ${r.number ? esc(r.number) : ''}${r.authority ? ` (${esc(r.authority)})` : ` ${missing('tribunal')}`} (${year}).${r.url ? ` ${esc(r.url)}` : ''}`;
    default:
      return `${who} (${year}). <i>${title}</i>. ${r.publisher ? `${esc(r.publisher)}.` : ''}${doi}`;
  }
}
