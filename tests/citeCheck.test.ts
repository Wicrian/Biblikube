import { describe, expect, it } from 'vitest';
import { checkRecord, referenceHtml } from '../src/lib/citeCheck';
import type { RecordItem } from '../src/types';

const rec = (o: Partial<RecordItem>): RecordItem => ({
  key: 'K', version: 1, itemType: 'journalArticle', title: 'Un titre', creators: [{ lastName: 'Roy', firstName: 'Mathieu', creatorType: 'author' }],
  date: '2020', year: 2020, abstract: '', doi: '', url: '', publication: '', language: '', pages: '', pageCount: null,
  zoteroTags: [], collections: [], sources: [], ...o,
});
const fields = (r: RecordItem) => checkRecord(r, 'uqam').map((i) => `${i.field}:${i.kind}`);

describe('vérification des fiches (APA 7 UQAM)', () => {
  it('article complet : rien à signaler', () => {
    const r = rec({ publication: 'Santé mentale au Québec', volume: '45', issue: '1', pages: '101-124', doi: '10.7202/1234ar' });
    expect(fields(r)).toEqual([]);
  });
  it('article incomplet : volume, pages et DOI manquants', () => {
    expect(fields(rec({ publication: 'Santé mentale au Québec' }))).toEqual(['volume:manque', 'issue:conseil', 'pages:manque', 'doi:manque']);
  });
  it('repère les mauvais types de document', () => {
    expect(fields(rec({ itemType: 'document' }))).toContain('itemType:forme');
    const web = rec({ itemType: 'webpage', doi: '10.1/x', websiteTitle: 'Journal of Things', url: 'https://doi.org/10.1/x' });
    expect(checkRecord(web, 'uqam').find((i) => i.field === 'itemType')?.text).toMatch(/Article de revue/);
    expect(checkRecord(rec({ itemType: 'report', title: 'Mémoire de maîtrise en travail social' }), 'uqam').some((i) => /Thèse/.test(i.text))).toBe(true);
    expect(checkRecord(rec({ itemType: 'webpage', url: 'https://x.org/rapport.pdf', websiteTitle: 'X' }), 'uqam').some((i) => /PDF/.test(i.text))).toBe(true);
  });
  it('date de consultation : page web sans date, ou mauvais type', () => {
    const web = rec({ itemType: 'webpage', date: '', year: null, url: 'https://aqrp.org', websiteTitle: 'AQRP' });
    expect(fields(web)).toContain('accessDate:manque');
    const ok = { ...web, accessDate: '2026-10-12' };
    expect(fields(ok)).not.toContain('accessDate:manque');
    expect(referenceHtml(ok, 'uqam')).toContain('Récupéré le 12 octobre 2026 de https://aqrp.org');
    const doc = rec({ itemType: 'document', date: '', year: null, url: 'https://aqrp.org', accessDate: '2026-10-12' });
    expect(fields(doc)).toContain('accessDate:forme');
  });
  it('DOI rangé dans Extra', () => {
    expect(fields(rec({ publication: 'Revue X', volume: '1', pages: '1-2', doi: '10.1/x', doiInExtra: true }))).toContain('doi:forme');
  });
});
