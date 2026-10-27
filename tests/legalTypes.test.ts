import { describe, expect, it } from 'vitest';
import { toRecord, toFicheRecord, itemTypeLabel } from '../src/zotero/mapping';
import { checkRecord, isKnownType } from '../src/lib/citeCheck';
import { buildPatch } from '../src/lib/ficheWrite';
import type { ZItem } from '../src/zotero/api';

const item = (data: Record<string, unknown>): ZItem => ({ key: 'K', version: 2, data: { key: 'K', version: 2, ...data } as ZItem['data'] });

describe('types juridiques et autres types Zotero', () => {
  it('lit le titre et la date d’un acte juridique et d’une affaire', () => {
    const loi = toRecord(item({ itemType: 'statute', nameOfAct: 'Loi sur la santé publique', dateEnacted: '2001', code: 'RLRQ', publicLawNumber: 'S-2.2' }), []);
    expect([loi.title, loi.year, loi.publication]).toEqual(['Loi sur la santé publique', 2001, 'RLRQ']);
    const cas = toRecord(item({ itemType: 'case', caseName: 'Chaoulli c. Québec', dateDecided: '2005-06-09', court: 'CSC' }), []);
    expect([cas.title, cas.year]).toEqual(['Chaoulli c. Québec', 2005]);
    expect(itemTypeLabel('statute')).toBe('Acte juridique');
  });
  it('projet de loi : numéro et assemblée vérifiés, pas d’auteur exigé', () => {
    const r = toFicheRecord(item({ itemType: 'bill', title: 'Loi visant à rendre le système de santé et de services sociaux plus efficace', date: '2023', billNumber: '', legislativeBody: '' }));
    const f = checkRecord(r, 'uqam').map((i) => `${i.field}:${i.kind}`);
    expect(f).toEqual(['number:manque', 'authority:manque', 'url:conseil']);
    const ok = toFicheRecord(item({ itemType: 'bill', title: 'Loi…', date: '2023', billNumber: '15', legislativeBody: 'Assemblée nationale du Québec', url: 'https://www.assnat.qc.ca' }));
    expect(checkRecord(ok, 'uqam')).toEqual([]);
    expect(buildPatch(r, { number: { value: '15' }, authority: { value: 'Assemblée nationale du Québec' } }).patch).toEqual({ billNumber: '15', legislativeBody: 'Assemblée nationale du Québec' });
  });
  it('écrit dans les bons champs pour un acte juridique', () => {
    const r = toFicheRecord(item({ itemType: 'statute', nameOfAct: 'Loi X', code: '' }));
    expect(buildPatch(r, { title: { value: 'Loi Y' }, publication: { value: 'RLRQ' } }).patch).toEqual({ nameOfAct: 'Loi Y', code: 'RLRQ' });
  });
  it('type sans règles : seuls le titre et la date', () => {
    const r = toFicheRecord(item({ itemType: 'podcast', title: 'Épisode 3', date: '' }));
    expect(isKnownType('podcast')).toBe(false);
    expect(checkRecord(r, 'uqam').map((i) => i.field)).toEqual(['date']);
  });
});
