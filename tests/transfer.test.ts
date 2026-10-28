import { describe, expect, it } from 'vitest';
import { demoProject } from '../src/lib/demo';
import { matchRecords, transferProject, transferSummary } from '../src/lib/transfer';
import type { RecordItem } from '../src/types';

/** La même revue copiée dans une autre bibliothèque : nouvelles clés, un article retiré, un ajouté. */
function copyOf(records: RecordItem[]) {
  const out = records
    .filter((r) => r.key !== 'DEMO0013')
    .map((r, i) => ({ ...r, key: `NEW${String(i).padStart(4, '0')}`, zoteroTags: [], collections: [] }));
  // Un titre légèrement modifié (accent perdu) et une année décalée.
  const t = out.find((r) => r.title.startsWith('Télésanté'))!;
  t.title = 'Telesante et suivi des maladies chroniques en region eloignee.';
  out.push({ ...out[0], key: 'NEWXTRA', title: 'Un article ajouté seulement dans la destination', doi: '' });
  return out;
}

describe('transfert vers une autre bibliothèque', () => {
  it('associe par DOI, puis par titre, et signale le reste', () => {
    const p = demoProject();
    const src = Object.values(p.records);
    const dst = copyOf(src);
    const m = matchRecords(src, dst);
    expect(m.unmatched).toEqual(['DEMO0013']);
    expect(m.newInTarget).toEqual(['NEWXTRA']);
    expect(Object.keys(m.pairs)).toHaveLength(src.length - 1);
    // Les deux notices en double (même DOI) vont chacune vers sa propre copie.
    expect(new Set(Object.values(m.pairs)).size).toBe(src.length - 1);
    expect(m.pairs.DEMO0001).toBe('NEW0000');
    expect(m.pairs.DEMO0002).toBe('NEW0001');
    expect(m.how.DEMO0001).toBe('doi');
    const tele = src.find((r) => r.title.startsWith('Télésanté'))!.key;
    expect(m.how[tele]).toBe('titre');
  });

  it('crée une nouvelle revue avec le travail rattaché aux nouvelles clés', () => {
    const p = demoProject();
    p.screening = {
      DEMO0001: { decision: 'include', reasons: ['Sujet pertinent'], note: 'clé', at: '2026-10-01T10:00:00Z' },
      DEMO0013: { decision: 'exclude', reasons: [], note: '', at: '2026-10-01T10:01:00Z' },
    };
    p.duplicates = { DEMO0002: 'DEMO0001' };
    p.organisation.categories = [{ id: 'c1', name: 'Cadre', parent: null, zoteroKey: 'OLDCOL', syncedName: 'Cadre' }];
    p.organisation.assignments = { DEMO0001: ['c1'] };
    p.zoteroCollections = { root: 'OLDROOT' };
    const dst = copyOf(Object.values(p.records));
    const m = matchRecords(Object.values(p.records), dst);
    const lib = { type: 'group' as const, id: '42', name: 'Groupe : Mémoire' };
    const np = transferProject(p, { library: lib, collection: { key: 'IDENT', name: 'Identification' }, records: dst, sources: p.sources, sourceMap: {}, libraryVersion: 9 }, m.pairs);
    expect(np.id).not.toBe(p.id);
    expect(np.library).toEqual(lib);
    expect(np.screening).toEqual({ NEW0000: p.screening.DEMO0001 });
    expect(np.duplicates).toEqual({ NEW0001: 'NEW0000' });
    expect(np.organisation.assignments).toEqual({ NEW0000: ['c1'] });
    expect(np.organisation.categories[0].zoteroKey).toBeNull();
    expect(np.organisation.structureDirty).toBe(true);
    expect(np.zoteroCollections).toEqual({});
    expect(np.sync.pending.sort()).toEqual(['NEW0000', 'NEW0001']);
    expect(Object.keys(np.records)).toHaveLength(dst.length);
    expect(transferSummary(p, m.pairs).screening).toEqual([1, 2]);
    // La revue d'origine n'est pas modifiée.
    expect(Object.keys(p.screening)).toEqual(['DEMO0001', 'DEMO0013']);
  });
});
