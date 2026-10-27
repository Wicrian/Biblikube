// Propositions de correction pour une fiche, avec leur source et leur fiabilité.
//
// MAQUETTE : les propositions « Crossref » et « PDF » sont simulées pour les
// références de démonstration. Dans la vraie version : Crossref (à partir du DOI
// ou du titre) et la première page du PDF rangé dans Zotero.
import type { Creator, RecordItem } from '../types';
import type { FieldId } from './citeCheck';
import { parseCreators } from './ficheWrite';

export type SuggestSource = 'crossref' | 'crossref-pdf' | 'crossref-title' | 'pdf' | 'rule' | 'none';

export const SOURCE_INFO: Record<SuggestSource, { icon: string; label: string; kind: 'sure' | 'check' | 'none' }> = {
  crossref: { icon: '✓', label: 'Trouvé avec le DOI (Crossref)', kind: 'sure' },
  'crossref-pdf': { icon: '⚠', label: 'Trouvé avec le DOI lu dans le PDF (Crossref) : à vérifier', kind: 'check' },
  'crossref-title': { icon: '⚠', label: 'Trouvé par le titre (Crossref) : vérifiez que c’est le bon article', kind: 'check' },
  pdf: { icon: '⚠', label: 'Lu dans le PDF : à vérifier', kind: 'check' },
  rule: { icon: '⚠', label: 'Correction de forme proposée par Biblikube : à vérifier', kind: 'check' },
  none: { icon: '✗', label: 'Rien trouvé : à remplir vous-même', kind: 'none' },
};

export interface Suggestion {
  field: FieldId;
  value: string;
  source: SuggestSource;
  /** Précision affichée sous la proposition. */
  note?: string;
  /** Pour les auteurs et directeurs. */
  creators?: Creator[];
}

/** Titre en minuscules, sauf la première lettre et après « : ». Les noms propres ne sont pas reconnus : à vérifier. */
export function sentenceCase(t: string): string {
  const low = t.toLocaleLowerCase('fr');
  return low.replace(/(^|:\s+)(\p{L})/gu, (_, a, b) => a + b.toLocaleUpperCase('fr'));
}

const DEMO: Record<string, Suggestion[]> = {
  DEMO0003: [
    { field: 'volume', value: '148', source: 'crossref-title', note: 'Recherche en soins infirmiers, 2022 · même titre et mêmes auteurs.' },
    { field: 'issue', value: '1', source: 'crossref-title' },
    { field: 'doi', value: '10.3917/rsi.148.0008', source: 'crossref-title' },
  ],
  DEMO0005: [
    { field: 'doi', value: '10.1016/j.ijnurstu.2021.104012', source: 'pdf', note: 'Lu en bas de la première page du PDF. Les infos ci-dessous viennent de Crossref grâce à ce DOI.' },
    { field: 'publication', value: 'International Journal of Nursing Studies', source: 'crossref', note: 'Nom complet de la revue.' },
    { field: 'creators', value: 'Smith, John ; Nguyen, Linh', source: 'crossref', creators: [{ lastName: 'Smith', firstName: 'John', creatorType: 'author' }, { lastName: 'Nguyen', firstName: 'Linh', creatorType: 'author' }] },
    { field: 'pages', value: '104012', source: 'crossref', note: 'Numéro d’article (la revue ne pagine pas).' },
    { field: 'volume', value: '119', source: 'crossref' },
  ],
  DEMO0006: [
    { field: 'volume', value: '45', source: 'pdf', note: 'En-tête du PDF : « Santé mentale au Québec, 2020, XLV, 1 ». Chiffres romains convertis.' },
    { field: 'issue', value: '1', source: 'pdf' },
    { field: 'doi', value: '', source: 'none', note: 'Ni Crossref ni le PDF n’indiquent de DOI. Il n’y en a peut-être pas : vérifiez sur Érudit.' },
  ],
  DEMO0007: [
    { field: 'volume', value: '215', source: 'crossref' },
    { field: 'issue', value: '1', source: 'crossref' },
  ],
  DEMO0015: [{ field: 'url', value: 'https://www.inspq.qc.ca/publications/rapport-sante-quebecois-2022', source: 'pdf', note: 'Adresse imprimée au verso de la couverture.' }],
  DEMO0016: [{ field: 'url', value: '', source: 'none', note: 'Pas de PDF dans Zotero. Cherchez la thèse dans CorpusUL (dépôt de l’Université Laval).' }],
  DEMO0019: [
    {
      field: 'editors',
      value: 'Provencher, Hélène ; Lecomte, Yves',
      source: 'pdf',
      note: 'Page de titre : « sous la direction de Hélène Provencher et Yves Lecomte ». Le chapitre est d’Yves Lecomte : vérifiez qu’il est aussi directeur.',
      creators: [{ lastName: 'Provencher', firstName: 'Hélène', creatorType: 'editor' }, { lastName: 'Lecomte', firstName: 'Yves', creatorType: 'editor' }],
    },
  ],
  DEMO0021: [
    { field: 'creators', value: '', source: 'none', note: 'Aucun auteur sur la page. En APA, l’organisme qui publie le site peut servir d’auteur : à vous de décider.' },
    { field: 'date', value: '', source: 'none', note: 'Aucune date sur la page : la référence affichera « s. d. ». C’est permis.' },
  ],
};

/** Propositions pour une fiche (règles de forme + sources extérieures simulées). */
export function suggestionsFor(r: RecordItem): Suggestion[] {
  const out: Suggestion[] = [...(DEMO[r.key] ?? [])];
  const has = (f: FieldId) => out.some((s) => s.field === f);
  if (r.title.length > 12 && r.title === r.title.toUpperCase() && !has('title'))
    out.unshift({ field: 'title', value: sentenceCase(r.title), source: 'rule', note: 'Remettez les majuscules des noms propres (sigles, lieux, personnes).' });
  if (!r.doi && /doi\.org\//i.test(r.url) && !has('doi')) out.push({ field: 'doi', value: r.url.replace(/^.*doi\.org\//i, ''), source: 'rule', note: 'Déplacé depuis l’URL.' });
  return out;
}

/** Fiche telle qu'elle serait après les corrections retenues. */
export function applySuggestions(r: RecordItem, values: Partial<Record<FieldId, { value: string; creators?: Creator[] }>>): RecordItem {
  const n: RecordItem = { ...r, creators: [...r.creators] };
  for (const [f, v] of Object.entries(values) as [FieldId, { value: string; creators?: Creator[] }][]) {
    if (!v || (!v.value && !v.creators)) continue;
    switch (f) {
      case 'creators':
        n.creators = [...(v.creators ?? parseCreators(v.value, 'author')), ...n.creators.filter((c) => (c.creatorType ?? 'author') !== 'author')];
        break;
      case 'editors':
        n.creators = [...n.creators.filter((c) => c.creatorType !== 'editor'), ...(v.creators ?? parseCreators(v.value, 'editor'))];
        break;
      case 'date':
        n.date = v.value;
        n.year = parseInt(v.value, 10) || null;
        break;
      case 'itemType':
        n.itemType = v.value;
        break;
      case 'publication':
        if (n.itemType === 'webpage') n.websiteTitle = v.value;
        else n.publication = v.value;
        break;
      case 'publisher':
        if (n.itemType === 'report') n.institution = v.value;
        else if (n.itemType === 'thesis') n.university = v.value;
        else n.publisher = v.value;
        break;
      default:
        (n as unknown as Record<string, string>)[f] = v.value;
    }
  }
  return n;
}
