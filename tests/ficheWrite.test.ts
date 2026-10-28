import { describe, expect, it } from 'vitest';
import { buildPatch, oldValuesNote, parseCreators } from '../src/lib/ficheWrite';
import { crossrefSuggestions, findDoi } from '../src/lib/crossref';
import { checkRecord } from '../src/lib/citeCheck';
import type { RecordItem } from '../src/types';

const rec = (o: Partial<RecordItem>): RecordItem => ({
  key: 'K', version: 3, itemType: 'journalArticle', title: 'Un titre', creators: [{ lastName: 'Smith', firstName: 'J.', creatorType: 'author' }],
  date: '2021', year: 2021, abstract: '', doi: '', url: '', publication: 'Int J Nurs Stud', language: '', pages: '', pageCount: null,
  zoteroTags: [], collections: [], sources: [], ...o,
});

describe('corriger une fiche depuis Biblikube', () => {
  it('n’envoie que les champs changés, avec le bon nom de champ Zotero', () => {
    const r = rec({});
    const { patch, changed } = buildPatch(r, { volume: { value: '119' }, publication: { value: 'Int J Nurs Stud' }, doi: { value: '10.1/x' } });
    expect(changed).toEqual(['volume', 'doi']);
    expect(patch).toEqual({ volume: '119', DOI: '10.1/x' });
    const web = rec({ itemType: 'webpage', publication: '' });
    expect(buildPatch(web, { publication: { value: 'AQRP' }, accessDate: { value: '2026-10-27' } }).patch).toEqual({ websiteTitle: 'AQRP', accessDate: '2026-10-27' });
    const report = rec({ itemType: 'report', publication: '' });
    expect(buildPatch(report, { publisher: { value: 'INSPQ' } }).patch).toEqual({ institution: 'INSPQ' });
  });
  it('auteurs : « Nom, Prénom », organisme sans virgule, directeurs gardés', () => {
    expect(parseCreators('Smith, John ; Institut national de santé publique du Québec', 'author')).toEqual([
      { lastName: 'Smith', firstName: 'John', creatorType: 'author' },
      { name: 'Institut national de santé publique du Québec', creatorType: 'author' },
    ]);
    const r = rec({ itemType: 'bookSection', creators: [{ lastName: 'Roy', firstName: 'M.', creatorType: 'author' }, { lastName: 'Côté', firstName: 'A.', creatorType: 'editor' }] });
    const { patch } = buildPatch(r, { creators: { value: 'Roy, Mathieu' } });
    expect(patch.creators).toEqual([
      { creatorType: 'author', firstName: 'Mathieu', lastName: 'Roy' },
      { creatorType: 'editor', firstName: 'A.', lastName: 'Côté' },
    ]);
  });
  it('note des anciennes valeurs', () => {
    const html = oldValuesNote(rec({}), ['publication', 'volume'], new Date(2026, 9, 27, 14, 5));
    expect(html).toContain('Biblikube – anciennes valeurs');
    expect(html).toContain('<strong>Revue</strong> : Int J Nurs Stud');
    expect(html).toContain('<strong>Volume</strong> : <em>(vide)</em>');
  });
});

describe('propositions', () => {
  it('trouve le DOI dans le texte d’un PDF', () => {
    expect(findDoi('Int J Nurs Stud 119 (2021) https://doi.org/10.1016/j.ijnurstu.2021.104012.')).toBe('10.1016/j.ijnurstu.2021.104012');
    expect(findDoi('DOI: 10.7202/1070241ar')).toBe('10.7202/1070241ar');
    expect(findDoi('Aucun identifiant ici')).toBeNull();
  });
  it('Crossref ne propose que pour les champs qui posent problème', () => {
    const r = rec({});
    const w = { DOI: '10.1/x', 'container-title': ['International Journal of Nursing Studies'], volume: '119', 'article-number': '104012', issued: { 'date-parts': [[2021]] } };
    const s = crossrefSuggestions(r, w, checkRecord(r, 'uqam'), 'crossref');
    expect(s.map((x) => [x.field, x.value])).toEqual([
      ['publication', 'International Journal of Nursing Studies'],
      ['volume', '119'],
      ['pages', '104012'],
    ]);
  });
});

describe('titre du livre venant de Crossref', () => {
  it('toujours « à vérifier », et au choix s’il y a plusieurs titres', () => {
    const r = { ...rec({}), itemType: 'bookSection', publication: '', bookTitle: undefined };
    const issues = checkRecord(r, 'uqam');
    const one = crossrefSuggestions(r, { DOI: '10.1/x', 'container-title': ['Politiques et interventions sociales'] }, issues, 'crossref');
    expect(one.find((s) => s.field === 'bookTitle')?.source).toBe('crossref-book');
    const two = crossrefSuggestions(r, { DOI: '10.1/x', 'container-title': ['Politiques et interventions sociales', 'Développement du pouvoir d’agir'] }, issues, 'crossref');
    const b = two.find((s) => s.field === 'bookTitle')!;
    expect([b.value, b.choices?.length]).toEqual(['', 2]);
  });
});
