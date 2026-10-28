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
    expect(f).toEqual(['number:manque', 'session:manque', 'url:manque']);
    const ok = toFicheRecord(item({ itemType: 'bill', title: 'Loi…', date: '2023', billNumber: '15', legislativeBody: 'Assemblée nationale du Québec', session: '1re session, 43e législature', url: 'https://www.assnat.qc.ca' }));
    expect(checkRecord(ok, 'uqam')).toEqual([]);
    expect(buildPatch(r, { number: { value: '15' }, authority: { value: 'Assemblée nationale du Québec' } }).patch).toEqual({ billNumber: '15', legislativeBody: 'Assemblée nationale du Québec' });
  });
  it('volume qui ressemble à une édition (chapitre Cairn)', () => {
    const r = toFicheRecord(item({ itemType: 'bookSection', title: 'Chapitre 22', creators: [{ creatorType: 'author', lastName: 'Étienne', firstName: 'Catherine' }], date: '2024', bookTitle: 'Développement du pouvoir d’agir', publisher: 'Presses de l’EHESP', pages: '297-304', volume: '3' }));
    const v = checkRecord(r, 'uqam').find((i) => i.field === 'volume');
    expect(v?.kind).toBe('conseil');
    expect(v?.text).toMatch(/3e éd\./);
    expect(buildPatch(r, { volume: { value: '' }, edition: { value: '3' } }).patch).toEqual({ volume: '', edition: '3' });
  });
  it('directeurs saisis nom et prénom séparés', () => {
    const r = toFicheRecord(item({ itemType: 'bookSection', title: 'Ch.', creators: [{ creatorType: 'author', lastName: 'Étienne', firstName: 'Catherine' }] }));
    const eds = [{ lastName: 'Jouffray', firstName: 'Claire', creatorType: 'editor' }, { lastName: '', firstName: '', creatorType: 'editor' }];
    expect(buildPatch(r, { editors: { value: 'Jouffray, Claire ; ', creators: eds } }).patch.creators).toEqual([
      { creatorType: 'author', firstName: 'Catherine', lastName: 'Étienne' },
      { creatorType: 'editor', firstName: 'Claire', lastName: 'Jouffray' },
    ]);
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
